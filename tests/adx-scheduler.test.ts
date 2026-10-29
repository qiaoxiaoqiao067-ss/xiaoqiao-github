import assert from "node:assert/strict"
import test from "node:test"
import { capAdxExportRows } from "@/lib/adx/local-connector"
import { getPreviousAdxPeriod, getScheduledAdxBoardTasks, getScheduledAdxRankTypes, type AdxScheduleRun } from "@/lib/adx/local-scheduler"

const shanghaiDate = (value: string) => new Date(value)

test("previous daily and monthly periods use Shanghai calendar boundaries", () => {
  const now = shanghaiDate("2026-11-03T03:30:00.000Z") // 11:30 in Shanghai
  assert.equal(getPreviousAdxPeriod("day", now), "2026年11月2日")
  assert.equal(getPreviousAdxPeriod("month", now), "2026年10月")
})

test("previous week uses the completed ISO Monday-to-Sunday week", () => {
  const now = shanghaiDate("2026-10-20T03:30:00.000Z") // Tuesday 11:30 in Shanghai
  assert.equal(getPreviousAdxPeriod("week", now), "2026年第42周")
  assert.deepEqual(getScheduledAdxRankTypes(now, [], "2026-10-19T00:00:00+08:00"), ["day", "week"])
})

test("month opening schedule runs daily, weekly, and monthly imports once", () => {
  const now = shanghaiDate("2026-11-03T03:30:00.000Z")
  assert.deepEqual(getScheduledAdxRankTypes(now, [], "2026-10-01T00:00:00+08:00"), ["day", "week", "month"])
})

test("weekly retry happens Wednesday, but stops after two attempts", () => {
  const failed: AdxScheduleRun = {
    id: "week-failed", rankType: "week", period: "2026年第42周",
    attemptedAt: "2026-10-20T03:30:00.000Z", status: "failed", message: "not ready",
  }
  const retryTime = shanghaiDate("2026-10-21T03:30:00.000Z")
  assert.ok(getScheduledAdxRankTypes(retryTime, [failed]).includes("week"))
  assert.ok(!getScheduledAdxRankTypes(retryTime, [failed, { ...failed, id: "week-retry-failed" }]).includes("week"))
})

test("daily retry is available at 17:30 and no run is due before 11:30", () => {
  const before = shanghaiDate("2026-10-18T03:29:00.000Z")
  const retry = shanghaiDate("2026-10-18T09:30:00.000Z") // 17:30 in Shanghai
  const priorMonthComplete: AdxScheduleRun = {
    id: "month-done", rankType: "month", period: "2026年9月",
    attemptedAt: "2026-10-03T03:30:00.000Z", status: "success", message: "done",
  }
  assert.deepEqual(getScheduledAdxRankTypes(before, [priorMonthComplete]), [])
  assert.deepEqual(getScheduledAdxRankTypes(retry, [priorMonthComplete]), ["day"])
})

test("board scheduler creates 14 independently tracked exports per due period", () => {
  const tue = shanghaiDate("2026-10-20T03:30:00.000Z")
  const tasks = getScheduledAdxBoardTasks(tue, [], "2026-10-01T00:00:00+08:00")
  const weekTasks = tasks.filter((task) => task.rankType === "week")
  assert.equal(weekTasks.length, 14)
  assert.equal(weekTasks.filter((task) => task.boardType === "platform").length, 12)
  assert.equal(new Set(weekTasks.map((task) => `${task.boardType}:${task.platform || ""}`)).size, 14)
})

test("board scheduler retries failed source-platform pairs independently", () => {
  const wed = shanghaiDate("2026-10-21T03:30:00.000Z")
  const base: AdxScheduleRun = {
    id: "short-ok", rankType: "week", boardType: "short-drama", period: "2026年第42周",
    attemptedAt: "2026-10-20T03:30:00.000Z", status: "success", message: "done",
  }
  const failed: AdxScheduleRun = {
    id: "platform-failed", rankType: "week", boardType: "platform", platform: "DramaBox", period: "2026年第42周",
    attemptedAt: "2026-10-20T03:30:00.000Z", status: "failed", message: "not ready",
  }
  const tasks = getScheduledAdxBoardTasks(wed, [base, failed])
  assert.ok(!tasks.some((task) => task.rankType === "week" && task.boardType === "short-drama"))
  assert.ok(tasks.some((task) => task.rankType === "week" && task.boardType === "platform" && task.platform === "DramaBox"))
  const failedTwice = { ...failed, id: "platform-failed-again", attemptedAt: "2026-10-21T03:30:00.000Z" }
  assert.ok(!getScheduledAdxBoardTasks(wed, [base, failed, failedTwice]).some((task) => task.rankType === "week" && task.boardType === "platform" && task.platform === "DramaBox"))
})

test("ADX export caps candidates at 5000 then keeps the requested rank count", () => {
  const candidates = Array.from({ length: 6000 }, (_, index) => ({ rank: index + 1 }))
  assert.equal(capAdxExportRows(candidates, "day").length, 50)
  assert.equal(capAdxExportRows(candidates, "week").length, 300)
  assert.equal(capAdxExportRows(candidates, "month").length, 500)
  const platformRows = capAdxExportRows(candidates, "month", "DramaBox")
  assert.equal(platformRows.length, 500)
  assert.equal(platformRows[0].平台, "DramaBox")
})
