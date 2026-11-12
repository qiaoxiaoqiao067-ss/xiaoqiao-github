import type { ProjectTimelineItem } from "@/hooks/use-project-timeline"

export type ScheduleDepartment = "内容部" | "制作部" | "协同事项"
export type ScheduleEntry = {
  key: string
  item: ProjectTimelineItem
  department: ScheduleDepartment
  title: string
  start: string | null
  end: string | null
}

export function scheduleDepartment(track: string): ScheduleDepartment {
  if (track === "内容部") return "内容部"
  if (track.startsWith("制作部")) return "制作部"
  return "协同事项"
}

export function scheduleDateLabel(start: string | null, end: string | null) {
  if (!start) return "日期待定"
  const label = (date: string) => {
    const [, month, day] = date.split("-")
    return `${Number(month)}月${Number(day)}日`
  }
  if (!end || start === end) return label(start)
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${start.slice(0, 4)}年${label(start)}—${end.slice(0, 4)}年${label(end)}`
  return `${label(start)}—${label(end)}`
}

export function isSupersededSchedule(item: ProjectTimelineItem) {
  return /已替代|已由[^。]*替代/.test(`${item.title} ${item.content || ""} ${item.notes || ""}`)
}

// Older imports keep undated work in notes. Expose it without assigning the
// enclosing milestone's date or changing the original stored record.
export function pendingScheduleEntries(item: ProjectTimelineItem): ScheduleEntry[] {
  const notes = (item.notes || "").replace(/^制作方式[：:][^|]*\|\s*/, "")
  return notes.split(/[。；;\n]/).flatMap((sentence, index) => {
    if (!/日期(?:均)?待定/.test(sentence)) return []
    const title = sentence.split(/[：:]/)[0].trim()
    if (!title || /日期(?:均)?待定/.test(title)) {
      const task = sentence.replace(/[，,].*$/, "").replace(/日期(?:均)?待定/, "").trim()
      return task ? [{ key: `${item.id}:pending:${index}`, item, department: scheduleDepartment(item.track), title: task, start: null, end: null }] : []
    }
    const department: ScheduleDepartment = /付款|尾款|算力|分发|平台|投流/.test(title) ? "协同事项"
      : /围读|剧本|本土化/.test(title) ? "内容部"
        : /美术|资产|抽卡|剪辑|完片/.test(title) ? "制作部" : scheduleDepartment(item.track)
    return [{ key: `${item.id}:pending:${index}`, item, department, title, start: null, end: null }]
  })
}

export function departmentScheduleEntries(items: ProjectTimelineItem[], first: string, last: string): ScheduleEntry[] {
  const visible = items.filter((item) => !isSupersededSchedule(item) && item.end_date >= first && item.start_date <= last)
  const entries = visible.flatMap((item): ScheduleEntry[] => [
    { key: item.id, item, department: scheduleDepartment(item.track), title: item.title.trim() || item.content?.trim() || "排期事项", start: item.start_date, end: item.end_date },
    ...pendingScheduleEntries(item),
  ])
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = [entry.item.project_id, entry.department, entry.start, entry.end, entry.title].join("|")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999") || a.title.localeCompare(b.title, "zh-CN"))
}
