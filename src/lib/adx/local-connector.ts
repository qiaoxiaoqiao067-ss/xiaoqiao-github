import fs from "node:fs/promises"
import nodeFs from "node:fs"
import path from "node:path"
import * as XLSX from "xlsx"
import { chromium, type BrowserContext, type Page } from "playwright-core"

const ADX_URL = "https://oversea-v2.dataeye.com/playlet/playlet-rank"
const profileDir = path.join(process.cwd(), ".local", "adx-profile")
const stateFile = path.join(process.cwd(), ".local", "adx-connector.json")

type ConnectorState = { connectedAt?: string; lastAuthenticatedAt?: string; lastSyncAt?: string; lastPeriod?: string; lastRows?: number; lastError?: string; lastErrorCode?: string; lastErrorStage?: string }
type RankType = "day" | "week" | "month"
export type AdxBoardType = "short-drama" | "tiktok-hot" | "platform"
export const ADX_PLATFORM_NAMES = ["DramaBox", "DramaWave", "FreeReels", "GoodShort", "MoboReels", "NetShort", "ReelShort", "ShortMax", "Vigloo", "StardustTV", "PineDrama", "FlickReels"] as const
export function capAdxExportRows<T extends Record<string, unknown>>(rows: T[], rankType: RankType, platform?: string): (T & { 平台?: string })[] {
  const limit = rankType === "day" ? 50 : rankType === "week" ? 300 : 500
  return rows.slice(0, 5000).slice(0, limit).map((row) => platform ? { ...row, 平台: platform } : row)
}
const BOARD_LABELS: Record<AdxBoardType, string> = {
  "short-drama": "短剧排行榜",
  "tiktok-hot": "TikTok短剧热播榜",
  platform: "短剧平台榜",
}
export type AdxRankType = RankType
type AdxGlobal = typeof globalThis & { __adxContext?: BrowserContext; __adxContextPromise?: Promise<BrowserContext>; __adxPage?: Page; __adxCloseTimer?: ReturnType<typeof setTimeout>; __adxLoginMonitor?: ReturnType<typeof setInterval> }
const adxGlobal = globalThis as AdxGlobal
const syncLockPath = path.join(process.cwd(), ".local", "adx-sync.lock")

async function readState(): Promise<ConnectorState> {
  try { return JSON.parse(await fs.readFile(stateFile, "utf8")) as ConnectorState } catch { return {} }
}
async function writeState(patchValue: Partial<ConnectorState>) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true })
  await fs.writeFile(stateFile, JSON.stringify({ ...(await readState()), ...patchValue }, null, 2))
}
function chromeExecutable() {
  return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"].find(nodeFs.existsSync)
}
async function getContext() {
  const current = adxGlobal.__adxContext
  if (current) {
    try {
      const browser = current.browser()
      const hasOpenPage = current.pages().some((page) => !page.isClosed())
      if (browser ? browser.isConnected() : hasOpenPage) return current
    } catch {}
    adxGlobal.__adxContext = undefined
    adxGlobal.__adxPage = undefined
  }
  if (adxGlobal.__adxContextPromise) return adxGlobal.__adxContextPromise
  const launch = (async () => {
    await fs.mkdir(profileDir, { recursive: true })
    const executablePath = chromeExecutable()
    if (!executablePath) throw new Error("未找到 Google Chrome，请先安装或打开 Chrome。")
    const context = await chromium.launchPersistentContext(profileDir, { executablePath, headless: false, viewport: { width: 1440, height: 940 } })
    context.on("close", () => {
      if (adxGlobal.__adxContext === context) {
        adxGlobal.__adxContext = undefined
        adxGlobal.__adxPage = undefined
      }
    })
    adxGlobal.__adxContext = context
    return context
  })()
  adxGlobal.__adxContextPromise = launch
  try {
    return await launch
  } catch (error) {
    adxGlobal.__adxContext = undefined
    adxGlobal.__adxPage = undefined
    const message = error instanceof Error ? error.message : String(error)
    const lower = message.toLowerCase()
    const code = /singleton|user data directory|profile.*in use/i.test(lower) ? "profile_in_use"
      : /executable|chrome|edge|browser.*not found/i.test(lower) ? "browser_unavailable"
        : /permission|eacces|access denied/i.test(lower) ? "permission_denied"
          : /target page|context or browser has been closed/i.test(lower) ? "browser_closed"
            : "launch_failed"
    await writeState({ lastError: message, lastErrorCode: code, lastErrorStage: "launch" })
    throw new Error(`ADX 专用会话启动失败（${code}）：${message}`)
  } finally {
    if (adxGlobal.__adxContextPromise === launch) adxGlobal.__adxContextPromise = undefined
  }
}
async function getPage() {
  const context = await getContext()
  if (adxGlobal.__adxCloseTimer) clearTimeout(adxGlobal.__adxCloseTimer)
  adxGlobal.__adxCloseTimer = undefined
  if (adxGlobal.__adxPage && !adxGlobal.__adxPage.isClosed()) return adxGlobal.__adxPage
  const page = context.pages().find((candidate) => !candidate.isClosed()) || (await context.newPage())
  adxGlobal.__adxPage = page
  return page
}

