"use client"

import { ChangeEvent, useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import { Archive, CalendarDays, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react"
import { type Project, type ProjectInput } from "@/hooks/use-projects"
import { displayTimelineTrack, storageTimelineTrack, TIMELINE_STATUSES, TIMELINE_TRACKS, type ProjectTimelineItem, type TimelineInput, type TimelineStatus, useProjectTimeline, withProductionMode } from "@/hooks/use-project-timeline"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const STATUS_LABEL: Record<TimelineStatus, string> = { planned: "待开始", active: "进行中", completed: "已完成", delayed: "已延期", paused: "已暂停" }
const STATUS_STYLE: Record<TimelineStatus, string> = { planned: "bg-[#cdddb3] text-[#173f31]", active: "bg-[#174b39] text-white", completed: "bg-[#86b892] text-[#123f2d]", delayed: "bg-[#c7d9a9] text-[#3d5b35]", paused: "bg-[#dce7d8] text-[#56705f]" }
const TRACK_STYLE: Record<string, { cell: string; block: string }> = {
  "内容部": { cell: "bg-[#eef5e5] text-[#174b39]", block: "ring-1 ring-[#78a83c]/55" },
  "制作部（自制）": { cell: "bg-[#e4f2df] text-[#286443]", block: "ring-1 ring-[#5b9d65]/45" },
  "制作部（承制）": { cell: "bg-[#e9f1df] text-[#47704f]", block: "ring-1 ring-[#88a96c]/55" },
  "制作部（待确认）": { cell: "bg-[#f0f5ec] text-[#667a67]", block: "opacity-80" },
}
const EMPTY = { project_id: "", track: "内容部", title: "", content: "", start_date: "", end_date: "", status: "planned" as TimelineStatus, notes: "" }

function ymd(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` }
function toDate(value: string) { return new Date(`${value}T12:00:00`) }
function addDays(value: Date, amount: number) { const next = new Date(value); next.setDate(next.getDate() + amount); return next }
function monday(value: Date) { const next = new Date(value); next.setDate(next.getDate() - ((next.getDay() + 6) % 7)); return next }
function dayLabel(value: Date) { return `${value.getMonth() + 1}/${value.getDate()}` }
function weekLabel(value: Date) { return `周${"日一二三四五六"[value.getDay()]}` }
function monthHeaderTone(value: Date) {
  // Alternating month bands make month changes legible even in the compact view.
  return ["bg-[#174b39]", "bg-[#245b45]", "bg-[#32684d]"][value.getMonth() % 3]
}
function monthCellTone(value: Date) {
  return ["bg-[#fbfdf9]", "bg-[#f1f8ed]", "bg-[#f4f8f1]"][value.getMonth() % 3]
}
function parseDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return ymd(value)
  const text = String(value || "").trim().replace(/[./]/g, "-")
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) { const [year, month, day] = text.split("-"); return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? "" : ymd(date)
}

function parseWideHeader(value: unknown): { start: string; end: string } | null {
  const direct = parseDate(value)
  if (direct) return { start: direct, end: direct }
  const text = String(value || "").trim().replace(/\s+/g, "")
  const range = text.match(/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:至|到|-)(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日$/)
  if (!range) return null
  const year = Number(range[1] || range[4] || new Date().getFullYear())
  const month = Number(range[2])
  const endMonth = Number(range[5] || month)
  const start = `${year}-${String(month).padStart(2, "0")}-${String(Number(range[3])).padStart(2, "0")}`
  const end = `${Number(range[4] || year)}-${String(endMonth).padStart(2, "0")}-${String(Number(range[6])).padStart(2, "0")}`
  return { start, end }
}

function compactNodeTitle(value: string) {
  const text = value.replace(/[；;。]/g, "").trim()
  if (/一卡/.test(text)) return "一卡交付"
  if (/前三集/.test(text)) return "前三集交付"
  if (/第一版完整交付|完整交付/.test(text)) return "第一版交付"
  if (/抽卡.*启动|启动.*抽卡/.test(text)) return "抽卡启动"
  if (/资产讨论|美术资产/.test(text)) return "资产制作"
  if (/本土化/.test(text)) return "本土化交付"
  if (/终稿/.test(text)) return "终稿确认"
  const firstPhrase = text.split(/[，,：:、]/)[0].trim()
  return firstPhrase.length > 12 ? `${firstPhrase.slice(0, 12)}…` : firstPhrase
}

function normalizeNodeText(value: string) {
  return value.replace(/[\s\n\r，,。；;：:、（）()【】\[\]“”"'‘’·…!?！？]/g, "").toLowerCase()
}

function nodeDisplayTitle(item: { title: string; content?: string | null }) {
  return compactNodeTitle(item.content?.trim() || item.title.trim()) || item.title.trim()
}

function nodeKey(item: { project_id: string; track: string; start_date: string; end_date: string; title: string; content?: string | null; notes?: string | null }) {
  const semanticTitle = normalizeNodeText(nodeDisplayTitle(item))
  const mode = /承制/.test(`${item.track} ${item.notes || ""}`) ? "承制" : /自制/.test(`${item.track} ${item.notes || ""}`) ? "自制" : item.track
  return [item.project_id, mode, item.start_date, item.end_date, semanticTitle].join("|")
}

function uniqueTimelineItems(items: ProjectTimelineItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = nodeKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeProjectName(value: string) {
  return value.replace(/[《》\s_\-—:：]/g, "").replace(/黑帮/g, "黑手党").replace(/十五/g, "15").toLowerCase()
}

function resolveProject(projects: Project[], value: string) {
  const name = value.trim()
  if (!name) return undefined
  const normalized = normalizeProjectName(name)
  return projects.find((item) => item.id === name || item.title === name)
    || projects.find((item) => {
      const title = normalizeProjectName(item.title)
      return title.includes(normalized) || normalized.includes(title)
    })
}

function wideScheduleRows(matrix: unknown[][]): Record<string, unknown>[] {
  const headerIndex = matrix.findIndex((row) => String(row[0] || "").trim() === "项目" && String(row[1] || "").trim() === "部门")
  if (headerIndex < 0) return []
  const headers = matrix[headerIndex] || []
  const output: Record<string, unknown>[] = []
  let currentProject = ""
  for (const row of matrix.slice(headerIndex + 1)) {
    const first = String(row[0] || "").trim()
    const track = String(row[1] || "").trim()
    if (first) currentProject = first
    if (!currentProject || !track || !/内容部|制作部|发行|运营/.test(track)) continue
    // “原排期”保留在版本历史中，不与“新排期”同时灌入当前时间轴。
    if (/原排期|承制\s*原/.test(track)) continue
    const displayTrack = track.includes("承制") ? "制作部（承制）" : track.includes("自制") || /新排期/.test(track) ? "制作部（自制）" : track.includes("制作部") ? "制作部（待确认）" : "内容部"
    for (let column = 2; column < headers.length; column += 1) {
      const content = String(row[column] || "").trim()
      const range = parseWideHeader(headers[column])
      if (!content || !range) continue
      output.push({ 项目: currentProject, 部门: displayTrack, 开始日期: range.start, 结束日期: range.end, 节点: compactNodeTitle(content), 排期内容: content, 备注: /新排期/.test(track) ? "来源：新排期" : "来源：当前排期" })
    }
  }
  return output
}

export function ProjectScheduleBoard({ projects, onUpdateProject, onDeleteProject }: { projects: Project[]; onUpdateProject: (id: string, updates: Partial<ProjectInput>) => Promise<Project>; onDeleteProject: (id: string) => Promise<void> }) {
  const { items, loading, error, addItem, addMany, updateItem, deleteItem, clearAll, refetch } = useProjectTimeline()
  const [anchor, setAnchor] = useState(() => monday(new Date()))
  const [viewMode, setViewMode] = useState<"overview" | "detail">("overview")
  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [form, setForm] = useState({ ...EMPTY, project_id: projects[0]?.id || "" })
  const [paste, setPaste] = useState("")
  const [editing, setEditing] = useState<ProjectTimelineItem | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const days = useMemo(() => Array.from({ length: viewMode === "overview" ? 42 : 84 }, (_, index) => addDays(anchor, index)), [anchor, viewMode])
  const tracks = [...TIMELINE_TRACKS]
  const activeProjects = [...projects].filter((project) => project.status !== "archived").sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || b.progress - a.progress)

  const startNewAt = (projectId: string, track: string, date: string) => {
    setForm({ ...EMPTY, project_id: projectId, track, start_date: date, end_date: date })
    setOpen(true)
    setImportOpen(false)
  }
  const renameProject = async (project: Project) => {
    const title = prompt("修改项目名称", project.title)
    if (title?.trim() && title.trim() !== project.title) await onUpdateProject(project.id, { title: title.trim() })
  }
  const archiveProject = async (project: Project) => {
    if (confirm(`隐藏并归档《${project.title}》？之后可在“查看已归档”中恢复。`)) await onUpdateProject(project.id, { status: "archived" })
  }
  const removeProject = async (project: Project) => {
    if (confirm(`确定删除项目《${project.title}》？该项目及其全部排期节点将被删除。`)) await onDeleteProject(project.id)
  }

  const create = async () => {
    if (!form.project_id || !form.title.trim() || !form.start_date || !form.end_date) return
    setSaving(true)
    try {
      await addItem({ ...form, track: storageTimelineTrack(form.track), title: form.title.trim(), content: form.content.trim() || undefined, notes: withProductionMode(form.notes, form.track) })
      setForm({ ...EMPTY, project_id: form.project_id }); setOpen(false)
    } finally { setSaving(false) }
  }
  const saveEditing = async () => {
    if (!editing || !editing.title.trim() || !editing.start_date || !editing.end_date) return
    setSaving(true)
    try {
      const displayTrack = displayTimelineTrack(editing)
      await updateItem(editing.id, { title: editing.title.trim(), content: editing.content?.trim() || undefined, track: storageTimelineTrack(displayTrack), start_date: editing.start_date, end_date: editing.end_date, status: editing.status, notes: withProductionMode(editing.notes || undefined, displayTrack) })
      setEditing(null)
    } finally { setSaving(false) }
  }
  const mapRow = (row: Record<string, unknown>): TimelineInput | null => {
    const projectName = String(row["项目"] || row["项目名称"] || row.project || row.project_name || "").trim()
    const project = resolveProject(projects, projectName)
    const start = parseDate(row["开始日期"] || row["开始"] || row.start_date || row.start)
    const end = parseDate(row["结束日期"] || row["结束"] || row.end_date || row.end || row["开始日期"] || row.start_date)
    const title = String(row["节点"] || row["任务"] || row["事项"] || row.title || row.task || "排期事项").trim()
    const content = String(row["排期内容"] || row["内容"] || row.content || row["工作内容"] || "").trim()
    const track = String(row["轨道"] || row["部门"] || row.track || "内容部").trim()
    if (!project || !start || !end || !title) return null
    const displayTrack = track.includes("承制") ? "制作部（承制）" : track.includes("自制") ? "制作部（自制）" : track === "制作部" ? "制作部（待确认）" : track
    return { project_id: project.id, title, content: content || undefined, track: storageTimelineTrack(displayTrack), start_date: start, end_date: end, status: "planned", notes: withProductionMode(String(row["备注"] || row.notes || "").trim() || undefined, displayTrack) }
  }
  const importRows = async (rows: Record<string, unknown>[]) => {
    const projectNames = Array.from(new Set(rows.map((row) => String(row["项目"] || row["项目名称"] || row.project || row.project_name || "").trim()).filter(Boolean)))
    const unmatched = projectNames.filter((name) => !resolveProject(projects, name))
    const valid = rows.map(mapRow).filter((item): item is TimelineInput => Boolean(item))
    if (!valid.length) {
      setMessage(unmatched.length ? `导入失败：项目未匹配到工作台项目——${unmatched.join("、")}。请使用项目简称或先建立对应项目。` : "未找到有效排期。请检查日期列、项目、部门/轨道和节点内容。")
      return
    }
    const existingKeys = new Set(items.map((item) => nodeKey(item)))
    const importKeys = new Set<string>()
    const unique = valid.filter((item) => {
      const key = nodeKey({ ...item, notes: item.notes || null })
      if (existingKeys.has(key) || importKeys.has(key)) return false
      importKeys.add(key)
      return true
    })
    const skipped = valid.length - unique.length
    if (!unique.length) { setMessage(`没有新增节点：检测到 ${skipped} 个重复排期，已全部跳过。`); return }
    setSaving(true)
    try {
      await addMany(unique)
      setMessage(`已导入 ${unique.length} 个排期节点${skipped ? `，自动跳过 ${skipped} 个重复节点` : ""}${unmatched.length ? `；未匹配项目：${unmatched.join("、")}` : ""}`)
      setImportOpen(false)
      setPaste("")
    } finally { setSaving(false) }
  }
  const importText = async () => {
    const rows = paste.split("\n").filter(Boolean).map((line) => {
      const [project, track, range, title, content, notes] = line.split(/[|｜]/).map((part) => part.trim())
      const [start, end] = (range || "").split(/[~～至]/).map((part) => part.trim())
      return { 项目: project, 部门: track, 开始日期: start, 结束日期: end || start, 节点: title, 排期内容: content, 备注: notes }
    })
    await importRows(rows)
  }
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return
    const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true })
    const sheet = book.Sheets[book.SheetNames[0]]
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true })
    const wideRows = wideScheduleRows(matrix)
    if (wideRows.length) {
      await importRows(wideRows)
    } else {
      await importRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false }))
    }
    event.target.value = ""
  }
  const resetSchedule = async () => {
    if (!confirm("确定清空当前全部排期节点吗？这会删除旧排期记录，项目本身不会删除。建议确认已准备好导入 10/26 最新排期表。")) return
    setSaving(true)
    try { const deleted = await clearAll(); setMessage(`已清空 ${deleted} 条旧排期节点，现在可以导入 10/26 最新排期表。`) } catch (resetError) { setMessage(resetError instanceof Error ? resetError.message : "旧排期清理失败") } finally { setSaving(false) }
  }
  const importLatest = async () => {
    setSaving(true)
    try { const response = await fetch("/api/project-timeline/import-latest", { method: "POST" }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "最新排期导入失败"); await refetch(); setMessage(`已导入 ${payload.imported || 0} 条 10/26 最新排期${payload.unmatched?.length ? `；未匹配项目：${payload.unmatched.join("、")}` : ""}`) } catch (importError) { setMessage(importError instanceof Error ? importError.message : "最新排期导入失败") } finally { setSaving(false) }
  }

    return <Card className="overflow-hidden">
    <CardHeader className="border-b border-border/70"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><p className="section-kicker">Schedule · project × track × date</p><CardTitle className="mt-1 text-xl">项目排期时间轴</CardTitle><p className="mt-1 text-sm text-muted-foreground">总览按天展示未来 6 周；细览显示一周宽度，可横向滑动查看后续日期。</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant={viewMode === "overview" ? "default" : "outline"} onClick={() => setViewMode("overview")}>总览</Button><Button size="sm" variant={viewMode === "detail" ? "default" : "outline"} onClick={() => setViewMode("detail")}>细览（周窗口）</Button><Button size="sm" variant="outline" onClick={() => setAnchor(addDays(anchor, viewMode === "detail" ? -7 : -28))}><ChevronLeft className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => setAnchor(monday(new Date()))}>回到本周</Button><Button size="sm" variant="outline" onClick={() => setAnchor(addDays(anchor, viewMode === "detail" ? 7 : 28))}><ChevronRight className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => setImportOpen(!importOpen)}><FileSpreadsheet className="mr-1.5 h-4 w-4" />导入排期</Button><Button size="sm" variant="destructive" onClick={() => void resetSchedule()} disabled={saving}>清空旧排期</Button><Button size="sm" onClick={() => setOpen(!open)}><Plus className="mr-1.5 h-4 w-4" />新增节点</Button></div></div></CardHeader>
    <CardContent className="space-y-4 p-0">
      {(open || importOpen) && <div className="space-y-4 border-b bg-muted/25 p-5">{open && <div className="grid gap-3 lg:grid-cols-6"><select className="h-10 rounded-xl border bg-card px-3 text-sm" value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}><option value="">选择项目 *</option>{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><select className="h-10 rounded-xl border bg-card px-3 text-sm" value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })}>{tracks.map((track) => <option key={track}>{track}</option>)}</select><Input placeholder="节点名称 *，例如：剧本修改" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /><select className="h-10 rounded-xl border bg-card px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TimelineStatus })}>{TIMELINE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select><Textarea className="lg:col-span-6" rows={2} placeholder="排期内容：例如，完成终审意见；编剧根据修改意见完成前三集重写；发起围读会确认版本。" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /><Textarea className="lg:col-span-5" rows={2} placeholder="备注、负责人或交付标准（可选）" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /><Button disabled={saving} onClick={() => void create()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存节点</Button></div>}{importOpen && <div className="rounded-2xl border border-dashed bg-card/70 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">导入文字或 Excel/CSV 排期表</p><p className="mt-1 text-xs text-muted-foreground">表头支持：项目、部门/轨道、节点/任务、排期内容、开始日期、结束日期、备注。项目名称须与工作台项目一致。</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void importLatest()} disabled={saving}><FileSpreadsheet className="mr-1.5 h-4 w-4" />导入 10/26 最新表</Button><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void importFile(e)} /><Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="mr-1.5 h-4 w-4" />选择排期表</Button></div></div><Textarea className="mt-3" rows={4} placeholder={"或粘贴文本：\n项目名｜内容部｜2026-10-12~2026-10-14｜剧本修改｜完成前三集修改，确认围读版本｜责编确认\n项目名｜制作部｜2026-10-15｜角色测试｜启动角色与场景测试"} value={paste} onChange={(e) => setPaste(e.target.value)} /><div className="mt-3 flex justify-end"><Button size="sm" disabled={saving || !paste.trim()} onClick={() => void importText()}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}导入文字排期</Button></div></div>}{message && <p className="text-sm text-primary">{message}</p>}</div>}
      {loading ? <div className="h-72 animate-pulse bg-muted/40" /> : viewMode === "overview" ? <SpreadsheetScheduleOverview projects={activeProjects} days={days} items={items} onEdit={setEditing} onCreate={startNewAt} onRename={renameProject} onArchive={archiveProject} onDeleteProject={removeProject} /> : <div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid border-b bg-[#174b39] text-white" style={{ gridTemplateColumns: `190px 100px repeat(${days.length}, minmax(90px,1fr))` }}><div className="sticky left-0 z-30 flex items-center border-r border-white/20 bg-[#174b39] px-4 text-sm font-semibold">项目</div><div className="sticky z-30 flex items-center border-r border-white/20 bg-[#174b39] px-3 text-sm font-semibold" style={{ left: 190 }}>轨道 / 制作方式</div>{days.map((day, index) => <div key={ymd(day)} className={`border-r border-white/15 px-1 py-2 text-center text-[10px] ${monthHeaderTone(day)} ${day.getDate() === 1 ? "border-l-2 border-l-[#c9f45a]" : ""} ${day.getDay() === 0 || day.getDay() === 6 ? "brightness-110" : ""}`}><span className="block font-semibold">{dayLabel(day)}</span><span className="block text-[9px] text-white/65">{weekLabel(day)}</span>{index === 0 && <CalendarDays className="mx-auto mt-1 h-3 w-3 text-[#c9f45a]" />}</div>)}</div>{activeProjects.length ? activeProjects.flatMap((project) => { const projectItems = uniqueTimelineItems(items.filter((item) => item.project_id === project.id)); const itemTracks = Array.from(new Set(projectItems.map((item) => displayTimelineTrack(item)))); const productionTracks = itemTracks.filter((track) => track.startsWith("制作部")); const otherTracks = itemTracks.filter((track) => !track.startsWith("制作部") && track !== "内容部"); const projectTracks = ["内容部", ...(productionTracks.length ? productionTracks : ["制作部（待确认）"]), ...otherTracks]; return projectTracks.map((track, rowIndex) => <TimelineRow key={`${project.id}-${track}`} project={project} track={track} isFirst={rowIndex === 0} days={days} compact={false} items={projectItems.filter((item) => displayTimelineTrack(item) === track)} onEdit={setEditing} onCreate={startNewAt} onRename={renameProject} onArchive={archiveProject} onDeleteProject={removeProject} />) }) : <div className="p-10 text-center text-sm text-muted-foreground">建立项目后，即可添加排期节点。</div>}</div></div>}{error && <p className="p-4 text-sm text-destructive">{error}</p>}
    </CardContent>
    {editing && <EditTimelineItem item={editing} setItem={setEditing} saving={saving} onClose={() => setEditing(null)} onSave={() => void saveEditing()} onDelete={async () => { setSaving(true); try { await deleteItem(editing.id); setEditing(null) } finally { setSaving(false) } }} />}
  </Card>
}

function ProjectOverviewRow({ project, days, items, onEdit, onCreate, onRename, onArchive, onDeleteProject }: { project: Project; days: Date[]; items: ProjectTimelineItem[]; onEdit: (item: ProjectTimelineItem) => void; onCreate: (projectId: string, track: string, date: string) => void; onRename: (project: Project) => void; onArchive: (project: Project) => void; onDeleteProject: (project: Project) => void }) {
  const weeks = Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7))
  const completed = items.filter((item) => item.status === "completed").length
  const progress = items.length ? Math.round((completed / items.length) * 100) : project.progress
  const next = items.filter((item) => item.status !== "completed").sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
  return <div className="grid min-h-[92px] grid-cols-[300px_repeat(6,minmax(120px,1fr))] border-b border-border/70 bg-card">
    <div className="sticky left-0 z-10 border-r bg-card px-4 py-3">
      <div className="flex items-start gap-2"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${project.status === "active" ? "bg-[#b8ee45]" : "bg-muted-foreground/40"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#173f31]" title={project.title}>{project.title}</p><div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground"><span>{items.length ? `节点 ${items.length}` : "暂无节点"}</span><span>·</span><span>{progress}% 完成</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#94c83d]" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div></div></div>
      <div className="mt-2 flex items-center gap-1"><button type="button" title="编辑项目名称" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => void onRename(project)}><Pencil className="h-3 w-3" /></button><button type="button" title="隐藏并归档项目" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => void onArchive(project)}><Archive className="h-3 w-3" /></button><button type="button" title="删除项目及排期" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => void onDeleteProject(project)}><Trash2 className="h-3 w-3" /></button>{next && <span className="ml-1 truncate text-[10px] text-muted-foreground">下一节点：{nodeDisplayTitle(next)}</span>}</div>
    </div>
    {weeks.map((week, index) => { const weekStart = ymd(week[0]); const weekEnd = ymd(week[6]); const weekItems = items.filter((item) => item.end_date >= weekStart && item.start_date <= weekEnd); return <button key={index} type="button" className={`group relative min-h-[92px] border-r border-border/60 p-2 text-left transition hover:bg-[#c9f45a]/15 ${week.some((day) => day.getDate() === 1) ? "border-l-2 border-l-[#9bb36f]" : ""}`} onClick={() => onCreate(project.id, "内容部", weekStart)} title={`${weekStart} 至 ${weekEnd}，点击新增节点`}><div className="flex min-h-[72px] flex-wrap content-start gap-1">{weekItems.slice(0, 4).map((item) => <span key={item.id} onClick={(event) => { event.stopPropagation(); onEdit({ ...item, track: displayTimelineTrack(item) }) }} className={`inline-flex max-w-full cursor-pointer items-center rounded-full px-2 py-1 text-[10px] font-medium leading-3 shadow-sm ${STATUS_STYLE[item.status]}`} title={`${nodeDisplayTitle(item)} · ${STATUS_LABEL[item.status]}`}><span className="truncate">{nodeDisplayTitle(item)}</span></span>)}{weekItems.length > 4 && <span className="self-center text-[10px] text-muted-foreground">+{weekItems.length - 4}</span>}{!weekItems.length && <span className="self-center text-[10px] text-muted-foreground/45 group-hover:text-muted-foreground">点击添加节点</span>}</div></button> })}
  </div>
}

function SpreadsheetScheduleOverview({ projects, days, items, onEdit, onCreate, onRename, onArchive, onDeleteProject }: { projects: Project[]; days: Date[]; items: ProjectTimelineItem[]; onEdit: (item: ProjectTimelineItem) => void; onCreate: (projectId: string, track: string, date: string) => void; onRename: (project: Project) => void; onArchive: (project: Project) => void; onDeleteProject: (project: Project) => void }) {
  const periods = Array.from({ length: 8 }, (_, index) => days.slice(index * 5, index === 7 ? days.length : index * 5 + 5)).filter((period) => period.length)
  const columns = `180px 104px repeat(${periods.length}, minmax(135px,1fr))`
  const periodLabel = (period: Date[]) => period.length === 1 ? dayLabel(period[0]) : `${dayLabel(period[0])}至${dayLabel(period[period.length - 1])}`
  return <div className="overflow-x-auto"><div className="min-w-[1450px]"><div className="grid border-b border-white/20 bg-[#174b39] text-white" style={{ gridTemplateColumns: columns }}><div className="flex items-center border-r border-white/20 px-3 py-2 text-xs font-semibold">项目</div><div className="flex items-center border-r border-white/20 px-2 py-2 text-xs font-semibold">部门 / 制作方式</div>{periods.map((period) => <div key={ymd(period[0])} className="border-r border-white/15 px-2 py-2 text-center text-[10px] font-semibold">{periodLabel(period)}</div>)}</div>{projects.length ? projects.map((project) => { const projectItems = uniqueTimelineItems(items.filter((item) => item.project_id === project.id)); const itemTracks = Array.from(new Set(projectItems.map((item) => displayTimelineTrack(item)))); const productionTracks = itemTracks.filter((track) => track.startsWith("制作部")); const otherTracks = itemTracks.filter((track) => !track.startsWith("制作部") && track !== "内容部"); const projectTracks = ["内容部", ...(productionTracks.length ? productionTracks : ["制作部（待确认）"]), ...otherTracks]; return <div key={project.id} className="grid border-b border-[#d5e1d5]" style={{ gridTemplateColumns: columns }}>{<div className={`row-span-${projectTracks.length} flex min-h-[92px] flex-col justify-center border-r border-[#c9dcc9] px-3 py-2 ${project.status === "active" ? "bg-[#e9f4df]" : "bg-[#f2f5ef]"}`} style={{ gridRow: `span ${projectTracks.length}` }}><div className="flex items-start gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${project.status === "active" ? "bg-[#b8ee45]" : "bg-[#a9b6a5]"}`} /><p className="line-clamp-3 text-[11px] font-semibold leading-4 text-[#174b39]">{project.title}</p></div><div className="mt-2 flex items-center gap-1"><button type="button" title="编辑项目名称" className="rounded p-1 text-[#5c7668] hover:bg-white/70" onClick={() => void onRename(project)}><Pencil className="h-3 w-3" /></button><button type="button" title="隐藏并归档项目" className="rounded p-1 text-[#5c7668] hover:bg-white/70" onClick={() => void onArchive(project)}><Archive className="h-3 w-3" /></button><button type="button" title="删除项目及排期" className="rounded p-1 text-[#5c7668] hover:bg-white/70 hover:text-destructive" onClick={() => void onDeleteProject(project)}><Trash2 className="h-3 w-3" /></button></div></div>}{projectTracks.flatMap((track) => { const trackItems = projectItems.filter((item) => displayTimelineTrack(item) === track); return [<div key={`${project.id}-${track}-label`} className={`flex min-h-[92px] items-center border-r border-b border-[#d5e1d5] px-2 text-[10px] font-semibold ${TRACK_STYLE[track]?.cell || "bg-[#f7faf5] text-[#476457]"}`}>{track}</div>, ...periods.map((period) => { const start = ymd(period[0]); const end = ymd(period[period.length - 1]); const periodItems = trackItems.filter((item) => item.end_date >= start && item.start_date <= end); return <div key={`${project.id}-${track}-${start}`} className="min-h-[92px] border-r border-b border-[#d5e1d5] bg-[#fbfdf9] p-1.5"><div className="space-y-1">{periodItems.map((item) => { const title = nodeDisplayTitle(item); const body = item.content && normalizeNodeText(item.content) !== normalizeNodeText(item.title) && normalizeNodeText(item.content) !== normalizeNodeText(title) ? item.content : ""; return <button key={item.id} type="button" title={`${title}${body ? `：${body}` : ""}（点击编辑）`} onClick={() => onEdit({ ...item, track: displayTimelineTrack(item) })} className={`block w-full rounded-md px-1.5 py-1 text-left text-[9px] leading-3 shadow-sm ${STATUS_STYLE[item.status]} hover:brightness-95`}><span className="block font-semibold">{title}</span>{body && <span className="mt-0.5 block line-clamp-3 text-[8px] opacity-80">{body}</span>}</button>})}{!periodItems.length && <button type="button" className="h-full min-h-[72px] w-full text-[8px] text-[#7b9082] opacity-0 hover:opacity-100" onClick={() => onCreate(project.id, track, start)}>点击添加</button>}</div></div>})]})}</div> }) : <div className="p-10 text-center text-sm text-muted-foreground">建立项目后，即可添加排期节点。</div>}</div></div>
}

function CompactDailySchedule({ projects, days, items, onEdit, onCreate, onRename, onArchive, onDeleteProject }: { projects: Project[]; days: Date[]; items: ProjectTimelineItem[]; onEdit: (item: ProjectTimelineItem) => void; onCreate: (projectId: string, track: string, date: string) => void; onRename: (project: Project) => void; onArchive: (project: Project) => void; onDeleteProject: (project: Project) => void }) {
const columns = "150px 72px repeat(" + days.length + ", minmax(16px,1fr))"
  return <div className="overflow-x-auto"><div className="min-w-0"><div className="grid border-b bg-[#174b39] text-white" style={{ gridTemplateColumns: columns }}><div className="sticky left-0 z-30 flex items-center border-r border-white/20 bg-[#174b39] px-3 py-2 text-xs font-semibold">项目</div><div className="sticky z-30 flex items-center border-r border-white/20 bg-[#174b39] px-2 py-2 text-[10px] font-semibold" style={{ left: 150 }}>轨道 / 制作方式</div>{days.map((day, index) => <div key={ymd(day)} className={`border-r border-white/15 px-0.5 py-1 text-center text-[9px] ${monthHeaderTone(day)} ${day.getDate() === 1 ? "border-l-2 border-l-[#c9f45a]" : ""}`}><span className="block font-semibold">{index === 0 || day.getDate() === 1 ? dayLabel(day) : day.getDate()}</span><span className="block text-[8px] text-white/70">{weekLabel(day)}</span>{index === 0 && <CalendarDays className="mx-auto h-2.5 w-2.5 text-[#c9f45a]" />}</div>)}</div>{projects.length ? projects.flatMap((project) => { const projectItems = uniqueTimelineItems(items.filter((item) => item.project_id === project.id)); const itemTracks = Array.from(new Set(projectItems.map((item) => displayTimelineTrack(item)))); const productionTracks = itemTracks.filter((track) => track.startsWith("制作部")); const otherTracks = itemTracks.filter((track) => !track.startsWith("制作部") && track !== "内容部"); const projectTracks = ["内容部", ...(productionTracks.length ? productionTracks : ["制作部（待确认）"]), ...otherTracks]; return projectTracks.map((track, rowIndex) => <TimelineRow key={project.id + "-" + track} project={project} track={track} isFirst={rowIndex === 0} days={days} compact items={projectItems.filter((item) => displayTimelineTrack(item) === track)} onEdit={onEdit} onCreate={onCreate} onRename={onRename} onArchive={onArchive} onDeleteProject={onDeleteProject} />) }) : <div className="p-10 text-center text-sm text-muted-foreground">建立项目后，即可添加排期节点。</div>}</div></div>
}

function TimelineRow({ project, track, isFirst, days, compact, items, onEdit, onCreate, onRename, onArchive, onDeleteProject }: { project: Project; track: string; isFirst: boolean; days: Date[]; compact: boolean; items: ProjectTimelineItem[]; onEdit: (item: ProjectTimelineItem) => void; onCreate: (projectId: string, track: string, date: string) => void; onRename: (project: Project) => void; onArchive: (project: Project) => void; onDeleteProject: (project: Project) => void }) {
const columns = compact ? "150px 72px repeat(" + days.length + ", minmax(16px,1fr))" : "190px 100px repeat(" + days.length + ", minmax(90px,1fr))"; const first = ymd(days[0]); const last = ymd(days[days.length - 1]); const trackOffset = compact ? 150 : 190
  const trackStyle = TRACK_STYLE[track] || { cell: "bg-card text-muted-foreground", block: "opacity-85" }
  return <div className={`grid border-b ${compact ? "min-h-10" : "min-h-16"}`} style={{ gridTemplateColumns: columns }}><div className={`sticky left-0 z-20 flex border-r bg-card ${compact ? "items-end px-1 pb-0" : "items-center px-3 py-1.5"}`}><span className={`mr-2 h-2 w-2 shrink-0 rounded-full ${project.status === "active" ? "bg-[#c9f45a]" : "bg-muted-foreground/40"}`} />{isFirst ? <div className="min-w-0 flex-1"><p className={`line-clamp-2 font-semibold leading-tight ${compact ? "text-[9px]" : "text-xs"}`}>{project.title}</p><div className="mt-1 flex items-center gap-1"><button type="button" title="编辑项目名称" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => void onRename(project)}><Pencil className="h-3 w-3" /></button><button type="button" title="隐藏并归档项目" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => void onArchive(project)}><Archive className="h-3 w-3" /></button><button type="button" title="删除项目及排期" className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => void onDeleteProject(project)}><Trash2 className="h-3 w-3" /></button></div></div> : <span />}</div><div className={`sticky z-20 flex items-center border-r font-medium ${trackStyle.cell} ${compact ? "px-1 text-[8px]" : "px-3 text-xs"}`} style={{ left: trackOffset }}>{track}</div><div className="relative grid bg-card/50" style={{ gridColumn: `3 / span ${days.length}`, gridTemplateColumns: compact ? `repeat(${days.length}, minmax(16px,1fr))` : `repeat(${days.length}, minmax(90px,1fr))` }}>{days.map((day) => <button key={ymd(day)} type="button" title={`${ymd(day)} · ${weekLabel(day)} · 点击新增排期`} onClick={() => onCreate(project.id, track, ymd(day))} className={`border-r border-border/50 transition hover:bg-[#c9f45a]/20 ${monthCellTone(day)} ${day.getDate() === 1 ? "border-l-2 border-l-[#9bb36f]" : ""} ${day.getDay() === 0 || day.getDay() === 6 ? "brightness-[.985]" : ""}`} />)}{items.filter((item) => item.end_date >= first && item.start_date <= last).map((item) => { const start = Math.max(0, Math.round((toDate(item.start_date).getTime() - toDate(first).getTime()) / 86400000)); const end = Math.min(days.length - 1, Math.round((toDate(item.end_date).getTime() - toDate(first).getTime()) / 86400000)); const title = nodeDisplayTitle(item); const body = item.content && normalizeNodeText(item.content) !== normalizeNodeText(item.title) && normalizeNodeText(item.content) !== normalizeNodeText(title) ? item.content : ""; return <button key={item.id} title={`${title}${body ? `：${body}` : ""}（点击编辑）`} className={`z-10 m-0.5 min-w-0 overflow-hidden rounded-sm text-left font-semibold shadow-sm transition hover:brightness-95 ${compact ? "h-[30px] px-0.5 py-0 text-[7px] leading-3" : "m-1 rounded-md px-2 py-1 text-[10px] leading-4"} ${STATUS_STYLE[item.status]} ${trackStyle.block}`} style={{ gridColumn: `${start + 1} / ${end + 2}` }} onClick={() => onEdit({ ...item, track: displayTimelineTrack(item) })}><span className={`flex items-center gap-1 opacity-70 ${compact ? "text-[7px]" : "text-[9px]"}`}><Pencil className={compact ? "h-2 w-2" : "h-2.5 w-2.5"} />{title}</span>{body && <span className={`block font-normal opacity-80 ${compact ? "truncate text-[7px]" : "whitespace-normal"}`}>{body}</span>}</button> })}</div></div>
}

function EditTimelineItem({ item, setItem, saving, onClose, onSave, onDelete }: { item: ProjectTimelineItem; setItem: (item: ProjectTimelineItem) => void; saving: boolean; onClose: () => void; onSave: () => void; onDelete: () => void }) {
  const update = <K extends keyof ProjectTimelineItem>(key: K, value: ProjectTimelineItem[K]) => setItem({ ...item, [key]: value })
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102a21]/45 p-4" onMouseDown={onClose}><div className="w-full max-w-2xl rounded-3xl border bg-card p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="mb-5 flex items-center justify-between"><div><p className="section-kicker">Edit schedule block</p><h3 className="mt-1 text-lg font-semibold">编辑排期内容</h3></div><Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button></div><div className="grid gap-3 sm:grid-cols-2"><Input value={item.title} placeholder="节点名称" onChange={(event) => update("title", event.target.value)} /><select className="h-10 rounded-xl border bg-card px-3 text-sm" value={item.track} onChange={(event) => update("track", event.target.value)}>{TIMELINE_TRACKS.map((track) => <option key={track}>{track}</option>)}</select><Input type="date" value={item.start_date} onChange={(event) => update("start_date", event.target.value)} /><Input type="date" value={item.end_date} onChange={(event) => update("end_date", event.target.value)} /><select className="h-10 rounded-xl border bg-card px-3 text-sm" value={item.status} onChange={(event) => update("status", event.target.value as TimelineStatus)}>{TIMELINE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select></div><Textarea className="mt-3" rows={5} value={item.content || ""} placeholder="填写这个时间段内的具体工作内容" onChange={(event) => update("content", event.target.value)} /><Textarea className="mt-3" rows={2} value={item.notes || ""} placeholder="备注、负责人或交付标准（可选）" onChange={(event) => update("notes", event.target.value)} /><div className="mt-5 flex items-center justify-between"><Button variant="ghost" className="text-destructive hover:text-destructive" disabled={saving} onClick={onDelete}>删除节点</Button><div className="flex gap-2"><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={saving} onClick={onSave}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存内容</Button></div></div></div></div>
}
