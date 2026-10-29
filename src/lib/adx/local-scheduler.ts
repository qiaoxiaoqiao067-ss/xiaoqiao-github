import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { execFile as execFileCallback } from "node:child_process"
import { promisify } from "node:util"
import { ADX_PLATFORM_NAMES, type AdxBoardType, type AdxRankType } from "./local-connector"

const execFile = promisify(execFileCallback)
const timeZone = "Asia/Shanghai"
const localDir = path.join(process.cwd(), ".local")
const configPath = path.join(localDir, "adx-scheduler.json")
const logPath = path.join(localDir, "adx-scheduler-runs.json")
const lockPath = path.join(localDir, "adx-scheduler.lock")
const launchAgentLabel = "com.codex.workbench.adx-sync"
const launchAgentPath = path.join(os.homedir(), "Library", "LaunchAgents", `${launchAgentLabel}.plist`)

export type AdxScheduleConfig = {
  enabled: boolean
  ownerUserId?: string
  enabledAt?: string
  rulesConfirmedAt?: string
}
export type AdxScheduleRun = {
  id: string
  rankType: AdxRankType
  boardType?: AdxBoardType
  platform?: string
  period: string
  attemptedAt: string
  status: "success" | "failed" | "skipped"
  rows?: number
  message: string
}

async function readConfig(): Promise<AdxScheduleConfig> {
  try { return JSON.parse(await fs.readFile(configPath, "utf8")) as AdxScheduleConfig }
  catch { return { enabled: false } }
}
async function writeConfig(config: AdxScheduleConfig) {
  await fs.mkdir(localDir, { recursive: true })
  const tempPath = `${configPath}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(config, null, 2), { mode: 0o600 })
  await fs.rename(tempPath, configPath)
  await fs.chmod(configPath, 0o600)
}
async function readRuns(): Promise<AdxScheduleRun[]> {
  try { return JSON.parse(await fs.readFile(logPath, "utf8")) as AdxScheduleRun[] }
  catch { return [] }
}
async function recordRun(run: AdxScheduleRun) {
  const previous = await readRuns()
  await fs.mkdir(localDir, { recursive: true })
  await fs.writeFile(logPath, JSON.stringify([run, ...previous].slice(0, 400), null, 2), { mode: 0o600 })
  await fs.chmod(logPath, 0o600)
}

export async function getAdxScheduleStatus(userId: string) {
  const config = await readConfig()
  const owned = config.ownerUserId === userId
  const runs = owned ? await readRuns() : []
  return {
    enabled: owned && config.enabled,
    rulesConfirmed: owned && Boolean(config.rulesConfirmedAt),
    nextRuns: owned && config.enabled ? ["每天 11:30 日榜", "每天 17:30 日榜补采", "每周二 11:30 周榜", "每周三 11:30 周榜补采", "每月 3 日 11:30 月榜", "每月 4 日 11:30 月榜补采"] : [],
    recentRuns: runs.slice(0, 20),
  }
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;")
}
function launchAgentContents(projectRoot: string) {
  const node = process.execPath
  const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs")
  const runner = path.join(projectRoot, "scripts", "adx-scheduler.ts")
  const output = path.join(projectRoot, ".local", "adx-scheduler-launchd.log")
  const intervals = [
    { Hour: 11, Minute: 30 },
    { Hour: 17, Minute: 30 },
  ]
  const intervalXml = intervals.map((interval) => `      <dict><key>Hour</key><integer>${interval.Hour}</integer><key>Minute</key><integer>${interval.Minute}</integer></dict>`).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${launchAgentLabel}</string>
  <key>ProgramArguments</key><array><string>${escapeXml(node)}</string><string>${escapeXml(tsxCli)}</string><string>${escapeXml(runner)}</string></array>
  <key>WorkingDirectory</key><string>${escapeXml(projectRoot)}</string>
  <key>EnvironmentVariables</key><dict><key>TZ</key><string>${timeZone}</string></dict>
  <key>StartCalendarInterval</key><array>
${intervalXml}
  </array>
  <key>StandardOutPath</key><string>${escapeXml(output)}</string>
  <key>StandardErrorPath</key><string>${escapeXml(output)}</string>
</dict></plist>`
}
async function unloadLaunchAgent() {
  if (process.platform !== "darwin") return
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined
  if (uid === undefined) return
  await execFile("launchctl", ["bootout", `gui/${uid}/${launchAgentLabel}`]).catch(() => undefined)
}
async function loadLaunchAgent(projectRoot: string) {
  if (process.platform !== "darwin") throw new Error("ADX 定时同步目前只支持 macOS 本机运行。")
  const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (currentTimeZone !== timeZone) throw new Error(`请先将 Mac 系统时区设为${timeZone}，当前为${currentTimeZone}；未启用定时任务。`)
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined
  if (uid === undefined) throw new Error("无法识别当前 macOS 用户会话，未启用定时任务。")
  const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs")
  const runner = path.join(projectRoot, "scripts", "adx-scheduler.ts")
  await fs.access(tsxCli)
  await fs.access(runner)
  await fs.mkdir(path.dirname(launchAgentPath), { recursive: true })
  await fs.mkdir(localDir, { recursive: true })
  await fs.writeFile(launchAgentPath, launchAgentContents(projectRoot), { mode: 0o600 })
  await fs.chmod(launchAgentPath, 0o600)
  await unloadLaunchAgent()
  await execFile("launchctl", ["bootstrap", `gui/${uid}`, launchAgentPath])
}

