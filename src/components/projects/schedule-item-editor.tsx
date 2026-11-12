"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { Loader2, X } from "lucide-react"
import { displayTimelineTrack, TIMELINE_STATUSES, TIMELINE_TRACKS, type ProjectTimelineItem, type TimelineInput, type TimelineStatus } from "@/hooks/use-project-timeline"
import { timelineEditInput } from "@/lib/projects/timeline-edit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const STATUS: Record<TimelineStatus, string> = { planned: "待开始", active: "进行中", completed: "已完成", delayed: "已延期", paused: "已暂停" }
type Props = {
  item: ProjectTimelineItem
  projectTitle?: string
  onClose: () => void
  onSave: (id: string, updates: Partial<TimelineInput>) => Promise<unknown>
  onDelete?: (id: string) => Promise<unknown>
}

export function ScheduleItemEditor({ item, projectTitle, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState(() => ({ ...item, track: displayTimelineTrack(item) as string }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const dialog = useRef<HTMLDialogElement>(null)
  const prefix = useId()
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  const update = <K extends keyof ProjectTimelineItem>(key: K, value: ProjectTimelineItem[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true); setError("")
    try { await onSave(item.id, timelineEditInput(item, draft)); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请重试") }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!onDelete) return
    setSaving(true); setError("")
    try { await onDelete(item.id); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败，请重试") }
    finally { setSaving(false) }
  }
  return <dialog ref={dialog} aria-labelledby={`${prefix}-title`} onCancel={(event) => { event.preventDefault(); if (!saving) onClose() }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-3xl border bg-card p-5 text-foreground shadow-2xl backdrop:bg-[#102a21]/45 sm:p-6">
    <form onSubmit={(event) => void save(event)}>
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id={`${prefix}-title`} className="text-lg font-semibold">编辑排期</h2>{projectTitle && <p className="mt-1 text-sm text-muted-foreground">{projectTitle}</p>}<p className="mt-1 text-xs text-muted-foreground">保存后同步更新首页日历与项目推进。</p></div><Button type="button" size="icon" variant="ghost" aria-label="关闭排期编辑" disabled={saving} onClick={onClose}><X className="h-4 w-4" /></Button></div>
      <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2"><span>节点名称</span><Input required maxLength={300} value={draft.title} onChange={(event) => update("title", event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span>部门 / 制作方式</span><select className="h-10 w-full rounded-xl border bg-card px-3 text-sm" value={draft.track} onChange={(event) => update("track", event.target.value)}>{TIMELINE_TRACKS.map((track) => <option key={track}>{track}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>状态</span><select className="h-10 w-full rounded-xl border bg-card px-3 text-sm" value={draft.status} onChange={(event) => update("status", event.target.value as TimelineStatus)}>{TIMELINE_STATUSES.map((status) => <option key={status} value={status}>{STATUS[status]}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>开始日期</span><Input required type="date" value={draft.start_date} onChange={(event) => update("start_date", event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span>结束日期</span><Input required type="date" min={draft.start_date} value={draft.end_date} onChange={(event) => update("end_date", event.target.value)} /></label>
        <label className="space-y-1 text-sm sm:col-span-2"><span>具体内容</span><Textarea rows={3} maxLength={20000} value={draft.content || ""} onChange={(event) => update("content", event.target.value)} /></label>
        <label className="space-y-1 text-sm sm:col-span-2"><span>备注 / 交付标准</span><Textarea rows={2} maxLength={20000} value={draft.notes || ""} onChange={(event) => update("notes", event.target.value)} /></label>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex items-center justify-between gap-3">{onDelete ? <Button type="button" variant="ghost" className="text-destructive" disabled={saving} onClick={() => void remove()}>删除节点</Button> : <span />}<div className="flex gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>取消</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}保存排期</Button></div></div>
    </form>
  </dialog>
}
