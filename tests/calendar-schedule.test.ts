import test from "node:test"
import assert from "node:assert/strict"
import type { ProjectTimelineItem } from "../src/hooks/use-project-timeline"
import { calendarItemOnDate, filterCalendarItems, projectScheduleCalendarItems, type CalendarItem } from "../src/lib/projects/calendar-schedule"
import { CURRENT_SCHEDULE_SOURCE } from "../src/lib/projects/schedule-versions"

const projects = [{ id: "god", title: "黑帮教父", status: "active" as const }, { id: "queen", title: "黑帮女王", status: "active" as const }]
const node = (id: string, overrides: Partial<ProjectTimelineItem> = {}): ProjectTimelineItem => ({ id, user_id: "owner", project_id: "god", title: "前15集剪辑完成", content: "前15集剪辑完成", track: "制作部", notes: `来源：${CURRENT_SCHEDULE_SOURCE}`, start_date: "2026-11-11", end_date: "2026-11-11", status: "planned", created_at: "2026-11-10", updated_at: "2026-11-10", ...overrides })

test("calendar shares the latest-version deduplication and keeps each project's own milestone", () => {
  const records = [node("current"), node("copy", { updated_at: "2026-11-09" }), node("old", { notes: "来源：10/26最新排期" }), node("replaced", { title: "历史排期（已替代）" }), node("queen", { project_id: "queen" })]
  const result = projectScheduleCalendarItems(records, projects)
  assert.deepEqual(new Set(result.map((item) => item.id)), new Set(["schedule-current", "schedule-queen"]))
  assert.equal(result[0].detail, "前15集剪辑完成")
  assert.equal(result[0].time, "制作部")
  assert.equal(result[0].department, "制作部")
  assert.equal(result.find((item) => item.id === "schedule-current")?.scheduleId, "current")
  assert.equal(result.find((item) => item.id === "schedule-current")?.projectId, "god")
  assert.ok(result.every((item) => item.href === "/projects"))
})

test("pending reminders in notes never become calendar entries or hide their dated parent", () => {
  const record = node("current", { notes: `来源：${CURRENT_SCHEDULE_SOURCE}；算力节点1.5万元：日期待定；新剧围读：日期待定。` })
  const result = projectScheduleCalendarItems([record], projects)
  assert.equal(result.length, 1)
  assert.equal(result[0].detail, "前15集剪辑完成")
  assert.equal(JSON.stringify(result).includes("待定"), false)
  assert.equal(JSON.stringify(result).includes("1.5万元"), false)
})

test("unknown, invalid, reversed and explicitly pending dates are excluded", () => {
  const records = [node("blank", { start_date: "", end_date: "" }), node("pending", { start_date: "待定" }), node("invalid", { start_date: "2026-02-30" }), node("reverse", { end_date: "2026-11-10" }), node("placeholder", { title: "新剧围读：日期待定" }), node("content-pending", { content: "日期待定" })]
  assert.deepEqual(projectScheduleCalendarItems(records, projects), [])
})

test("ranges remain on their actual dates, including month boundaries, without UTC date shifts", () => {
  const range = projectScheduleCalendarItems([node("range", { start_date: "2026-11-30", end_date: "2026-12-02" })], projects)[0]
  assert.equal(calendarItemOnDate(range, "2026-11-29"), false)
  assert.equal(calendarItemOnDate(range, "2026-11-30"), true)
  assert.equal(calendarItemOnDate(range, "2026-12-01"), true)
  assert.equal(calendarItemOnDate(range, "2026-12-02"), true)
  assert.equal(calendarItemOnDate(range, "2026-12-03"), false)
  assert.equal(calendarItemOnDate({ date: "2026-11-11T09:00:00+08:00" }, "2026-11-11"), true)
})

test("archived or missing projects and legacy project-level deadlines do not add events", () => {
  const input = [{ ...projects[0], status: "archived" as const, due_date: "2026-10-19" }]
  assert.deepEqual(projectScheduleCalendarItems([node("one"), node("missing", { project_id: "missing" })], input), [])
  assert.deepEqual(projectScheduleCalendarItems([], [{ ...projects[0] }]), [])
})

test("editing the source date moves the event instead of adding another calendar record", () => {
  const before = projectScheduleCalendarItems([node("one")], projects)
  const after = projectScheduleCalendarItems([node("one", { start_date: "2026-11-12", end_date: "2026-11-12" })], projects)
  assert.equal(after[0].id, before[0].id)
  assert.equal(after.length, 1)
  assert.equal(calendarItemOnDate(after[0], "2026-11-11"), false)
  assert.equal(calendarItemOnDate(after[0], "2026-11-12"), true)
})

test("all filters preserve the complete calendar, including tasks and meetings", () => {
  const events: CalendarItem[] = [
    ...projectScheduleCalendarItems([node("one")], projects),
    { id: "task", date: "2026-11-11", title: "任务", detail: "", type: "task", href: "/todos", time: "全天" },
    { id: "meeting", date: "2026-11-11", title: "会议", detail: "", type: "meeting", href: "/meetings", time: "10:00" },
  ]
  assert.deepEqual(filterCalendarItems(events, { department: "all", projectId: "all", status: "all" }), events)
  assert.deepEqual(filterCalendarItems(events, { department: "制作部", projectId: "all", status: "all" }).map((event) => event.id), ["schedule-one"])
})