export async function updateAdxSchedule(userId: string, enabled: boolean, rulesConfirmed: boolean) {
  const previous = await readConfig()
  if (enabled && !rulesConfirmed) throw new Error("请先确认已核对 ADX 规则并允许此采集方式，定时任务才能启用。")
  if (enabled) {
    const { getAdxStatus } = await import("./local-connector")
    if (!(await getAdxStatus()).authenticated) throw new Error("请先打开 ADX 专用会话并确认当前登录有效，再启用定时同步。")
  }
  if (previous.ownerUserId && previous.ownerUserId !== userId && previous.enabled) throw new Error("本机 ADX 定时任务已绑定另一个工作台账号，请先用原账号关闭。")
  const next: AdxScheduleConfig = enabled
    ? { enabled: true, ownerUserId: userId, enabledAt: previous.enabled ? previous.enabledAt : new Date().toISOString(), rulesConfirmedAt: new Date().toISOString() }
    : { enabled: false, ownerUserId: userId, rulesConfirmedAt: previous.ownerUserId === userId ? previous.rulesConfirmedAt : undefined }
  await writeConfig(next)
  try {
    if (enabled) await loadLaunchAgent(process.cwd())
    else await unloadLaunchAgent()
  } catch (error) {
    await writeConfig(previous)
    throw error
  }
  return getAdxScheduleStatus(userId)
}

