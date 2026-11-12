import test from "node:test"
import assert from "node:assert/strict"
import type { ProjectTimelineItem } from "../src/hooks/use-project-timeline"
import { timelineEditInput } from "../src/lib/projects/timeline-edit"
import { isCurrentScheduleSource, CURRENT_SCHEDULE_SOURCE } from "../src/lib/projects/schedule-versions"
import { projectScheduleCalendarItems } from "../src/lib/projects/calendar-schedule"

const original: ProjectTimelineItem = { id: "node", user_id: "owner", project_id: "project", title: "前30集完成", content: "前30集完成", track: "制作部", start_date: "2026-11-15", end_date: "2026-11-15", status: "planned", notes: `制作方式：承制 | 来源：${CURRENT_SCHEDULE_SOURCE}；围读：日期待定。`, created_at: "2026-11-10", updated_at: "2026-11-10" }

test("editing a dated node preserves its identity and current provenance even when notes are cleared", () => {
  const changes = timelineEditInput(original, { ...original, track: "内容部", title: "剧本完本", start_date: "2026-11-16", end_date: "2026-11-16", status: "active", notes: "", content: "" })
  assert.ok(isCurrentScheduleSource(changes.notes))
  assert.equal(changes.content, null)
  assert.equal(changes.track, "内容部")
  assert.equal(changes.notes?.includes("承制"), false)
  assert.equal(changes.status, "active")
  const events = projectScheduleCalendarItems([{ ...original, ...changes }], [{ id: "project", title: "项目", status: "active" }])
  assert.equal(events[0].scheduleId, "node")
  assert.equal(events[0].department, "内容部")
  assert.equal(events[0].date, "2026-11-16")
  assert.equal(events[0].detail, "剧本完本")
})

test("changing production mode replaces prior metadata and preserves undated notes", () => {
  const changes = timelineEditInput(original, { ...original, track: "制作部（自制）" })
  assert.equal(changes.track, "制作部")
  assert.ok(changes.notes?.startsWith("制作方式：自制 | "))
  assert.ok(changes.notes?.includes("围读：日期待定"))
  assert.equal(changes.notes?.includes("承制"), false)
})

test("editing a historical record does not promote it to the current version", () => {
  const old = { ...original, notes: "来源：10/26最新排期" }
  assert.equal(isCurrentScheduleSource(timelineEditInput(old, { ...old, track: "制作部（承制）" }).notes), false)
})

test("empty titles, missing dates and reversed date ranges cannot be saved", () => {
  for (const patch of [{ title: "  " }, { start_date: "" }, { end_date: "2026-11-14" }]) assert.throws(() => timelineEditInput(original, { ...original, ...patch }))
})
