"use client"

import { ChangeEvent, useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import { Archive, CalendarDays, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react"
import { type Project, type ProjectInput } from "@/hooks/use-projects"
import { TIMELINE_STATUSES, TIMELINE_TRACKS, type ProjectTimelineItem, type TimelineInput, type TimelineStatus, useProjectTimeline } from "@/hooks/use-project-timeline"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const STATUS_LABEL: Record<TimelineStatus, string> = { planned: "待开始", active: "进行中", completed: "已完成", delayed: "已延期", paused: "已暂停" }
const STATUS_STYLE: Record<TimelineStatus, string> = { planned: "bg-[#cdddb3] text-[#173f31]", active: "bg-[#174b39] text-white", completed: "bg-[#8ca7d0] text-white", delayed: "bg-[#e7ab72] text-[#44220d]", paused: "bg-[#b9b9b1] text-[#41443e]" }
const TRACK_STYLE: Record<string, { cell: string; block: string }> = {
  "内容部": { cell: "bg-[#eef5e5] text-[#174b39]", block: "ring-1 ring-[#78a83c]/55" },
  "制作部": { cell: "bg-[#f6f7f4] text-slate-600", block: "opacity-75 saturate-50" },
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
  return ["bg-[#214f78]", "bg-[#2d5d7a]", "bg-[#365b70]"][value.getMonth() % 3]
}
function monthCellTone(value: Date) {
  return ["bg-[#fbfcf8]", "bg-[#f4f8f1]", "bg-[#f5f7fb]"][value.getMonth() % 3]
}
function parseDate(value: unknown) {
  const text = String(value || "").trim().replace(/[./]/g, "-")
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) { const [year, month, day] = text.split("-"); return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? "" : ymd(date)
}

export function ProjectScheduleBoard({ projects, onUpdateProject, onDeleteProject }: { projects: Project[]; onUpdateProject: (id: string, updates: Partial<ProjectInput>) => Promise<Project>; onDeleteProject: (id: string) => Promise<void> }) {
  const { items, loading, error, addItem, addMany, updateItem, deleteItem } = useProjectTimeline()
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
  const tracks = ["内容部", "制作部", "发行/运营", "其他"]
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
    try { await addItem({ ...form, title: form.title.trim(), content: form.content.trim() || undefined, notes: form.notes.trim() || undefined }); setForm({ ...EMPTY, project_id: form.project_id }); setOpen(false) } finally { setSaving(false) }
  }
  const saveEditing = async () => {
    if (!editing || !editing.title.trim() || !editing.start_date || !editing.end_date) return
    setSaving(true)
    try {
      await updateItem(editing.id, { title: editing.title.trim(), content: editing.content?.trim() || undefined, track: editing.track, start_date: editing.start_date, end_date: editing.end_date, status: editing.status, notes: editing.notes?.trim() || undefined })
      setEditing(null)
    } finally { setSaving(false) }
  }
  const mapRow = (row: Record<string, unknown>): TimelineInput | null => {
    const projectName = String(row["项目"] || row["项目名称"] || row.project || row.project_name || "").trim()
    const project = projects.find((item) => item.id === projectName || item.title === projectName)
    const start = parseDate(row["开始日期"] || row["开始"] || row.start_date || row.start)
    const end = parseDate(row["结束日期"] || row["结束"] || row.end_date || row.end || row["开始日期"] || row.start_date)
    const title = String(row["节点"] || row["任务"] || row["事项"] || row.title || row.task || "排期事项").trim()
    const content = String(row["排期内容"] || row["内容"] || row.content || row["工作内容"] || "").trim()
    const track = String(row["轨道"] || row["部门"] || row.track || "内容部").trim()
    if (!project || !start || !end || !title) return null
    return { project_id: project.id, title, content: content || undefined, track: TIMELINE_TRACKS.includes(track as typeof TIMELINE_TRACKS[number]) ? track : "其他", start_date: start, end_date: end, status: "planned", notes: String(row["备注"] || row.notes || "").trim() || undefined }
  }
  const importRows = async (rows: Record<string, unknown>[]) => {
    const valid = rows.map(mapRow).filter((item): item is TimelineInput => Boolean(item))
    if (!valid.length) { setMessage("未找到有效排期。请包含：项目、部门/轨道、节点/任务、开始日期、结束日期。"); return }
    setSaving(true)
    try { await addMany(valid); setMessage(`已导入 ${valid.length} 个排期节点`); setImportOpen(false); setPaste("") } finally { setSaving(false) }
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
    await importRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: "", raw: false }))
    event.target.value = ""
  }

  return <Card className="overflow-hidden">
    <CardHeader className="border-b border-border/70"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><p className="section-kicker">Schedule · project × track × date</p><CardTitle className="mt-1 text-xl">项目排期时间轴</CardTitle><p className="mt-1 text-sm text-muted-foreground">默认总览展示未来 6 周；内容、制作轨道紧凑排列，点击任一方块即可编辑。</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant={viewMode === "overview" ? "default" : "outline"} onClick={() => setViewMode("overview")}>总览</Button><Button size="sm" variant={viewMode === "detail" ? "default" : "outline"} onClick={() => setViewMode("detail")}>细览</Button><Button size="sm" variant="outline" onClick={() => setAnchor(addDays(anchor, -28))}><ChevronLeft className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => setAnchor(monday(new Date()))}>回到本周</Button><Button size="sm" variant="outline" onClick={() => setAnchor(addDays(anchor, 28))}><ChevronRight className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => setImportOpen(!importOpen)}><FileSpreadsheet className="mr-1.5 h-4 w-4" />导入排期</Button><Button size="sm" onClick={() => setOpen(!open)}><Plus className="mr-1.5 h-4 w-4" />新增节点</Button></div></div></CardHeader>
    <CardContent className="space-y-4 p-0">
      {(open || importOpen) && <div className="space-y-4 border-b bg-muted/25 p-5">{open && <div className="grid gap-3 lg:grid-cols-6"><select className="h-10 rounded-xl border bg-card px-3 text-sm" value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}><option value="">选择项目 *</option>{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><select className="h-10 rounded-xl border bg-card px-3 text-sm" value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })}>{tracks.map((track) => <option key={track}>{track}</option>)}</select><Input placeholder="节点名称 *，例如：剧本修改" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /><select className="h-10 rounded-xl border bg-card px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TimelineStatus })}>{TIMELINE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select><Textarea className="lg:col-span-6" rows={2} placeholder="排期内容：例如，完成终审意见；编剧根据修改意见完成前三集重写；发起围读会确认版本。" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /><Textarea className="lg:col-span-5" rows={2} placeholder="备注、负责人或交付标准（可选）" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /><Button disabled={saving} onClick={() => void create()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存节点</Button></div>}{importOpen && <div className="rounded-2xl border border-dashed bg-card/70 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">导入文字或 Excel/CSV 排期表</p><p className="mt-1 text-xs text-muted-foreground">表头支持：项目、部门/轨道、节点/任务、排期内容、开始日期、结束日期、备注。项目名称须与工作台项目一致。</p></div><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void importFile(e)} /><Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="mr-1.5 h-4 w-4" />选择排期表</Button></div><Textarea className="mt-3" rows={4} placeholder={"或粘贴文本：\n项目名｜内容部｜2026-10-12~2026-10-14｜剧本修改｜完成前三集修改，确认围读版本｜责编确认\n项目名｜制作部｜2026-10-15｜角色测试｜启动角色与场景测试"} value={paste} onChange={(e) => setPaste(e.target.value)} /><div className="mt-3 flex justify-end"><Button size="sm" disabled={saving || !paste.trim()} onClick={() => void importText()}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}导入文字排期</Button></div></div>}{message && <p className="text-sm text-primary">{message}</p>}</div>}
      {loading ? <div className="h-72 animate-pulse bg-muted/40" /> : <div className="overflow-x-auto"><div className={viewMode === "overview" ? "min-w-[960px]" : "min-w-[6100px]"}><div className="grid border-b bg-[#214f78] text-white" style={{ gridTemplateColumns: viewMode === "overview" ? `120px 50px repeat(${days.length}, minmax(18px,1fr))` : `150px 70px repeat(${days.length}, minmax(70px,1fr))` }}><div className={`sticky left-0 z-30 flex items-center border-r border-white/20 bg-[#214f78] ${viewMode === "overview" ? "px-2 text-xs" : "px-4 text-sm"} font-semibold`}>项目</div><div className={`sticky z-30 flex items-center border-r border-white/20 bg-[#214f78] ${viewMode === "overview" ? "px-1 text-[10px]" : "px-3 text-sm"} font-semibold`} style={{ left: viewMode === "overview" ? 120 : 150 }}>轨道</div>{days.map((day, index) => <div key={ymd(day)} className={`border-r border-white/15 py-1 text-center ${monthHeaderTone(day)} ${day.getDate() === 1 ? "border-l-2 border-l-[#c9f45a]" : ""} ${viewMode === "overview" ? "px-0 text-[8px]" : "px-1 py-2 text-[10px]"} ${day.getDay() === 0 || day.getDay() === 6 ? "brightness-110" : ""}`}><span className="block font-semibold">{viewMode === "overview" ? (index === 0 || day.getDate() === 1 ? dayLabel(day) : day.getDate()) : dayLabel(day)}</span><span className={`block text-white/65 ${viewMode === "overview" ? "text-[7px]" : "text-[9px]"}`}>{weekLabel(day)}</span>{index === 0 && <CalendarDays className={`mx-auto text-[#c9f45a] ${viewMode === "overview" ? "mt-0.5 h-2.5 w-2.5" : "mt-1 h-3 w-3"}`} />}</div>)}</div>{activeProjects.length ? activeProjects.flatMap((project) => { const projectTracks = Array.from(new Set(["内容部", "制作部", ...items.filter((item) => item.project_id === project.id).map((item) => item.track)])); return projectTracks.map((track, rowIndex) => <TimelineRow key={`${project.id}-${track}`} project={project} track={track} isFirst={rowIndex === 0} days={days} compact={viewMode === "overview"} items={items.filter((item) => item.project_id === project.id && item.track === track)} onEdit={setEditing} onCreate={startNewAt} onRename={renameProject} onArchive={archiveProject} onDeleteProject={removeProject} />) }) : <div className="p-10 text-center text-sm text-muted-foreground">建立项目后，即可添加排期节点。</div>}</div></div>}{error && <p className="p-4 text-sm text-destructive">{error}</p>}
    </CardContent>
    {editing && <EditTimelineItem item={editing} setItem={setEditing} saving={saving} onClose={() => setEditing(null)} onSave={() => void saveEditing()} onDelete={async () => { setSaving(true); try { await deleteItem(editing.id); setEditing(null) } finally { setSaving(false) } }} />}
  </Card>
}