function shanghaiParts(date: Date) {
  const values = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => values.find((part) => part.type === type)?.value || "0"
  return { year: Number(value("year")), month: Number(value("month")), day: Number(value("day")), hour: Number(value("hour")), minute: Number(value("minute")) }
}
function utcCalendarDate(year: number, month: number, day: number) { return new Date(Date.UTC(year, month - 1, day)) }
function isoWeekLabel(date: Date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const year = utc.getUTCFullYear()
  const start = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((utc.getTime() - start.getTime()) / 86_400_000 + 1) / 7)
  return `${year}年第${week}周`
}
export function getPreviousAdxPeriod(rankType: AdxRankType, now: Date) {
  const { year, month, day } = shanghaiParts(now)
  const today = utcCalendarDate(year, month, day)
  if (rankType === "day") {
    today.setUTCDate(today.getUTCDate() - 1)
    return `${today.getUTCFullYear()}年${today.getUTCMonth() + 1}月${today.getUTCDate()}日`
  }
  if (rankType === "week") {
    const weekday = today.getUTCDay() || 7
    today.setUTCDate(today.getUTCDate() - weekday)
    return isoWeekLabel(today)
  }
  const previousMonth = utcCalendarDate(year, month - 1, 1)
  return `${previousMonth.getUTCFullYear()}年${previousMonth.getUTCMonth() + 1}月`
}
function scheduledAtForPeriod(rankType: AdxRankType, period: string) {
  let date: Date
  if (rankType === "day") {
    const match = period.match(/^(20\d{2})年(\d{1,2})月(\d{1,2})日$/)
    if (!match) return Number.POSITIVE_INFINITY
    date = utcCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
    date.setUTCDate(date.getUTCDate() + 1)
  } else if (rankType === "week") {
    const match = period.match(/^(20\d{2})年第(\d{1,2})周$/)
    if (!match) return Number.POSITIVE_INFINITY
    const year = Number(match[1]), week = Number(match[2])
    const jan4 = utcCalendarDate(year, 1, 4)
    date = new Date(jan4)
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + (week - 1) * 7 + 8)
  } else {
    const match = period.match(/^(20\d{2})年(\d{1,2})月$/)
    if (!match) return Number.POSITIVE_INFINITY
    const nextMonth = utcCalendarDate(Number(match[1]), Number(match[2]) + 1, 1)
    date = utcCalendarDate(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 3)
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 3, 30)
}
export function getScheduledAdxRankTypes(now: Date, runs: AdxScheduleRun[] = [], enabledAt?: string): AdxRankType[] {
  const { year, month, day, hour, minute } = shanghaiParts(now)
  const weekday = utcCalendarDate(year, month, day).getUTCDay()
  const after1130 = hour > 11 || (hour === 11 && minute >= 30)
  const after1730 = hour > 17 || (hour === 17 && minute >= 30)
  const types: AdxRankType[] = []
  const attempts = (rankType: AdxRankType, period: string) => runs.filter((run) => run.rankType === rankType && run.period === period && run.status === "failed").length
  const completed = (rankType: AdxRankType, period: string) => runs.some((run) => run.rankType === rankType && run.period === period && (run.status === "success" || run.status === "skipped"))
  const wasEnabledFor = (rankType: AdxRankType, period: string) => !enabledAt || new Date(enabledAt).getTime() <= scheduledAtForPeriod(rankType, period)
  const dayPeriod = getPreviousAdxPeriod("day", now)
  const weekPeriod = getPreviousAdxPeriod("week", now)
  const monthPeriod = getPreviousAdxPeriod("month", now)
  const dayAttempts = attempts("day", dayPeriod)
  if (after1130 && dayAttempts === 0 && !completed("day", dayPeriod) && wasEnabledFor("day", dayPeriod)) types.push("day")
  if (after1730 && dayAttempts === 1 && !completed("day", dayPeriod) && !types.includes("day") && wasEnabledFor("day", dayPeriod)) types.push("day")
  const weekAttempts = attempts("week", weekPeriod)
  if (after1130 && weekday >= 2 && weekAttempts === 0 && !completed("week", weekPeriod) && wasEnabledFor("week", weekPeriod)) types.push("week")
  if (after1130 && weekday >= 3 && weekAttempts === 1 && !completed("week", weekPeriod) && !types.includes("week") && wasEnabledFor("week", weekPeriod)) types.push("week")
  const monthAttempts = attempts("month", monthPeriod)
  if (after1130 && day >= 3 && monthAttempts === 0 && !completed("month", monthPeriod) && wasEnabledFor("month", monthPeriod)) types.push("month")
  if (after1130 && day >= 4 && monthAttempts === 1 && !completed("month", monthPeriod) && !types.includes("month") && wasEnabledFor("month", monthPeriod)) types.push("month")
  return types
}
function capFor(rankType: AdxRankType) { return rankType === "day" ? 50 : rankType === "week" ? 300 : 500 }
function sourceName(rankType: AdxRankType, boardType?: AdxBoardType, platform?: string) {
  if (boardType === "platform") return `ADX自动同步:${platform}平台榜`
  if (boardType === "tiktok-hot") return "ADX自动同步:TK短剧热播榜"
  if (boardType === "short-drama") return "ADX自动同步:短剧榜"
  return `ADX自动同步:${rankType === "day" ? "日榜" : rankType === "week" ? "周榜" : "月榜"}`
}
function notify(message: string) {
  if (process.platform !== "darwin") return
  const appleScriptString = JSON.stringify(message)
  void execFile("osascript", ["-e", `display notification ${appleScriptString} with title "ADX 自动同步"`]).catch(() => undefined)
}
function runRecord(rankType: AdxRankType, period: string, status: AdxScheduleRun["status"], message: string, rows?: number, boardType?: AdxBoardType, platform?: string): AdxScheduleRun {
  return { id: `${rankType}:${boardType || "legacy"}:${platform || ""}:${period}:${Date.now()}`, rankType, boardType, platform, period, attemptedAt: new Date().toISOString(), status, rows, message }
}

export function getScheduledAdxBoardTasks(now: Date, runs: AdxScheduleRun[] = [], enabledAt?: string) {
  const { year, month, day, hour, minute } = shanghaiParts(now)
  const weekday = utcCalendarDate(year, month, day).getUTCDay()
  const after1130 = hour > 11 || (hour === 11 && minute >= 30)
  const after1730 = hour > 17 || (hour === 17 && minute >= 30)
  const due: { rankType: AdxRankType; period: string; boardType: AdxBoardType; platform?: string }[] = []
  for (const rankType of ["day", "week", "month"] as const) {
    const period = getPreviousAdxPeriod(rankType, now)
    const initialWindow = rankType === "day" ? after1130 : after1130 && (rankType === "week" ? weekday >= 2 : day >= 3)
    const retryWindow = rankType === "day" ? after1730 : after1130 && (rankType === "week" ? weekday >= 3 : day >= 4)
    if (enabledAt && new Date(enabledAt).getTime() > scheduledAtForPeriod(rankType, period)) continue
    const boards: { boardType: AdxBoardType; platform?: string }[] = [
      { boardType: "short-drama" }, { boardType: "tiktok-hot" },
      ...ADX_PLATFORM_NAMES.map((platform) => ({ boardType: "platform" as const, platform })),
    ]
    for (const board of boards) {
      const taskRuns = runs.filter((run) => run.rankType === rankType && run.period === period && run.boardType === board.boardType && run.platform === board.platform)
      if (taskRuns.some((run) => run.status === "success" || run.status === "skipped")) continue
      if (taskRuns.length === 0 ? initialWindow : taskRuns.length === 1 && retryWindow) due.push({ rankType, period, ...board })
    }
  }
  return due
}

