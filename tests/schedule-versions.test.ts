import test from "node:test"
import assert from "node:assert/strict"
import type { ProjectTimelineItem } from "../src/hooks/use-project-timeline"
import { CURRENT_SCHEDULE_SOURCE, isCurrentScheduleSource, partitionScheduleVersions, withScheduleSource } from "../src/lib/projects/schedule-versions"

const item = (id: string, overrides: Partial<ProjectTimelineItem> = {}): ProjectTimelineItem => ({ id, user_id: "owner", project_id: "godfather", track: "制作部", title: "60集初剪完成", content: "60集初剪完成", notes: `制作方式：自制 | 来源：${CURRENT_SCHEDULE_SOURCE}；计划节点。`, start_date: "2026-11-23", end_date: "2026-11-23", status: "planned", created_at: "2026-11-10T00:00:00Z", updated_at: "2026-11-10T00:00:00Z", ...overrides })

test("latest source takes precedence over mentions of the prior schedule", () => {
  const latest = item("latest", { notes: `来源：${CURRENT_SCHEDULE_SOURCE}；原10/26版计划11/20，现调整为11/23。` })
  const legacy = item("legacy", { notes: "来源：10/26最新排期" })
  const superseded = item("superseded", { title: "历史排期（已替代）", notes: `历史记录：10/26版；已由${CURRENT_SCHEDULE_SOURCE}替代，原日期保留。` })
  const unmarked = item("unmarked", { notes: null })
  const result = partitionScheduleVersions([legacy, latest, superseded, unmarked])
  assert.deepEqual(result.current.map((record) => record.id), ["latest"])
  assert.deepEqual(new Set(result.history.map(({ item }) => item.id)), new Set(["legacy", "superseded", "unmarked"]))
  assert.equal(result.history.find(({ item }) => item.id === "superseded")?.reason, "已替代")
})

test("source recognition tolerates whitespace and fullwidth parentheses, but not arbitrary mentions", () => {
  assert.ok(isCurrentScheduleSource("制作方式：承制 | 来源: 《AI短剧项目进度汇总 (11月6日)》；原10/26版"))
  assert.equal(isCurrentScheduleSource(`备注：参考${CURRENT_SCHEDULE_SOURCE}`), false)
  assert.equal(isCurrentScheduleSource("来源：10/26最新排期；参考11月6日版本"), false)
  const superseded = item("old", { title: "历史排期（已替代）" })
  assert.equal(partitionScheduleVersions([superseded]).current.length, 0)
})

test("duplicate copies retain all original data in history and keep the latest edit in current", () => {
  const before = item("before", { notes: `来源：${CURRENT_SCHEDULE_SOURCE}；制作方式：自制 | 旧备注` })
  const after = item("after", { updated_at: "2026-11-12T00:00:00Z", status: "active" })
  const inputs = [before, after]
  const snapshot = JSON.stringify(inputs)
  const result = partitionScheduleVersions(inputs)
  assert.deepEqual(result.current, [after])
  assert.equal(result.history[0].reason, "重复记录")
  assert.equal(result.history[0].duplicateOf, "after")
  assert.strictEqual(result.history[0].item, before)
  assert.equal(JSON.stringify(inputs), snapshot)
  assert.equal(result.current.length + result.history.length, inputs.length)
  assert.deepEqual(partitionScheduleVersions([...inputs].reverse()), result)
})

test("shared tasks across projects and different work are not duplicates", () => {
  const records = [item("one"), item("queen", { project_id: "queen" }), item("other-date", { start_date: "2026-11-24", end_date: "2026-11-24" }), item("other-task", { title: "抽卡前三集" }), item("other-content", { content: "补充字幕后复审" }), item("other-mode", { notes: `制作方式：承制 | 来源：${CURRENT_SCHEDULE_SOURCE}` })]
  assert.equal(partitionScheduleVersions(records).current.length, records.length)
})

test("old duplicate imports remain in history and never enter the current version", () => {
  const old = item("old", { notes: "来源：10/26最新排期" })
  const copy = item("copy", { notes: "来源：10/26最新排期", updated_at: "2026-11-11T00:00:00Z" })
  const result = partitionScheduleVersions([old, copy])
  assert.equal(result.current.length, 0)
  assert.equal(result.history.length, 2)
  assert.equal(result.history.find(({ item }) => item.id === "old")?.reason, "重复记录")
})

test("new work receives current provenance while explicit historical sources are preserved", () => {
  assert.ok(isCurrentScheduleSource(withScheduleSource("补充字幕审核")))
  assert.ok(isCurrentScheduleSource(withScheduleSource("")))
  assert.equal(withScheduleSource("来源：10/26最新排期；原备注"), "来源：10/26最新排期；原备注")
  const notes = `来源：${CURRENT_SCHEDULE_SOURCE}；原备注`
  assert.equal(withScheduleSource(notes), notes)
})