function TimelineRow({ project, track, isFirst, days, compact, items, onEdit, onCreate, onRename, onArchive, onDeleteProject }: { project: Project; track: string; isFirst: boolean; days: Date[]; compact: boolean; items: ProjectTimelineItem[]; onEdit: (item: ProjectTimelineItem) => void; onCreate: (projectId: string, track: string, date: string) => void; onRename: (project: Project) => void; onArchive: (project: Project) => void; onDeleteProject: (project: Project) => void }) {
  const columns = compact ? `120px 50px repeat(${days.length}, minmax(18px,1fr))` : `150px 70px repeat(${days.length}, minmax(70px,1fr))`; const first = ymd(days[0]); const last = ymd(days[days.length - 1]); const trackOffset = compact ? 120 : 150
  const trackStyle = TRACK_STYLE[track] || { cell: "bg-card text-muted-foreground", block: "opacity-85" }
  return <div className={`grid border-b ${compact ? "min-h-10" : "min-h-14"}`} style={{ gridTemplateColumns: columns }}><div className={`sticky left-0 z-20 flex items-center border-r bg-card ${compact ? "px-1.5 py-0.5" : "px-3 py-1"}`}><span className={`mr-1 h-2 w-2 shrink-0 rounded-full ${project.status === "active" ? "bg-[#c9f45a]" : "bg-muted-foreground/40"}`} />{isFirst ? <div className="flex min-w-0 flex-1 items-center gap-0.5"><p className={`min-w-0 flex-1 truncate font-semibold ${compact ? "text-[10px]" : "text-xs"}`}>{project.title}</p><button type="button" title="编辑项目名称" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => void onRename(project)}><Pencil className="h-2.5 w-2.5" /></button><button type="button" title="隐藏并归档项目" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => void onArchive(project)}><Archive className="h-2.5 w-2.5" /></button><button type="button" title="删除项目及排期" className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => void onDeleteProject(project)}><Trash2 className="h-2.5 w-2.5" /></button></div> : <span />}</div><div className={`sticky z-20 flex items-center border-r font-medium ${trackStyle.cell} ${compact ? "px-1 text-[9px]" : "px-3 text-xs"}`} style={{ left: trackOffset }}>{track}</div><div className="relative grid bg-card/50" style={{ gridColumn: `3 / span ${days.length}`, gridTemplateColumns: compact ? `repeat(${days.length}, minmax(18px,1fr))` : `repeat(${days.length}, minmax(70px,1fr))` }}>{days.map((day) => <button key={ymd(day)} type="button" title={`${ymd(day)} · ${weekLabel(day)} · 点击新增排期`} onClick={() => onCreate(project.id, track, ymd(day))} className={`border-r border-border/50 transition hover:bg-[#c9f45a]/20 ${monthCellTone(day)} ${day.getDate() === 1 ? "border-l-2 border-l-[#9bb36f]" : ""} ${day.getDay() === 0 || day.getDay() === 6 ? "brightness-[.985]" : ""}`} />)}{items.filter((item) => item.end_date >= first && item.start_date <= last).map((item) => { const start = Math.max(0, Math.round((toDate(item.start_date).getTime() - toDate(first).getTime()) / 86400000)); const end = Math.min(days.length - 1, Math.round((toDate(item.end_date).getTime() - toDate(first).getTime()) / 86400000)); const body = item.content || item.title; return <button key={item.id} title={`${item.title}：${body}（点击编辑）`} className={`z-10 m-0.5 min-w-0 overflow-hidden rounded-sm text-left font-semibold shadow-sm transition hover:brightness-95 ${compact ? "h-[34px] px-1 py-0.5 text-[8px] leading-3" : "m-1 rounded-md px-2 py-1 text-[10px] leading-4"} ${STATUS_STYLE[item.status]} ${trackStyle.block}`} style={{ gridColumn: `${start + 1} / ${end + 2}` }} onClick={() => onEdit({ ...item })}><span className={`flex items-center gap-1 opacity-70 ${compact ? "text-[8px]" : "text-[9px]"}`}><Pencil className={compact ? "h-2 w-2" : "h-2.5 w-2.5"} />{item.title}</span><span className={`block font-normal opacity-80 ${compact ? "truncate text-[7px]" : "whitespace-normal"}`}>{body}</span></button> })}</div></div>
}