test("department and stable project ID filters combine, even when project titles match", () => {
  const events = projectScheduleCalendarItems([
    node("god-content", { track: "内容部" }), node("god-production"),
    node("queen-content", { track: "内容部", project_id: "queen" }),
    node("queen-other", { track: "发行/运营", project_id: "queen" }),
  ], projects.map((project) => ({ ...project, title: "同名项目" })))
  assert.deepEqual(filterCalendarItems(events, { department: "内容部", projectId: "god", status: "all" }).map((event) => event.id), ["schedule-god-content"])
  assert.equal(filterCalendarItems(events, { department: "all", projectId: "queen", status: "all" }).length, 2)
  assert.deepEqual(filterCalendarItems(events, { department: "协同事项", projectId: "all", status: "all" }).map((event) => event.id), ["schedule-queen-other"])
  assert.deepEqual(filterCalendarItems(events, { department: "制作部", projectId: "queen", status: "all" }), [])
  assert.deepEqual(filterCalendarItems(events, { department: "all", projectId: "missing", status: "all" }), [])
})

test("filtering preserves editing identity and reacts to department edits", () => {
  const events = projectScheduleCalendarItems([node("one")], projects)
  const selected = filterCalendarItems(events, { department: "制作部", projectId: "god", status: "all" })
  assert.strictEqual(selected[0], events[0])
  assert.equal(selected[0].scheduleId, "one")
  const edited = projectScheduleCalendarItems([node("one", { track: "内容部" })], projects)
  assert.deepEqual(filterCalendarItems(edited, { department: "制作部", projectId: "god", status: "all" }), [])
  assert.equal(filterCalendarItems(edited, { department: "内容部", projectId: "god", status: "all" }).length, 1)
  assert.equal(filterCalendarItems(events, { department: "all", projectId: "all", status: "all" }).length, 1)
})

test("status filters use the saved status, with delayed separate from unfinished", () => {
  const statuses = ["planned", "active", "paused", "completed", "delayed"] as const
  const records = statuses.map((status) => node(status, { status, title: `节点 ${status} 剪辑完成` }))
  const events: CalendarItem[] = [
    ...projectScheduleCalendarItems(records, projects),
    { id: "task", date: "2026-11-11", title: "任务", detail: "", type: "task", href: "/todos", time: "全天" },
    { id: "meeting", date: "2026-11-11", title: "会议", detail: "", type: "meeting", href: "/meetings", time: "10:00" },
  ]
  const filtered = (status: "all" | "unfinished" | "completed" | "delayed") => filterCalendarItems(events, { department: "all", projectId: "all", status })
  assert.deepEqual(filtered("unfinished").map((event) => event.scheduleStatus).sort(), ["active", "paused", "planned"])
  assert.deepEqual(filtered("completed").map((event) => event.scheduleId), ["completed"])
  assert.deepEqual(filtered("delayed").map((event) => event.scheduleId), ["delayed"])
  assert.strictEqual(filtered("all"), events)
})

test("all three filters intersect and keep the corresponding editable record", () => {
  const events = projectScheduleCalendarItems([
    node("god-content-done", { title: "全本", track: "内容部", status: "completed" }),
    node("god-content-open", { title: "围读", track: "内容部", status: "active" }),
    node("god-production-done", { title: "初剪", status: "completed" }),
    node("queen-content-done", { title: "全本", track: "内容部", status: "completed", project_id: "queen" }),
    node("queen-content-late", { title: "围读", track: "内容部", status: "delayed", project_id: "queen" }),
  ], projects)
  const selection = filterCalendarItems(events, { department: "内容部", projectId: "god", status: "completed" })
  assert.deepEqual(selection.map((event) => event.scheduleId), ["god-content-done"])
  assert.strictEqual(selection[0], events.find((event) => event.scheduleId === "god-content-done"))
  assert.deepEqual(filterCalendarItems(events, { department: "内容部", projectId: "god", status: "delayed" }), [])
  assert.deepEqual(filterCalendarItems(events, { department: "内容部", projectId: "queen", status: "delayed" }).map((event) => event.scheduleId), ["queen-content-late"])
})

test("a saved status edit moves the same node between filters without resurfacing an older duplicate", () => {
  const before = projectScheduleCalendarItems([node("one", { status: "active" })], projects)
  const filters = { department: "制作部" as const, projectId: "god", status: "unfinished" as const }
  assert.equal(filterCalendarItems(before, filters).length, 1)
  const after = projectScheduleCalendarItems([
    node("one", { status: "completed", updated_at: "2026-11-13" }),
    node("older-copy", { status: "active", updated_at: "2026-11-10" }),
    node("historical", { status: "active", notes: "来源：10/26最新排期" }),
  ], projects)
  assert.deepEqual(filterCalendarItems(after, filters), [])
  const completed = filterCalendarItems(after, { ...filters, status: "completed" })
  assert.equal(completed.length, 1)
  assert.equal(completed[0].id, before[0].id)
  assert.equal(completed[0].scheduleId, "one")
})