async function isAuthenticatedAdxPage(page: Page) {
  if (!page.url().startsWith("https://oversea-v2.dataeye.com/")) return false
  const visiblePassword = page.locator('input[type="password"]:visible')
  if (await visiblePassword.count().catch(() => 0)) return false
  const loginDialog = page.locator('[role="dialog"]:visible').filter({ hasText: /登录/ }).last()
  if (await loginDialog.count().catch(() => 0)) return false
  const exportButton = page.getByRole("button", { name: /导出|export/i }).last()
  if (!(await exportButton.isVisible().catch(() => false))) return false
  // A real data row is positive evidence that the account can access the board;
  // labels behind the login overlay are not evidence of an authenticated session.
  return (await page.locator("table tbody tr:visible").count().catch(() => 0)) > 0
}
export async function closeAdxSession() {
  if (adxGlobal.__adxCloseTimer) clearTimeout(adxGlobal.__adxCloseTimer)
  if (adxGlobal.__adxLoginMonitor) clearInterval(adxGlobal.__adxLoginMonitor)
  adxGlobal.__adxCloseTimer = undefined
  adxGlobal.__adxLoginMonitor = undefined
  const context = adxGlobal.__adxContext
  adxGlobal.__adxContext = undefined
  adxGlobal.__adxPage = undefined
  await context?.close().catch(() => undefined)
}
async function recordAuthenticatedPage(page: Page) {
  if (!(await isAuthenticatedAdxPage(page))) return false
  await writeState({ lastAuthenticatedAt: new Date().toISOString(), lastError: "", lastErrorCode: "", lastErrorStage: "" })
  if (adxGlobal.__adxLoginMonitor) clearInterval(adxGlobal.__adxLoginMonitor)
  adxGlobal.__adxLoginMonitor = undefined
  // Keep the user-authenticated profile open between actions; a timer close made
  // the session appear to vanish before a capture could start.
  return true
}
function monitorLogin(page: Page) {
  if (adxGlobal.__adxLoginMonitor) clearInterval(adxGlobal.__adxLoginMonitor)
  adxGlobal.__adxLoginMonitor = setInterval(() => {
    if (page.isClosed()) {
      if (adxGlobal.__adxLoginMonitor) clearInterval(adxGlobal.__adxLoginMonitor)
      adxGlobal.__adxLoginMonitor = undefined
      return
    }
    void recordAuthenticatedPage(page).catch(() => undefined)
  }, 3000)
  adxGlobal.__adxLoginMonitor.unref?.()
}
async function withAdxSyncLock<T>(operation: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(syncLockPath), { recursive: true })
  let lock
  try { lock = await fs.open(syncLockPath, "wx", 0o600) }
  catch {
    const stat = await fs.stat(syncLockPath).catch(() => undefined)
    if (stat && Date.now() - stat.mtimeMs > 10 * 60_000) await fs.unlink(syncLockPath).catch(() => undefined)
    try { lock = await fs.open(syncLockPath, "wx", 0o600) }
    catch { throw new Error("已有另一个 ADX 同步任务正在使用本机浏览器会话，请等它结束后重试。") }
  }
  try { return await operation() }
  finally {
    await lock.close().catch(() => undefined)
    await fs.unlink(syncLockPath).catch(() => undefined)
  }
}

