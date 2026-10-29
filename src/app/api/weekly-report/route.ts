import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireUser } from "@/lib/supabase/require-user"
import { runCodex } from "@/lib/ai/codex"
import { WEEKLY_PAGE_KEYS, emptyWeeklySections, type WeeklyPageKey } from "@/lib/reports/weekly"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

type SourceEntry = { source: string; date: string; text: string; kind: "fact" | "plan" | "risk" }
type CoverageItem = { source: string; count: number; available: boolean }
// Supabase dynamic table queries cannot infer a shared row shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = Record<string, any>

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误"
}

async function loadWorkspaceSources(client: ReturnType<typeof getClient>, userId: string, startDate: string, endDate: string) {
  const startTimestamp = `${startDate}T00:00:00`
  const endTimestamp = `${endDate}T23:59:59.999`
  async function range(table: string, column: string, select: string, timestamp = true) {
    const start = timestamp ? startTimestamp : startDate
    const end = timestamp ? endTimestamp : endDate
    const { data, error } = await client.from(table).select(select).eq("user_id", userId).gte(column, start).lte(column, end)
    return { rows: error ? [] : (data || []) as unknown as DbRow[], available: !error }
  }
  async function completedTaskRange() {
    const { data, error } = await client.from("todos").select("title,completed_at,due_date,tags").eq("user_id", userId).gte("completed_at", startTimestamp).lte("completed_at", endTimestamp)
    return { rows: error ? [] : (data || []) as unknown as DbRow[], available: !error }
  }

  const [daily, contents, projects, ideas, research, meetings, knowledge, market, completedTasks] = await Promise.all([
    range("daily_reports", "date", "date,content,status", false),
    range("contents", "updated_at", "title,status,content_type,updated_at"),
    range("projects", "updated_at", "title,stage,status,next_action,risk,due_date,updated_at"),
    range("ideas", "updated_at", "title,status,market,genre,notes,updated_at"),
    range("research_items", "updated_at", "title,status,conclusion,next_action,due_date,updated_at"),
    range("meetings", "meeting_date", "title,meeting_type,summary,decisions,next_actions,meeting_date", false),
    range("knowledge_items", "updated_at", "title,item_type,category,updated_at"),
    range("market_data_imports", "created_at", "source_name,period_label,file_name,row_count,created_at"),
    completedTaskRange(),
  ])

  daily.rows = daily.rows.filter((row) => row.status === "final")
  const { data: pendingTaskRows, error: pendingTaskError } = await client.from("todos")
    .select("title,due_date,tags")
    .eq("user_id", userId)
    .eq("completed", false)
    .lte("due_date", endTimestamp)
    .order("due_date", { ascending: true })
    .limit(30)
  const pendingTasks = { rows: pendingTaskError ? [] : (pendingTaskRows || []) as DbRow[], available: !pendingTaskError }

  const entries: SourceEntry[] = [
    ...daily.rows.map((row) => ({ source: "定稿日报", date: row.date, text: row.content, kind: "fact" as const })),
    ...contents.rows.map((row) => ({ source: "责编审稿", date: row.updated_at, text: `${row.title}：${row.status}`, kind: "fact" as const })),
    ...projects.rows.flatMap((row) => [
      { source: "项目推进", date: row.updated_at, text: `${row.title}：${row.stage || "已更新"}${row.status ? `（${row.status}）` : ""}`, kind: "fact" as const },
      ...(row.next_action ? [{ source: "项目推进", date: row.due_date || row.updated_at, text: `${row.title}：${row.next_action}`, kind: "plan" as const }] : []),
      ...(row.risk ? [{ source: "项目推进", date: row.updated_at, text: `${row.title}：${row.risk}`, kind: "risk" as const }] : []),
    ]),
    ...ideas.rows.map((row) => ({ source: "选题", date: row.updated_at, text: `${row.title}：${row.status}${row.notes ? `，${row.notes}` : ""}`, kind: "fact" as const })),
    ...research.rows.flatMap((row) => [
      { source: "调研", date: row.updated_at, text: `${row.title}：${row.conclusion || row.status}`, kind: "fact" as const },
      ...(row.next_action ? [{ source: "调研", date: row.due_date || row.updated_at, text: `${row.title}：${row.next_action}`, kind: "plan" as const }] : []),
    ]),
    ...meetings.rows.flatMap((row) => [
      { source: "会议", date: row.meeting_date, text: `${row.title}：${row.decisions || row.summary || "已记录"}`, kind: "fact" as const },
      ...(row.next_actions ? [{ source: "会议", date: row.meeting_date, text: `${row.title}：${row.next_actions}`, kind: "plan" as const }] : []),
    ]),
    ...knowledge.rows.map((row) => ({ source: "知识学习", date: row.updated_at, text: `${row.title}（${row.item_type || row.category || "知识资料"}）`, kind: "fact" as const })),
    ...market.rows.map((row) => ({ source: "市场数据", date: row.created_at, text: `导入${row.source_name || row.file_name}${row.period_label ? `（${row.period_label}）` : ""}，${row.row_count || 0}条`, kind: "fact" as const })),
    ...completedTasks.rows.map((row) => ({ source: "已完成任务", date: row.completed_at, text: row.title, kind: "fact" as const })),
    ...pendingTasks.rows.map((row) => {
      const tags = Array.isArray(row.tags) ? row.tags as string[] : []
      const nextAction = tags.find((tag) => tag.startsWith("next_action:"))?.slice("next_action:".length)
      return { source: "待办与逾期", date: row.due_date || "", text: `${row.title}${nextAction ? `：${nextAction}` : ""}`, kind: "plan" as const }
    }),
  ]

  const coverage: CoverageItem[] = [
    ["定稿日报", daily], ["责编审稿", contents], ["项目推进", projects], ["选题", ideas], ["调研", research],
    ["会议", meetings], ["知识学习", knowledge], ["市场数据", market], ["已完成任务", completedTasks], ["待办与逾期", pendingTasks],
  ].map(([source, result]) => ({ source: source as string, count: (result as typeof daily).rows.length, available: (result as typeof daily).available }))

  return { entries, coverage }
}

