import test from "node:test"
import assert from "node:assert/strict"
import { departmentScheduleEntries, scheduleDateLabel, scheduleDepartment } from "../src/lib/projects/department-schedule"
import type { ProjectTimelineItem } from "../src/hooks/use-project-timeline"

const item = (overrides: Partial<ProjectTimelineItem> = {}): ProjectTimelineItem => ({ id: "one", user_id: "owner", project_id: "project", title: "抽卡前三集", content: "抽卡前三集", track: "制作部", notes: null, start_date: "2026-11-20", end_date: "2026-11-20", status: "planned", created_at: "", updated_at: "", ...overrides })

test("dates are explicit, including ranges and unknown dates", () => {
  assert.equal(scheduleDateLabel("2026-11-23", "2026-11-23"), "11月23日")
  assert.equal(scheduleDateLabel("2026-11-29", "2026-12-05"), "11月29日—12月5日")
  assert.equal(scheduleDateLabel("2026-12-31", "2027-01-02"), "2026年12月31日—2027年1月2日")
  assert.equal(scheduleDateLabel(null, null), "日期待定")
})

test("keeps explicit department ownership and original task names", () => {
  assert.equal(scheduleDepartment("其他"), "协同事项")
  assert.equal(scheduleDepartment("发行/运营"), "协同事项")
  assert.equal(scheduleDepartment("制作部（承制）"), "制作部")
  const entries = departmentScheduleEntries([item()], "2026-11-01", "2026-12-31")
  assert.equal(entries[0].title, "抽卡前三集")
  assert.equal(entries[0].start, "2026-11-20")
})

test("notes expose undated work without borrowing a dated milestone's date", () => {
  const original = item({ track: "其他", title: "承制签约", notes: "可提前启动美术资产制作：日期待定，原表无日期表头；新剧围读：日期待定。尾款30%=5.4万元：付款日期待定。" })
  const entries = departmentScheduleEntries([original], "2026-11-01", "2026-12-31")
  assert.equal(entries.length, 4)
  assert.ok(entries.some((entry) => entry.title === "新剧围读" && entry.department === "内容部" && entry.start === null))
  assert.ok(entries.some((entry) => entry.title === "可提前启动美术资产制作" && entry.department === "制作部" && entry.start === null))
  assert.ok(entries.some((entry) => entry.title === "尾款30%=5.4万元" && entry.department === "协同事项" && entry.start === null))
  assert.equal(original.start_date, "2026-11-20")
})

test("retains paused work but excludes superseded and out-of-range plans", () => {
  const entries = departmentScheduleEntries([item({ status: "paused" }), item({ id: "old", title: "历史排期（已替代）" }), item({ id: "october", start_date: "2026-10-20", end_date: "2026-10-20" })], "2026-11-01", "2026-12-31")
  assert.deepEqual(entries.map((entry) => entry.item.id), ["one"])
})

test("production metadata is not mistaken for an undated task", () => {
  const entries = departmentScheduleEntries([item({ notes: "制作方式：自制 | 算力节点1.5万元：日期待定。" })], "2026-11-01", "2026-12-31")
  assert.equal(entries[1].title, "算力节点1.5万元")
  assert.equal(entries[1].department, "协同事项")
})
