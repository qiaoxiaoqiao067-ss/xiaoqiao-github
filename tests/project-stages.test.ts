import assert from "node:assert/strict"
import test from "node:test"
import { assetStage, defaultAssetCategory } from "../src/lib/projects/assets"
import { PROJECT_STAGES, normalizeProjectStage, normalizeProjectWorkflow, projectStageProgress } from "../src/lib/projects/stages"
import { responsibilityLane } from "../src/lib/projects/responsibility-lanes"

test("项目阶段与飞书汇总保持一致", () => {
  assert.deepEqual(PROJECT_STAGES, ["合同中", "剧本开发", "本地化", "制作准备（美术资产、围读）", "AI制作", "发行投流"])
  assert.deepEqual(PROJECT_STAGES.map(projectStageProgress), [10, 30, 50, 70, 90, 100])
})

test("历史阶段和资料分类映射到新版阶段", () => {
  assert.equal(normalizeProjectStage("采购与合同"), "合同中")
  assert.equal(normalizeProjectStage("本地化与围读"), "本地化")
  assert.equal(normalizeProjectStage("制作与上线"), "AI制作")
  assert.equal(assetStage(null, "剧本采购合同"), "合同中")
  assert.equal(assetStage(null, "围读材料"), "制作准备（美术资产、围读）")
  assert.equal(defaultAssetCategory("发行投流"), "发行材料")
  assert.deepEqual(normalizeProjectWorkflow({ stage: "剧本开发", progress: 90 }), { stage: "剧本开发", progress: 30 })
  assert.equal(assetStage("推进中", "双语稿"), "本地化")
  assert.equal(responsibilityLane({ track: "内容部", title: "本土化交付", content: null, notes: null }), "本地化")
})
