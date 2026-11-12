import test from "node:test"
import assert from "node:assert/strict"
import { sourceFromText } from "../src/lib/statistics/extract"
import { analyzeScript } from "../src/lib/statistics/engine"
import { quotationText, selectedLines, statisticsCsv, statisticsReport } from "../src/components/statistics/report"

test("quotation, selected CSV and saved report describe the same chosen range and corrections", async () => {
  const source = await sourceFromText("第1集\n1-1 日 内 房间\n人物：甲\n甲：你好。\n\n第2集\n2-1 日 内 房间\n人物：甲\n甲：明天见。", "example.txt")
  const line = source.lines.find(row => row.text === "甲：明天见。")!
  const options = { startEpisode: 2, endEpisode: 2, minRate: 120, maxRate: 150, includeVoiceover: true, contentOverrides: { [line.id]: "后天再见。" } }
  const result = analyzeScript(source, options)
  assert.equal(result.totals.dialogue, 4)
  assert.equal(result.totals.minCost, 0.48)
  assert.equal(result.totals.maxCost, 0.60)
  assert.ok(selectedLines(result, options).every(row => row.episode === 2))
  assert.match(quotationText(source, result, options, false), /0\.48—¥0\.60/)
  const csv = statisticsCsv(result, options)
  assert.ok(csv.startsWith("\uFEFF"))
  assert.ok(!csv.includes("甲：你好。"))
  assert.ok(csv.includes("甲：明天见。"))
  assert.ok(csv.includes("后天再见。"))
  const report = statisticsReport({ ...source, fileId: "source-version", sourceVersion: 3 }, result, options, { id: "project", title: "示例" }, false)
  const metadata = JSON.parse(report.split("```json\n")[1].split("\n```")[0])
  assert.equal(metadata.fileHash, source.sourceHash)
  assert.equal(metadata.sourceVersion, 3)
  assert.equal(metadata.sourceFileId, "source-version")
  assert.equal(metadata.options.corrections[0].original, "甲：明天见。")
  assert.equal(metadata.options.corrections[0].contentOverride, "后天再见。")
})

test("CSV prefixes formula-like untrusted text even when it starts with whitespace", async () => {
  const source = await sourceFromText("第1集\n1-1 日 内 房间\n人物：甲\n甲：你好。", "example.txt")
  const result = analyzeScript(source)
  const row = result.lines.find(line => line.kind === "dialogue")!
  row.text = "\t=HYPERLINK(\"bad\")"
  row.content = " +SUM(1,2)"
  row.speaker = "@unsafe"
  const csv = statisticsCsv(result, {})
  assert.ok(csv.includes("'\t=HYPERLINK"))
  assert.ok(csv.includes("' +SUM"))
  assert.ok(csv.includes("'@unsafe"))
})

test("unresolved sources remain marked in copied and downloaded quotations", async () => {
  const source = await sourceFromText("第1集\n1-1 日 内 房间\n人物：甲\n没有标签的文字", "example.txt")
  const result = analyzeScript(source)
  assert.equal(result.needsReview, true)
  assert.match(quotationText(source, result, { minRate: 120, maxRate: 150 }, true), /待复核/)
  assert.match(statisticsReport(source, result, {}, undefined, false), /待复核/)
})