export async function openAdxLogin() {
  try {
    await writeState({ connectedAt: new Date().toISOString(), lastError: "", lastErrorCode: "", lastErrorStage: "launch" })
    const page = await getPage()
    await page.goto(ADX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 })
    await page.bringToFront()
    await page.waitForTimeout(1000)
    const authenticated = await isAuthenticatedAdxPage(page)
    await writeState({ lastError: authenticated ? "" : "ADX 专用窗口已打开，尚未登录。请在该窗口手动完成登录。", lastErrorCode: authenticated ? "" : "login_required", lastErrorStage: authenticated ? "" : "login" })
    if (authenticated) await recordAuthenticatedPage(page)
    else monitorLogin(page)
    return { url: page.url(), authenticated }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await writeState({ lastError: message, lastErrorCode: "connect_failed", lastErrorStage: "connect" })
    throw error
  }
}
export async function getAdxStatus() {
  const state = await readState()
  const page = adxGlobal.__adxPage
  const browserOpen = Boolean(page && !page.isClosed())
  const authenticated = browserOpen ? await recordAuthenticatedPage(page!) : false
  const recentlyVerified = Boolean(state.lastAuthenticatedAt && Date.now() - new Date(state.lastAuthenticatedAt).getTime() < 24 * 60 * 60_000)
  return { profileSaved: authenticated || recentlyVerified, profileExists: nodeFs.existsSync(profileDir), authenticated, browserOpen, ...state }
}
async function selectRankType(page: Page, rankType: RankType) {
  const label = rankType === "day" ? "日榜" : rankType === "month" ? "月榜" : "周榜"
  const option = page.getByText(label, { exact: true }).last()
  if (!(await option.isVisible().catch(() => false))) throw new Error(`ADX页面找不到${label}切换项，已停止同步。`)
  await option.click({ force: true })
  await page.waitForTimeout(1200)
}
async function selectBoardType(page: Page, boardType: AdxBoardType) {
  const label = BOARD_LABELS[boardType]
  const item = page.getByText(label, { exact: true }).first()
  if (!(await item.isVisible().catch(() => false))) throw new Error(`ADX页面找不到“${label}”入口，已停止同步。`)
  await item.click({ force: true })
  await page.waitForTimeout(1500)
  const body = await page.locator("body").innerText().catch(() => "")
  if (!body.includes(label)) throw new Error(`ADX未切换到“${label}”，已停止同步。`)
}
async function selectPlatform(page: Page, platform: string) {
  let option = page.getByText(platform, { exact: true }).first()
  if (!(await option.isVisible().catch(() => false))) {
    const more = page.getByRole("button", { name: "更多", exact: true }).first()
    if (await more.isVisible().catch(() => false)) await more.click({ force: true })
    option = page.getByText(platform, { exact: true }).first()
  }
  if (!(await option.isVisible().catch(() => false))) throw new Error(`ADX平台榜未显示“${platform}”选项，未导出该平台。`)
  await option.click({ force: true })
  const save = page.getByRole("button", { name: "保存", exact: true }).last()
  if (await save.isVisible().catch(() => false)) await save.click({ force: true })
  await page.waitForTimeout(900)
  const selected = await page.locator("body").innerText().catch(() => "")
  if (!selected.includes(platform)) throw new Error(`ADX未确认平台筛选“${platform}”，未导出该平台。`)
}
async function selectSortMetric(page: Page, boardType: AdxBoardType) {
  const wanted = boardType === "short-drama" ? /总素材数|素材总数|素材数量/ : /播放增量/
  const current = page.getByText(/按.*排序/).last()
  const currentText = await current.innerText().catch(() => "")
  if (wanted.test(currentText)) return
  if (!(await current.isVisible().catch(() => false))) throw new Error("ADX页面没有可核验的排序选择器，已停止导出。")
  await current.click({ force: true })
  const choice = boardType === "short-drama" ? page.getByText(/按.*(?:总素材数|素材总数|素材数量).*排序|总素材数|素材总数|素材数量/).last() : page.getByText(/按.*播放增量.*排序|播放增量/).last()
  if (!(await choice.isVisible().catch(() => false))) throw new Error(`ADX页面未提供${boardType === "short-drama" ? "总素材数" : "播放增量"}排序项，已停止导出。`)
  await choice.click({ force: true })
  await page.waitForTimeout(900)
  const selectedText = await page.getByText(/按.*排序/).last().innerText().catch(() => "")
  if (!wanted.test(selectedText)) throw new Error(`ADX未确认目标排序（当前：${selectedText || "未知"}），已停止导出。`)
}
async function enforceAiFilter(page: Page, strict = false) {
  const checkbox = page.getByRole("checkbox", { name: /AI仿真人/ }).last()
  if (await checkbox.count() && await checkbox.isVisible().catch(() => false)) {
    if (await checkbox.isChecked().catch(() => false)) return true
    await checkbox.check({ force: true })
    await page.waitForTimeout(1200)
    return await checkbox.isChecked().catch(() => false)
  }
  const source = page.getByText("制作来源", { exact: true }).last()
  if (!(await source.isVisible().catch(() => false))) return false
  const ai = page.getByText("AI仿真人", { exact: true }).last()
  await source.click({ force: true })
  if (await checkbox.count() && await checkbox.isVisible().catch(() => false)) {
    if (!(await checkbox.isChecked().catch(() => false))) await checkbox.check({ force: true })
    await page.waitForTimeout(1200)
    return await checkbox.isChecked().catch(() => false)
  }
  if (!(await ai.isVisible({ timeout: 2500 }).catch(() => false))) return false
  const selectedBeforeClick = await ai.evaluate((element) => {
    const node = element.closest('[aria-checked], [aria-selected], [aria-pressed], [role="option"], [role="checkbox"], [role="radio"]')
    const state = node?.getAttribute("aria-checked") || node?.getAttribute("aria-selected") || node?.getAttribute("aria-pressed")
    return state === "true"
  }).catch(() => false)
  if (selectedBeforeClick) return true
  if (strict) {
    const hasExplicitState = await ai.evaluate((element) => Boolean(element.closest('[aria-checked], [aria-selected], [aria-pressed], [role="option"], [role="checkbox"], [role="radio"]'))).catch(() => false)
    if (!hasExplicitState) return false
  }
  await ai.click({ force: true })
  await page.waitForTimeout(1500)
  if (!strict) return true
  return await ai.evaluate((element) => {
    const node = element.closest('[aria-checked], [aria-selected], [aria-pressed], [role="option"], [role="checkbox"], [role="radio"]')
    return node?.getAttribute("aria-checked") === "true" || node?.getAttribute("aria-selected") === "true" || node?.getAttribute("aria-pressed") === "true"
  }).catch(() => false)
}
function isoWeek(date: Date) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}
function visiblePeriod(pageText: string, rankType: RankType) {
  const range = pageText.match(/(20\d{2})-(\d{2})-(\d{2})\s*(?:~|至|—)\s*(20\d{2})-(\d{2})-(\d{2})/)
  if (!range) return undefined
  const start = `${range[1]}-${range[2]}-${range[3]}`
  const end = `${range[4]}-${range[5]}-${range[6]}`
  if (rankType === "day" && start === end) return `${range[1]}年${Number(range[2])}月${Number(range[3])}日`
  if (rankType === "month" && range[1] === range[4] && range[2] === range[5]) return `${range[1]}年${Number(range[2])}月`
  if (rankType === "week") return `${range[1]}年第${isoWeek(new Date(Number(range[1]), Number(range[2]) - 1, Number(range[3])))}周`
  return undefined
}
function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
function targetRange(period: string, rankType: RankType) {
  if (rankType === "day") {
    const match = period.match(/^(20\d{2})年(\d{1,2})月(\d{1,2})日$/)
    if (!match) throw new Error(`无法识别日榜目标周期：${period}`)
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return { start: formatIsoDate(date), end: formatIsoDate(date), month: "" }
  }
  if (rankType === "month") {
    const match = period.match(/^(20\d{2})年(\d{1,2})月$/)
    if (!match) throw new Error(`无法识别月榜目标周期：${period}`)
    const year = Number(match[1]), month = Number(match[2])
    return { start: formatIsoDate(new Date(year, month - 1, 1)), end: formatIsoDate(new Date(year, month, 0)), month: `${year}-${String(month).padStart(2, "0")}` }
  }
  const match = period.match(/^(20\d{2})年第(\d{1,2})周$/)
  if (!match) throw new Error(`无法识别周榜目标周期：${period}`)
  const year = Number(match[1]), week = Number(match[2])
  const jan4 = new Date(year, 0, 4)
  const monday = new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7) + (week - 1) * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: formatIsoDate(monday), end: formatIsoDate(sunday), month: "" }
}
async function setAndVerifyPeriod(page: Page, rankType: RankType, period: string) {
  const expected = targetRange(period, rankType)
  const dates = page.locator('input[type="date"]:visible')
  const months = page.locator('input[type="month"]:visible')
  const dateCount = await dates.count()
  const monthCount = await months.count()
  const textInputs = page.locator('input[type="text"]:visible')
  const textValues = await textInputs.evaluateAll((inputs) => inputs.map((element) => (element as HTMLInputElement).value.trim()))
  const dateTextIndex = textValues.findIndex((value) => /^20\d{2}-\d{2}-\d{2}$/.test(value))
  const monthTextIndex = textValues.findIndex((value) => /^20\d{2}-\d{2}$/.test(value))
  const rangeTextIndex = textValues.findIndex((value) => /^20\d{2}-\d{2}-\d{2}\s*(?:~|至|—)\s*20\d{2}-\d{2}-\d{2}$/.test(value))
  if (rankType === "day" && dateCount === 1) {
    await dates.first().fill(expected.start)
    await dates.first().press("Tab").catch(() => undefined)
  } else if (rankType === "day" && dateCount >= 2) {
    await dates.nth(0).fill(expected.start)
    await dates.nth(1).fill(expected.end)
    await dates.nth(1).press("Tab").catch(() => undefined)
  } else if (rankType === "week" && dateCount >= 2) {
    await dates.nth(0).fill(expected.start)
    await dates.nth(1).fill(expected.end)
    await dates.nth(1).press("Tab").catch(() => undefined)
  } else if (rankType === "month" && monthCount === 1) {
    await months.first().fill(expected.month)
    await months.first().press("Tab").catch(() => undefined)
  } else if (rankType === "month" && dateCount >= 2) {
    await dates.nth(0).fill(expected.start)
    await dates.nth(1).fill(expected.end)
    await dates.nth(1).press("Tab").catch(() => undefined)
  } else if (rankType === "day" && dateTextIndex >= 0) {
    const dateControl = textInputs.nth(dateTextIndex)
    await dateControl.fill(expected.start)
    await dateControl.press("Enter").catch(() => undefined)
    await dateControl.press("Tab").catch(() => undefined)
  } else if (rankType === "month" && monthTextIndex >= 0) {
    const monthControl = textInputs.nth(monthTextIndex)
    await monthControl.fill(expected.month)
    await monthControl.press("Enter").catch(() => undefined)
    await monthControl.press("Tab").catch(() => undefined)
  } else if (rangeTextIndex >= 0) {
    const rangeControl = textInputs.nth(rangeTextIndex)
    await rangeControl.fill(`${expected.start} ~ ${expected.end}`)
    await rangeControl.press("Enter").catch(() => undefined)
    await rangeControl.press("Tab").catch(() => undefined)
  } else {
    // Never infer the requested period from filenames or the current date.
    const bodyText = await page.locator("body").innerText().catch(() => "")
    const displayedRanges = [...bodyText.matchAll(/(20\d{2}-\d{2}-\d{2})\s*(?:~|至|—)\s*(20\d{2}-\d{2}-\d{2})/g)]
    const exactRange = displayedRanges.some((match) => match[1] === expected.start && match[2] === expected.end)
    const exactMonth = rankType === "month" && textValues.includes(expected.month)
    if (exactRange || exactMonth) return
    const actual = displayedRanges[0] ? `${displayedRanges[0][1]} ~ ${displayedRanges[0][2]}` : textValues.find((value) => /^20\d{2}-\d{2}/.test(value)) || "未识别到页面统计期"
    throw new Error(`ADX当前统计期为${actual}，目标为${expected.start} ~ ${expected.end}；页面使用未适配的自定义周期控件，本次停止且未导入。`)
  }
  await page.waitForTimeout(1200)
  const selectedDates = await dates.evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value))
  const selectedMonths = await months.evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value))
  const finalTextValues = await textInputs.evaluateAll((inputs) => inputs.map((element) => (element as HTMLInputElement).value.trim()))
  const pageText = await page.locator("body").innerText().catch(() => "")
  const confirmed = rankType === "day"
    ? selectedDates[0] === expected.start && (selectedDates.length === 1 || selectedDates[1] === expected.end) || finalTextValues.includes(expected.start) || visiblePeriod(pageText, rankType) === period
    : rankType === "month"
      ? selectedMonths[0] === expected.month || finalTextValues.includes(expected.month) || (selectedDates[0] === expected.start && selectedDates[1] === expected.end)
      : selectedDates[0] === expected.start && selectedDates[1] === expected.end || finalTextValues.includes(`${expected.start} ~ ${expected.end}`) || visiblePeriod(pageText, rankType) === period
  if (!confirmed) throw new Error(`ADX页面未确认目标周期${period}，本次已停止，未导入数据。`)
}
async function syncAdxExportUnlocked(rankType: RankType, options: { expectedPeriod?: string; scheduled?: boolean; boardType?: AdxBoardType; platform?: string } = {}) {
  const page = await getPage()
  if (!page.url().includes("oversea-v2.dataeye.com")) await page.goto(ADX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 })
  await page.waitForTimeout(1800)
  if (!(await isAuthenticatedAdxPage(page))) {
    await page.bringToFront()
    await writeState({ lastError: "专用 ADX 会话未通过登录态核验；请在该窗口手动登录后重试。", lastErrorCode: "login_required", lastErrorStage: "authentication" })
    throw new Error("专用 ADX 会话未通过登录态核验；请在弹出的窗口手动登录后重试。")
  }
  const boardType = options.boardType || "short-drama"
  if (boardType === "platform" && !options.platform) throw new Error("平台榜必须指定一个平台，避免把不同平台的数据混在一起。")
  if (options.platform && !(ADX_PLATFORM_NAMES as readonly string[]).includes(options.platform)) throw new Error(`不支持的平台：${options.platform}`)
  await selectBoardType(page, boardType)
  await selectRankType(page, rankType)
  if (options.expectedPeriod) await setAndVerifyPeriod(page, rankType, options.expectedPeriod)
  if (boardType === "platform") await selectPlatform(page, options.platform!)
  await selectSortMetric(page, boardType)
  const aiFilterApplied = await enforceAiFilter(page, true)
  if (!aiFilterApplied) throw new Error("无法明确确认“AI仿真人”筛选已生效，本次已停止，未导入数据。")
  const exportButton = page.getByRole("button", { name: /导出\s*Excel|导出/ }).last()
  if (!(await exportButton.isVisible().catch(() => false))) throw new Error("未找到ADX导出按钮，页面可能已改版。")
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), exportButton.click({ force: true })])
  const target = await download.path()
  if (!target) throw new Error("ADX导出完成，但浏览器没有返回可读取的文件。")
  try {
    const fileBuffer = await fs.readFile(target)
    const book = XLSX.read(fileBuffer, { type: "buffer", cellDates: false })
    const candidates = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: "", raw: false })
    if (!candidates.length) throw new Error("ADX导出文件没有数据行。")
    const resultRows = capAdxExportRows(candidates, rankType, options.platform)
    if (!resultRows.length) throw new Error("ADX导出文件没有可用候选行。")
    const columns = Array.from(new Set([...resultRows.flatMap((row) => Object.keys(row)), ...(options.platform ? ["平台"] : [])]))
    const pageText = await page.locator("body").innerText().catch(() => "")
    const period = visiblePeriod(pageText, rankType) || (options.expectedPeriod ? options.expectedPeriod : undefined)
    if (!period) throw new Error("无法从ADX页面明确核验统计周期；不会使用文件名或当前日期推断，本次未导入。")
    if (options.expectedPeriod && period !== options.expectedPeriod) throw new Error(`ADX页面周期${period}与目标${options.expectedPeriod}不一致，本次未导入。`)
    const boardName = boardType === "tiktok-hot" ? "TK短剧热播榜" : boardType === "platform" ? `${options.platform}平台榜` : "短剧榜"
    return { rows: resultRows, columns, period, fileName: `ADX-${boardName}-${period}-${download.suggestedFilename()}` }
  } catch (error) {
    await writeState({ lastError: error instanceof Error ? error.message : "ADX同步失败" })
    throw error
  }
}

export async function syncAdxExport(rankType: RankType, options: { expectedPeriod?: string; scheduled?: boolean; boardType?: AdxBoardType; platform?: string } = {}) {
  return withAdxSyncLock(() => syncAdxExportUnlocked(rankType, options))
}

export async function recordAdxImport(period: string, rows: number) {
  await writeState({ lastSyncAt: new Date().toISOString(), lastPeriod: period, lastRows: rows, lastError: "", lastErrorCode: "", lastErrorStage: "" })
}

export async function recordAdxFailure(message: string, stage = "sync") {
  await writeState({ lastError: message, lastErrorCode: "sync_failed", lastErrorStage: stage })
}