export async function runScheduledAdxJobs(now = new Date()) {
  const config = await readConfig()
  if (!config.enabled || !config.ownerUserId) return { ran: 0, skipped: "定时同步未启用" }
  await fs.mkdir(localDir, { recursive: true })
  let lock
  try { lock = await fs.open(lockPath, "wx", 0o600) }
  catch {
    const lockStat = await fs.stat(lockPath).catch(() => undefined)
    if (!lockStat || Date.now() - lockStat.mtimeMs < 30 * 60_000) return { ran: 0, skipped: "已有一个同步任务运行中" }
    await fs.unlink(lockPath).catch(() => undefined)
    try { lock = await fs.open(lockPath, "wx", 0o600) }
    catch { return { ran: 0, skipped: "已有一个同步任务运行中" } }
  }
  let ran = 0
  try {
    const existingLogs = await readRuns()
    const candidates = getScheduledAdxBoardTasks(now, existingLogs, config.enabledAt)
    if (!candidates.length) return { ran: 0, skipped: "当前不是计划运行时间" }
    const [{ closeAdxSession, recordAdxImport, syncAdxExport }, { serviceClient }] = await Promise.all([import("./local-connector"), import("@/lib/supabase/service")])
    for (const { rankType, period, boardType, platform } of candidates) {
      try {
        const { data: existing, error: queryError } = await serviceClient.from("market_data_imports").select("id").eq("user_id", config.ownerUserId).eq("source_name", sourceName(rankType, boardType, platform)).eq("period_label", period).limit(1)
        if (queryError) throw new Error(`检查已有导入失败：${queryError.message}`)
        if (existing?.length) {
          const skipped = runRecord(rankType, period, "skipped", "工作台中已有同来源、同周期数据，避免重复导入。", undefined, boardType, platform)
          await recordRun(skipped)
          existingLogs.unshift(skipped)
          continue
        }
        const result = await syncAdxExport(rankType, { expectedPeriod: period, scheduled: true, boardType, platform })
        if (result.period !== period) throw new Error(`页面周期与目标不一致（目标 ${period}，实际 ${result.period}），未写入。`)
        if (!result.rows.length || result.rows.length > capFor(rankType)) throw new Error(`返回 ${result.rows.length} 条，超出有效数量范围，未写入。`)
        const latestConfig = await readConfig()
        if (!latestConfig.enabled || latestConfig.ownerUserId !== config.ownerUserId) {
          const paused = runRecord(rankType, period, "skipped", "同步过程中定时任务已暂停，未写入工作台。", undefined, boardType, platform)
          await recordRun(paused)
          existingLogs.unshift(paused)
          continue
        }
        const marker = boardType === "platform" ? "__market_signal_platform" : boardType === "tiktok-hot" ? "__market_signal_tk" : "__market_signal_ad"
        const columns = Array.from(new Set([...result.columns, ...(platform ? ["平台"] : []), marker]))
        const rows = platform ? result.rows.map((row) => ({ ...row, 平台: platform })) : result.rows
        const { error: insertError } = await serviceClient.from("market_data_imports").insert({ user_id: config.ownerUserId, source_name: sourceName(rankType, boardType, platform), period_label: period, file_name: result.fileName, row_count: rows.length, columns, raw_rows: rows })
        if (insertError) throw new Error(`写入工作台失败：${insertError.message}`)
        await recordAdxImport(period, rows.length)
        const success = runRecord(rankType, period, "success", "周期、筛选与排序校验通过，已自动导入。", rows.length, boardType, platform)
        await recordRun(success)
        existingLogs.unshift(success)
        ran += 1
      } catch (error) {
        await closeAdxSession()
        const message = error instanceof Error ? error.message : "ADX 定时同步失败"
        const failed = runRecord(rankType, period, "failed", message, undefined, boardType, platform)
        await recordRun(failed)
        existingLogs.unshift(failed)
        notify((boardType === "platform" ? platform + "平台榜" : boardType === "tiktok-hot" ? "TK热播榜" : "短剧榜") + " " + rankType + " " + period + " 同步失败：" + message)
        if (/登录|验证码|专用 ADX|启动失败|页面.*改版|未提供.*排序|未确认.*筛选|未确认.*周期/i.test(message)) break
      }
    }
    await closeAdxSession()
    return { ran }
  } finally {
    await lock.close().catch(() => undefined)
    await fs.unlink(lockPath).catch(() => undefined)
  }
}
