import type { Project } from "@/hooks/use-projects"
import type { ProjectTimelineItem } from "@/hooks/use-project-timeline"
import { scheduleDepartment, type ScheduleDepartment } from "./department-schedule"
import { partitionScheduleVersions } from "./schedule-versions"

export type CalendarItem = {
  id: string
  date: string
  endDate?: string
  title: string
  detail: string
  type: "task" | "meeting" | "project"
  href: string
  time: string
  scheduleId?: string
  projectId?: string
  department?: ScheduleDepartment
}

export type CalendarScheduleFilter = { department: ScheduleDepartment | "all"; projectId: string }

export function filterCalendarItems(items: CalendarItem[], filters: CalendarScheduleFilter): CalendarItem[] {
  if (filters.department === "all" && filters.projectId === "all") return items
  // Tasks and meetings have no authoritative project/department association.
  // An active schedule filter therefore shows matching project milestones only.
  return items.filter((item) => item.type === "project"
    && (filters.department === "all" || item.department === filters.department)
    && (filters.projectId === "all" || item.projectId === filters.projectId))
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function projectScheduleCalendarItems(items: ProjectTimelineItem[], projects: Pick<Project, "id" | "title" | "status">[]): CalendarItem[] {
  const names = new Map(projects.filter((project) => project.status !== "archived").map((project) => [project.id, project.title]))
  // Undated notes are separate reminders. Do not borrow their parent node's date.
  const dated = items.filter((item) => isDate(item.start_date) && isDate(item.end_date) && item.end_date >= item.start_date)
  const { current } = partitionScheduleVersions(dated)
  return current.flatMap((item): CalendarItem[] => {
    const project = names.get(item.project_id)
    if (!project || /(?:日期|时间)(?:均)?待定/.test(item.title) || /^(?:日期|时间)(?:均)?待定[。.!]?$/.test(item.content?.trim() || "")) return []
    return [{
      id: `schedule-${item.id}`,
      scheduleId: item.id,
      projectId: item.project_id,
      department: scheduleDepartment(item.track),
      date: item.start_date,
      endDate: item.end_date,
      title: project,
      detail: item.title.trim(),
      type: "project",
      href: "/projects",
      time: scheduleDepartment(item.track),
    }]
  })
}

export function calendarItemOnDate(item: Pick<CalendarItem, "date" | "endDate">, day: string) {
  const start = item.date.slice(0, 10)
  const end = item.endDate?.slice(0, 10) || start
  return start <= day && day <= end
}
