import test from "node:test"
import assert from "node:assert/strict"
import { MARKET_SAMPLE_LIMITS, sampleMarketRows, latestBoardImports, marketBoardKey } from "../src/lib/market/monitoring-policy"

test("daily, weekly and monthly samples use the confirmed 50/300/500 limits", () => {
  const rows = Array.from({ length: 900 }, (_, index) => ({ rank: 900-index }))
  for (const kind of ["day", "week", "month"] as const) {
    const result = sampleMarketRows(rows, kind, row => row.rank)
    assert.equal(result.length, MARKET_SAMPLE_LIMITS[kind])
    assert.equal(result[0].rank, 1)
  }
  assert.equal(rows[0].rank, 900)
})
test("short and unranked sources retain actual rows without invented records", () => {
  const rows = [{ rank: null, title: "unranked" }, {rank: 2, title:"ranked"}]
  assert.deepEqual(sampleMarketRows(rows,"month", row => row.rank).map(row => row.title),["ranked","unranked"])
  assert.deepEqual(sampleMarketRows([],"day", () => null),[])
})
test("manual and automatic ADX refreshes replace the same board sample without erasing history", () => {
  assert.equal(marketBoardKey("ADX", "2026-10-TK短剧热播月榜.xlsx"),marketBoardKey("ADX定时同步", "TK短剧热播榜_月榜_2026-09.xlsx"))
  assert.equal(marketBoardKey("ADX", "2026-10-短剧月榜.xlsx"),marketBoardKey("ADX", "短剧榜_月榜_2026-09.xlsx"))
  const imports = [
    { source_name: "ADX", file_name: "短剧榜_月榜.xlsx", period_label: "2026年10月", created_at: "2026-11-01" },
    { source_name: "ADX定时同步", file_name: "ADX-短剧榜-2026年10月.xlsx", period_label: "2026年10月", created_at: "2026-11-02" },
    { source_name: "ADX", file_name: "TK短剧热播榜.xlsx", period_label: "2026年10月", created_at: "2026-11-01" },
    { source_name: "另一来源", file_name: "短剧榜.xlsx", period_label: "2026年10月", created_at: "2026-11-01" },
    { source_name: "ADX", file_name: "短剧榜_月榜.xlsx", period_label: "2026年9月", created_at: "2026-10-01" },
  ]
  const selected = latestBoardImports(imports)
  assert.equal(selected.length, 4)
  assert.equal(selected[0].source_name, "ADX定时同步")
  assert.equal(imports.length, 5)
})
