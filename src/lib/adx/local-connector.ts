import fs from "node:fs/promises"
import nodeFs from "node:fs"
import path from "node:path"
import * as XLSX from "xlsx"
import { chromium, type BrowserContext, type Page } from "playwright-core"

const ADX_URL = "https://oversea-v2.dataeye.com/playlet/playlet-rank"
const profileDir = path.join(process.cwd(), ".local", "adx-profile")
const stateFile = path.join(process.cwd(), ".local", "adx-connector.json")

type ConnectorState = { connectedAt?: string; lastSyncAt?: string; lastPeriod?: string; lastRows?: number; lastError?: string }
type AdxGlobal = typeof globalThis & { __adxContext?: BrowserContext; __adxPage?: Page }
const adxGlobal = globalThis as AdxGlobal

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
  if (adxGlobal.__adxContext) return adxGlobal.__adxContext
  await fs.mkdir(profileDir, { recursive: true })
  const executablePath = chromeExecutable()
  if (!executablePath) throw new Error("未找到 Google Chrome，请先安装或打开 Chrome。")
  const context = await chromium.launchPersistentContext(profileDir, { executablePath, headless: false, viewport: { width: 1440, height: 940 }, args: ["--disable-blink-features=AutomationControlled"] })
  context.on("close", () => { adxGlobal.__adxContext = undefined; adxGlobal.__adxPage = undefined })
  adxGlobal.__adxContext = context
  return context
}
async function getPage() {
  const context = await getContext()
  if (adxGlobal.__adxPage && !adxGlobal.__adxPage.isClosed()) return adxGlobal.__adxPage
  const page = context.pages()[0] || (await context.newPage())
  adxGlobal.__adxPage = page
  return page
}

export async function openAdxLogin() {
  const page = await getPage()
  await page.goto(ADX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 })
  await page.bringToFront()
  await writeState({ connectedAt: new Date().toISOString(), lastError: "" })
  return { url: page.url() }
}
export async function getAdxStatus() {
  const state = await readState()
  let profileSaved = false
  try { profileSaved = (await fs.readdir(profileDir)).length > 0 } catch {}
  const page = adxGlobal.__adxPage
  return { profileSaved, browserOpen: Boolean(page && !page.isClosed()), ...state }
}
async function selectRankType(page: Page, rankType: "week" | "month") {
  const option = page.getByText(rankType === "month" ? "月榜" : "周榜", { exact: true }).last()
  if (await option.isVisible().catch(() => false)) { await option.click({ force: true }); await page.waitForTimeout(1200) }
}
async function enforceAiFilter(page: Page) {
  const source = page.getByText("制作来源", { exact: true }).last()
  if (!(await source.isVisible().catch(() => false))) return
  await source.click({ force: true })
  const ai = page.getByText("AI仿真人", { exact: true }).last()
  if (await ai.isVisible({ timeout: 2500 }).catch(() => false)) { await ai.click({ force: true }); await page.waitForTimeout(1500) }
}
function isoWeek(date: Date) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}
function detectedPeriod(fileName: string, rankType: "week" | "month") {
  const now = new Date()
  const dateMatch = fileName.match(/(20\d{2})[-_/年](\d{1,2})(?:[-_/月](\d{1,2}))?/)
  const year = Number(dateMatch?.[1] || now.getFullYear())
  const month = Number(dateMatch?.[2] || now.getMonth() + 1)
  if (rankType === "month") return `${year}年${month}月`
  const day = Number(dateMatch?.[3] || now.getDate())
  return `${year}年第${isoWeek(new Date(year, month - 1, day))}周`
}
export async function syncAdxExport(rankType: "week" | "month") {
  const page = await getPage()
  if (!page.url().includes("oversea-v2.dataeye.com")) await page.goto(ADX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 })
  await page.waitForTimeout(1800)
  const bodyText = await page.locator("body").innerText()
  if (!bodyText.includes("短剧排行榜") || !bodyText.includes("导出")) { await page.bringToFront(); throw new Error("ADX登录状态已失效，请在弹出的专用窗口重新登录后再同步。") }
  await selectRankType(page, rankType)
  await enforceAiFilter(page)
  const exportButton = page.getByRole("button", { name: /导出\s*Excel|导出/ }).last()
  if (!(await exportButton.isVisible().catch(() => false))) throw new Error("未找到ADX导出按钮，页面可能已改版。")
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), exportButton.click({ force: true })])
  const target = await download.path()
  if (!target) throw new Error("ADX导出完成，但浏览器没有返回可读取的文件。")
  try {
    const fileBuffer = await fs.readFile(target)
    const book = XLSX.read(fileBuffer, { type: "buffer", cellDates: false })
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: "", raw: false })
    if (!rows.length) throw new Error("ADX导出文件没有数据行。")
    const aiRows = rows.filter((row) => Object.values(row).some((value) => String(value).includes("AI仿真人")))
    const resultRows = aiRows.length ? aiRows : rows
    const columns = Array.from(new Set(resultRows.flatMap((row) => Object.keys(row))))
    const period = detectedPeriod(download.suggestedFilename(), rankType)
    await writeState({ lastSyncAt: new Date().toISOString(), lastPeriod: period, lastRows: resultRows.length, lastError: "" })
    return { rows: resultRows, columns, period, fileName: download.suggestedFilename() }
  } catch (error) {
    await writeState({ lastError: error instanceof Error ? error.message : "ADX同步失败" })
    throw error
  }
}
