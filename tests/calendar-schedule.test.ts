import test from "node:test"
import assert from "node:assert/strict"
import type { ProjectTimelineItem } from "../src/hooks/use-project-timeline"
import { calendarItemOnDate, projectScheduleCalendarItems } from "../src/lib/projects/calendar-schedule"
import { CURRENT_SCHEDULE_SOURCE } from "../src/lib/projects/schedule-versions"

const projects = [{ id: "god", title: "黑帮教父", status: "active" as const }, { id: "queen", title: "黑帮女王", status: "active" as const }]
const node = (id: string, overrides: Partial<ProjectTimelineItem> = {}): ProjectTimelineItem => ({ id, user_id: "owner", project_id: "god", title: "前15集剪辑完成", content: "前15集剪辑完成", track: "制作部", notes: `来源：${CURRENT_SCHEDULE_SOURCE}`, start_date: "2026-11-11", end_date: "2026-11-11", status: "planned", created_at: "2026-11-10", updated_at: "2026-11-10", ...overrides })

test("calendar shares the latest-version deduplication and keeps each project's own milestone", () => {
  const records = [node("current"), node("copy", { updated_at: "2026-11-09" }), node("old", { notes: "来源：10/26最新排期" }), node("replaced", { title: "历史排期（已替代）" }), node("queen", { project_id: "queen" })]
  const result = projectScheduleCalendarItems(records, projects)
  assert.deepEqual(new Set(result.map((item) => item.id)), new Set(["schedule-current", "schedule-queen"]))
  assert.equal(result[0].detail, "前15集剪辑完成")
  assert.equal(result[0].time, "制作部")
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
