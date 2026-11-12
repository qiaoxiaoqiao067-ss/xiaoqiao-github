import type { ProjectTimelineItem } from "@/hooks/use-project-timeline"
import { isSupersededSchedule } from "./department-schedule"

export const CURRENT_SCHEDULE_SOURCE = "《Ai短剧项目进度汇总（11月6日）》"
export const CURRENT_SCHEDULE_LABEL = "11月6日排期"

export type ScheduleHistoryEntry = {
  item: ProjectTimelineItem
  source: string
  reason: "旧版" | "已替代" | "重复记录"
  duplicateOf?: string
}

export function scheduleSource(notes: string | null | undefined): string | null {
  return notes?.match(/来源\s*[：:]\s*([^；;。\n|]+)/)?.[1].trim() || null
}

const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase()

export function isCurrentScheduleSource(notes: string | null | undefined) {
  const source = normalize(scheduleSource(notes) || "").replace(/[《》]/g, "").replace(/\.docx$/, "")
  return source === "ai短剧项目进度汇总(11月6日)"
}

// Newly added work belongs to the current version unless an import names its
// own source. Never relabel an explicitly dated historical import as current.
export function withScheduleSource(notes: string | null | undefined) {
  const value = notes?.trim() || ""
  return scheduleSource(value) ? value : `来源：${CURRENT_SCHEDULE_SOURCE}${value ? `；${value}` : ""}`
}

function duplicateKey(item: ProjectTimelineItem) {
  const productionMode = `${item.track} ${item.notes || ""}`.match(/自制|承制/)?.[0] || ""
  const track = item.track.startsWith("制作部") ? `制作部${productionMode}` : item.track
  // Keep different projects, production modes, dates, and task wording apart.
  return JSON.stringify([item.project_id, track, item.start_date, item.end_date, normalize(item.title), normalize(item.content || "")])
}

export function partitionScheduleVersions(items: ProjectTimelineItem[]) {
  const current: ProjectTimelineItem[] = []
  const history: ScheduleHistoryEntry[] = []
  const seen = new Map<string, string>()
  // Prefer the most recently maintained copy; retain every other record in history.
  const ordered = [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
  for (const item of ordered) {
    const latest = isCurrentScheduleSource(item.notes)
    const source = scheduleSource(item.notes) || (/10\s*\/\s*26/.test(item.notes || "") ? "10/26 排期" : "未标注来源")
    const key = `${latest ? "current" : normalize(source)}|${duplicateKey(item)}`
    const duplicateOf = seen.get(key)
    const superseded = isSupersededSchedule(item)
    if (!superseded && !duplicateOf) seen.set(key, item.id)
    if (superseded) history.push({ item, source, reason: "已替代" })
    else if (duplicateOf) history.push({ item, source, reason: "重复记录", duplicateOf })
    else if (latest) current.push(item)
    else history.push({ item, source, reason: "旧版" })
  }
  current.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id))
  history.sort((a, b) => b.item.start_date.localeCompare(a.item.start_date) || a.item.project_id.localeCompare(b.item.project_id) || a.item.id.localeCompare(b.item.id))
  return { current, history }
}