// GET: fetch weekly reports history or auto-aggregate daily reports
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get("start")
  const endDate = searchParams.get("end")

  try {
    const { user, response } = await requireUser()
    if (response) return response

    const client = getClient()

    if (startDate && endDate) {
      // Aggregate daily reports for the week
      const { data, error } = await client
        .from("daily_reports")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "final")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true })

      if (error) throw error
      const workspace = await loadWorkspaceSources(client, user.id, startDate, endDate)
      return NextResponse.json({ reports: data || [], startDate, endDate, ...workspace })
    } else {
      // Fetch weekly report history
      const { data, error } = await client
        .from("weekly_reports")
        .select("*")
        .eq("user_id", user.id)
        .order("week_start", { ascending: false })
        .limit(10)

      if (error) throw error
      return NextResponse.json({ reports: data || [] })
    }
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

// POST: save weekly report
export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const body = await request.json()
    const { weekStart, weekEnd, content, summary, status = "draft" } = body

    if (!weekStart || !weekEnd || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const client = getClient()

    // Check existing
    const { data: existing } = await client
      .from("weekly_reports")
      .select("id")
      .eq("week_start", weekStart)
      .eq("user_id", user.id)
      .maybeSingle()

    let result
    if (existing) {
      const { data, error } = await client
        .from("weekly_reports")
        .update({ content, summary, exported: status === "final", updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single()
      if (error) throw error
      result = data
    } else {
      const { data, error } = await client
        .from("weekly_reports")
        .insert({ user_id: user.id, week_start: weekStart, week_end: weekEnd, content, summary, exported: status === "final" })
        .select()
        .single()
      if (error) throw error
      result = data
    }

    return NextResponse.json({ report: result })
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

// PUT: AI-generate weekly report from daily reports
export async function PUT(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const { weekStart, weekEnd, entries: suppliedEntries, manualNotes = "", targetPage } = await request.json()
    if (!weekStart || !weekEnd) return NextResponse.json({ error: "请选择周区间" }, { status: 400 })

    const workspace = suppliedEntries?.length
      ? { entries: suppliedEntries as SourceEntry[] }
      : await loadWorkspaceSources(getClient(), user.id, weekStart, weekEnd)
    if (!workspace.entries.length && !manualNotes.trim()) return NextResponse.json({ error: "所选周暂无可用记录，请先补充信息" }, { status: 400 })

    const startLabel = formatDateLabel(weekStart)
    const endLabel = formatDateLabel(weekEnd)
    const combined = workspace.entries.map((item) => `[${item.kind === "fact" ? "事实" : item.kind === "plan" ? "计划" : "风险"}｜${item.source}｜${item.date || "未标日期"}] ${item.text}`).join("\n")
    const requestedPages = targetPage && WEEKLY_PAGE_KEYS.includes(targetPage as WeeklyPageKey)
      ? [targetPage as WeeklyPageKey]
      : WEEKLY_PAGE_KEYS

    const prompt = `你是工作周报编辑。根据工作台真实记录，生成可直接粘贴到既有PPT模板的正文文案。

## 本周日期
${startLabel} 至 ${endLabel}

## 工作台记录
${combined}

## 用户手动补充
${manualNotes.trim() || "（无）"}

## 只输出以下页面
${requestedPages.map((key) => {
  if (key === "p4") return `[P4]\n使用纯文本表格：模块｜完成情况｜进度｜备注。合并重复事项，突出实际交付；每个单元格保持简短。\n[/P4]`
  if (key === "p7") return `[P7]\n提炼1–2项真实问题。每项固定写：具体表现：…；原因：…；改进动作：…。\n[/P7]`
  if (key === "p8") return `[P8]\n使用纯文本表格：模块｜计划内容｜进度目标｜备注。只使用标记为计划的记录或用户补充，优先待办与未完成事项。\n[/P8]`
  return `[P9]\n不超过3条。每条固定写：本周发现：…；判断：…；后续改善：…。\n[/P9]`
}).join("\n\n")}

## 约束
- 只基于提供的记录，不虚构、不推断完成结果；缺少依据的模块直接省略
- 严格区分事实、计划和风险，不把计划写成已完成
- 表格用竖线分隔，保留表头，不使用Markdown分隔行
- 每个页面内容控制在PPT单页可读范围，语言成熟、具体、简洁
- 仅输出上述页面标签及标签内文案，不要输出解释`

    const result = await runCodex(prompt, 60000)
    const sections = emptyWeeklySections()
    requestedPages.forEach((key) => {
      const tag = key.toUpperCase()
      const title = key === "p4" ? "本周工作完成情况" : key === "p7" ? "存在问题及改进事项" : key === "p8" ? "下周工作计划" : "复盘结论与改善计划"
      const nextKey = WEEKLY_PAGE_KEYS[WEEKLY_PAGE_KEYS.indexOf(key) + 1]
      const nextTag = nextKey?.toUpperCase()
      const tagged = result.match(new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, "i"))?.[1]
      const headed = result.match(new RegExp(`(?:^|\\n)(?:#{1,3}\\s*)?(?:${tag}\\s*(?:${title})?|${title})\\s*\\n([\\s\\S]*?)${nextTag ? `(?=\\n(?:#{1,3}\\s*)?(?:\\[?${nextTag}\\]?|${nextKey === "p7" ? "存在问题及改进事项" : nextKey === "p8" ? "下周工作计划" : "复盘结论与改善计划"}))` : "$"}`, "i"))?.[1]
      sections[key] = (tagged || headed || "").replace(new RegExp(`\\[\\/${tag}\\]`, "gi"), "").trim()
    })
    const missingPages = requestedPages.filter((key) => !sections[key])
    if (requestedPages.length === 1 && missingPages.length === 1 && result.trim()) {
      sections[requestedPages[0]] = result
        .replace(/^```(?:text|markdown)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .replace(new RegExp(`\\[\\/?${requestedPages[0].toUpperCase()}\\]`, "gi"), "")
        .trim()
      missingPages.length = 0
    }
    return NextResponse.json({ sections, missingPages })
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) || "生成失败" }, { status: 500 })
  }
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
