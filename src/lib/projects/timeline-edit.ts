import { storageTimelineTrack, withProductionMode, type ProjectTimelineItem, type TimelineInput } from "../../hooks/use-project-timeline"
import { isCurrentScheduleSource, withScheduleSource } from "./schedule-versions"

export function timelineEditInput(original: ProjectTimelineItem, draft: ProjectTimelineItem): Partial<TimelineInput> {
  if (!draft.title.trim()) throw new Error("请填写节点名称")
  if (!draft.start_date || !draft.end_date) throw new Error("请填写开始和结束日期")
  if (draft.end_date < draft.start_date) throw new Error("结束日期不能早于开始日期")
  const cleanNotes = (draft.notes || "").replace(/^制作方式[：:](?:自制|承制|待确认)(?:\s*\|\s*|$)/, "").trim()
  const notes = isCurrentScheduleSource(original.notes) ? withScheduleSource(cleanNotes) : cleanNotes
  return {
    title: draft.title.trim(),
    track: storageTimelineTrack(draft.track),
    start_date: draft.start_date,
    end_date: draft.end_date,
    status: draft.status,
    content: draft.content?.trim() || null,
    notes: withProductionMode(notes, draft.track) || null,
  }
}
