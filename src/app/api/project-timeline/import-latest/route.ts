import fs from "node:fs"
import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { getWorkspaceDataOwnerId } from "@/lib/supabase/workspace-access"

export const dynamic = "force-dynamic"
const SOURCE_FILE = "/Users/xiaoqiao/Downloads/短剧内容部和制作部排期表_2026-1026_分部门版.xlsx"

function pad(value: number) { return String(value).padStart(2, "0") }
function dateValue(value: unknown) {
  const text = String(value || "").trim().replace(/[.\/]/g, "-")
  const slash = text.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/)
  if (slash) return "20" + slash[3] + "-" + pad(Number(slash[1])) + "-" + pad(Number(slash[2]))
  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (ymd) return ymd[1] + "-" + pad(Number(ymd[2])) + "-" + pad(Number(ymd[3]))
  const chinese = text.match(/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日$/)
  if (chinese) return (chinese[1] || "2026") + "-" + pad(Number(chinese[2])) + "-" + pad(Number(chinese[3]))
  return ""
}
function dateRange(value: unknown) {
  const direct = dateValue(value); if (direct) return { start: direct, end: direct }
  const text = String(value || "").trim().replace(/\s+/g, "")
  const range = text.match(/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:至|到|-)(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日$/)
  if (!range) return null
  const year = Number(range[1] || range[4] || 2026)
  const endYear = Number(range[4] || year)
  const endMonth = Number(range[5] || range[2])
  return { start: year + "-" + pad(Number(range[2])) + "-" + pad(Number(range[3])), end: endYear + "-" + pad(endMonth) + "-" + pad(Number(range[6])) }
}
function shortTitle(value: string) {
  const text = value.replace(/[；;。]/g, "").trim()
  if (/一卡/.test(text)) return "一卡交付"
  if (/前三集/.test(text)) return "前三集交付"
  if (/第一版完整交付|完整交付/.test(text)) return "第一版交付"
  if (/抽卡.*启动|启动.*抽卡/.test(text)) return "抽卡启动"
  if (/资产讨论|美术资产/.test(text)) return "资产制作"
  if (/本土化/.test(text)) return "本土化交付"
  if (/终稿/.test(text)) return "终稿确认"
  const first = text.split(/[，,：:、]/)[0].trim()
  return first.length > 16 ? first.slice(0, 16) + "…" : first
}
function normalize(value: string) { return value.replace(/[《》\s_\-—:：]/g, "").replace(/黑帮/g, "黑手党").replace(/十五/g, "15").toLowerCase() }
function sameProject(projectTitle: string, source: string) { const a = normalize(projectTitle); const b = normalize(source); return a.includes(b) || b.includes(a) }

export async function POST() {
  const { user, response } = await requireUser()
  if (response) return response
  const ownerId = await getWorkspaceDataOwnerId(user.id)
  if (!ownerId) return NextResponse.json({ error: "账号尚未获得工作台授权" }, { status: 403 })
  if (ownerId !== user.id) return NextResponse.json({ error: "只有工作台所有者可以导入最新排期" }, { status: 403 })
  if (!fs.existsSync(SOURCE_FILE)) return NextResponse.json({ error: "未找到 10/26 最新排期文件" }, { status: 404 })
  const { data: projects, error: projectError } = await serviceClient.from("projects").select("id,title").eq("user_id", ownerId)
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })
  const book = XLSX.read(fs.readFileSync(SOURCE_FILE), { type: "buffer", cellDates: true })
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: "", raw: false })
  const headerIndex = matrix.findIndex((row) => String(row[0] || "").trim() === "项目" && String(row[1] || "").trim() === "部门")
  if (headerIndex < 0) return NextResponse.json({ error: "最新排期表缺少项目、部门表头" }, { status: 400 })
  const headers = matrix[headerIndex] || []
  const sourceRows: { project: string; track: string; cells: Array<{ range: { start: string; end: string }; content: string }> }[] = []
  let currentProject = ""
  for (const row of matrix.slice(headerIndex + 1)) {
    const first = String(row[0] || "").trim(); const track = String(row[1] || "").trim()
    if (first) currentProject = first
    if (!currentProject || !track || !/内容部|制作部|发行|运营/.test(track)) continue
    const cells = []
    for (let column = 2; column < headers.length; column += 1) { const content = String(row[column] || "").trim(); const range = dateRange(headers[column]); if (content && range) cells.push({ range, content }) }
    sourceRows.push({ project: currentProject, track, cells })
  }
  const grouped = new Map<string, typeof sourceRows>()
  for (const row of sourceRows) grouped.set(row.project, [...(grouped.get(row.project) || []), row])
  const rows: Record<string, string>[] = []; const unmatched = new Set<string>()
  for (const [sourceProject, group] of grouped) {
    const project = (projects || []).find((item) => sameProject(item.title, sourceProject))
    if (!project) { unmatched.add(sourceProject); continue }
    const hasNew = group.some((row) => /新排期/.test(row.track))
    for (const row of group) {
      if (/原排期|承制\s*原/.test(row.track)) continue
      if (hasNew && /制作部（自制）/.test(row.track)) continue
      const isContracted = /承制/.test(row.track)
      const isSelf = /自制|新排期/.test(row.track) && !isContracted
      const mode = /内容部/.test(row.track) ? "" : isContracted ? "承制" : isSelf ? "自制" : "待确认"
      for (const cell of row.cells) rows.push({ user_id: ownerId, project_id: project.id, track: /内容部/.test(row.track) ? "内容部" : "制作部", title: shortTitle(cell.content), content: cell.content, start_date: cell.range.start, end_date: cell.range.end, status: "planned", notes: mode ? "制作方式：" + mode + " | 来源：10/26最新排期" : "来源：10/26最新排期" })
    }
  }
  if (!rows.length) return NextResponse.json({ error: unmatched.size ? "没有可导入节点，未匹配项目：" + [...unmatched].join("、") : "最新排期没有可导入内容" }, { status: 400 })
  const { data, error } = await serviceClient.from("project_timeline_items").insert(rows).select("id")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imported: data?.length || 0, unmatched: [...unmatched] })
}