function EditTimelineItem({ item, setItem, saving, onClose, onSave, onDelete }: { item: ProjectTimelineItem; setItem: (item: ProjectTimelineItem) => void; saving: boolean; onClose: () => void; onSave: () => void; onDelete: () => void }) {
  const update = <K extends keyof ProjectTimelineItem>(key: K, value: ProjectTimelineItem[K]) => setItem({ ...item, [key]: value })
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102a21]/45 p-4" onMouseDown={onClose}><div className="w-full max-w-2xl rounded-3xl border bg-card p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="mb-5 flex items-center justify-between"><div><p className="section-kicker">Edit schedule block</p><h3 className="mt-1 text-lg font-semibold">编辑排期内容</h3></div><Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button></div><div className="grid gap-3 sm:grid-cols-2"><Input value={item.title} placeholder="节点名称" onChange={(event) => update("title", event.target.value)} /><select className="h-10 rounded-xl border bg-card px-3 text-sm" value={item.track} onChange={(event) => update("track", event.target.value)}>{TIMELINE_TRACKS.map((track) => <option key={track}>{track}</option>)}</select><Input type="date" value={item.start_date} onChange={(event) => update("start_date", event.target.value)} /><Input type="date" value={item.end_date} onChange={(event) => update("end_date", event.target.value)} /><select className="h-10 rounded-xl border bg-card px-3 text-sm" value={item.status} onChange={(event) => update("status", event.target.value as TimelineStatus)}>{TIMELINE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select></div><Textarea className="mt-3" rows={5} value={item.content || ""} placeholder="填写这个时间段内的具体工作内容" onChange={(event) => update("content", event.target.value)} /><Textarea className="mt-3" rows={2} value={item.notes || ""} placeholder="备注、负责人或交付标准（可选）" onChange={(event) => update("notes", event.target.value)} /><div className="mt-5 flex items-center justify-between"><Button variant="ghost" className="text-destructive hover:text-destructive" disabled={saving} onClick={onDelete}>删除节点</Button><div className="flex gap-2"><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={saving} onClick={onSave}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存内容</Button></div></div></div></div>
}
