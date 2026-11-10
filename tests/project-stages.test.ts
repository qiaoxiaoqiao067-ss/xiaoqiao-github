import assert from "node:assert/strict"
import test from "node:test"
import { normalizeProjectWorkflow, projectStageProgress, PROJECT_STAGES } from "../src/lib/projects/stages"

test("five stages always produce fixed progress, including a backward selection", () => {
  assert.deepEqual(PROJECT_STAGES.map(projectStageProgress), [20, 40, 60, 80, 100])
  assert.equal(normalizeProjectWorkflow({ stage: "剧本开发", progress: 80 }).progress, 40)
})
test("old projects retain their workflow meaning instead of manual percentages", () => {
  for (const stage of ["正式推进", "剧本修改", "剧本定稿", "前30集", "60集完本"]) {
    assert.deepEqual(normalizeProjectWorkflow({ stage, progress: 10 }), { stage: "剧本开发", progress: 40 })
  }
  assert.equal(projectStageProgress("双语稿确认"), 60)
  assert.equal(projectStageProgress("围读"), 60)
  assert.equal(projectStageProgress("制作交接"), 80)
  assert.equal(projectStageProgress("拟购买/合同审批"), 20)
  assert.equal(projectStageProgress("完成归档"), 100)
})
