import { NextResponse } from "next/server"
import { requireUser } from "@/lib/supabase/require-user"
import { ADX_PLATFORM_NAMES, closeAdxSession, recordAdxFailure, recordAdxImport, syncAdxExport, type AdxBoardType, type AdxRankType } from "@/lib/adx/local-connector"
import { serviceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

const rankLabel = (rankType: AdxRankType) => rankType === "day" ? "日榜" : rankType === "week" ? "周榜" : "月榜"
function sourceName(boardType: AdxBoardType, rankType: AdxRankType, platform?: string) {
  if (boardType === "platform") return `ADX自动同步:${platform}平台榜`
  if (boardType === "tiktok-hot") return `ADX自动同步:TK短剧热播榜`
  if (boardType === "short-drama") return `ADX自动同步:短剧榜`
  return `ADX自动同步:${rankLabel(rankType)}`
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser()
    if (response || !user) return response || NextResponse.json({ error: "工作台登录状态已失效，请重新登录后同步。" }, { status: 401 })
    const body = (await request.json().catch(() => ({}))) as { rankType?: string; dryRun?: boolean; boardType?: string; platform?: string; expectedPeriod?: string }
    const rankType: AdxRankType = body.rankType === "day" || body.rankType === "week" || body.rankType === "month" ? body.rankType : "week"
    const boardType: AdxBoardType = body.boardType === "short-drama" || body.boardType === "tiktok-hot" || body.boardType === "platform" ? body.boardType : "short-drama"
    const expectedPeriod = body.expectedPeriod?.trim()
    const periodPattern = rankType === "month" ? /^20\d{2}年(?:[1-9]|1[0-2])月$/ : rankType === "week" ? /^20\d{2}年第(?:[1-9]|[1-4]\d|5[0-3])周$/ : /^20\d{2}年(?:[1-9]|1[0-2])月(?:[1-9]|[12]\d|3[01])日$/
    if (expectedPeriod && !periodPattern.test(expectedPeriod)) return NextResponse.json({ error: `目标周期格式与${rankLabel(rankType)}不匹配。` }, { status: 400 })
    if (boardType === "platform" && body.platform && !(ADX_PLATFORM_NAMES as readonly string[]).includes(body.platform)) return NextResponse.json({ error: `不支持的平台：${body.platform}` }, { status: 400 })
    const platforms = boardType === "platform" ? body.platform ? [body.platform] : [...ADX_PLATFORM_NAMES] : [undefined]
    const completed: { platform?: string; rows: number; id?: string; skipped?: boolean }[] = []
    let verifiedPeriod = ""
    try {
      for (const platform of platforms) {
        const source = sourceName(boardType, rankType, platform)
        if (expectedPeriod && !body.dryRun) {
          const { data: alreadyImported, error: existingError } = await serviceClient.from("market_data_imports").select("id").eq("user_id", user.id).eq("source_name", source).eq("period_label", expectedPeriod).limit(1)
          if (existingError) throw new Error(`检查${platform || "榜单"}已有导入失败：${existingError.message}`)
          if (alreadyImported?.length) {
            verifiedPeriod = expectedPeriod
            completed.push({ platform, rows: 0, id: alreadyImported[0].id, skipped: true })
            continue
          }
        }
        const result = await syncAdxExport(rankType, { expectedPeriod, scheduled: true, boardType, platform })
        if (!result.rows.length || !result.columns.length || !result.period) throw new Error(`${platform ? `${platform}：` : ""}ADX没有返回可核验的有效数据。`)
        if (expectedPeriod && result.period !== expectedPeriod) throw new Error(`ADX页面周期${result.period}与目标${expectedPeriod}不一致，未导入。`)
        if (verifiedPeriod && verifiedPeriod !== result.period) throw new Error(`不同平台返回的周期不一致（${verifiedPeriod} / ${result.period}），已停止后续导入。`)
        verifiedPeriod = result.period
        if (body.dryRun) {
          completed.push({ platform, rows: result.rows.length })
          continue
        }
        const { data: existing, error: queryError } = await serviceClient.from("market_data_imports").select("id").eq("user_id", user.id).eq("source_name", source).eq("period_label", result.period).limit(1)
        if (queryError) throw new Error(`检查${platform || "榜单"}已有导入失败：${queryError.message}`)
        if (existing?.length) {
          completed.push({ platform, rows: 0, id: existing[0].id, skipped: true })
          continue
        }
        const marker = boardType === "platform" ? "__market_signal_platform" : boardType === "tiktok-hot" ? "__market_signal_tk" : "__market_signal_ad"
        const columns = Array.from(new Set([...result.columns, ...(platform ? ["平台"] : []), marker]))
        const rows = platform ? result.rows.map((row) => ({ ...row, 平台: platform })) : result.rows
        const { data, error: insertError } = await serviceClient.from("market_data_imports").insert({
          user_id: user.id,
          source_name: source,
          period_label: result.period,
          file_name: result.fileName || `ADX-${platform || boardType}-${result.period}.xlsx`,
          row_count: rows.length,
          columns,
          raw_rows: rows,
        }).select("id").single()
        if (insertError) throw new Error(`${platform ? `${platform}：` : ""}已读取${rows.length}条，但写入工作台失败：${insertError.message}`)
        await recordAdxImport(result.period, rows.length)
        completed.push({ platform, rows: rows.length, id: data.id })
      }
      const rowCount = completed.reduce((sum, item) => sum + item.rows, 0)
      return NextResponse.json({ imported: !body.dryRun, tested: Boolean(body.dryRun), period: verifiedPeriod, rowCount, platformCount: boardType === "platform" ? completed.length : undefined, completed, skippedCount: completed.filter((item) => item.skipped).length })
    } catch (error) {
      const reason = error instanceof Error ? error.message : "ADX同步失败"
      await recordAdxFailure(reason, "capture-or-import")
      return NextResponse.json({ error: reason, period: verifiedPeriod || undefined, completed, platformCount: boardType === "platform" ? completed.length : undefined, expectedPlatformCount: boardType === "platform" ? platforms.length : undefined, resumable: boardType === "platform" && completed.length > 0 }, { status: 500 })
    } finally {
      await closeAdxSession()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "ADX同步失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
