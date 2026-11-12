import test from 'node:test'
import assert from 'node:assert/strict'
import {makeDailyBrief,dailyBriefState,parseDailySignals} from '../src/lib/adx/daily-brief'
const report='# ADX日报｜2026-11-10\n\n## 2. 三个市场信号\n\n1）作品加速\n事实：第58→4。\n判断：需要看片。\n行动：核对前三集。\n\n2）头部分化\n事实：同账号下降。\n判断：不能推断收入。\n行动：继续观察。\n\n## 3. 其他\n不要混入'
const success=()=>makeDailyBrief({data_date:'2026-11-10',status:'completed_with_source_shortfall',generated_at_shanghai:'2026-11-11 11:06:16',actual_records:774,target_records:800},report,'run-success')
test('existing report paragraphs retain fact, judgment and action without fabrication',()=>{
 const s=parseDailySignals(report);assert.equal(s.length,2);assert.equal(s[0].fact,'第58→4。');assert.equal(s[0].judgment,'需要看片。');assert.equal(s[0].action,'核对前三集。');assert.equal(s[1].action,'继续观察。')
 assert.deepEqual(parseDailySignals('无法读取的日报'),[])
})
test('a failed new run does not replace or redate the last successful report',()=>{
 const bad=makeDailyBrief({data_date:null,requested_data_date:'2026-11-11',status:'blocked_login_required',checked_at:'2026-11-12T02:31:00Z',actual_records:0},report,'run-fail')
 assert.equal(bad.report,null);const state=dailyBriefState([success(),bad],new Date('2026-11-12T03:00:00Z'))
 assert.equal(state.latest?.status,'blocked_login_required');assert.equal(state.report?.dataDate,'2026-11-10');assert.equal(state.stale,true);assert.equal(state.expectedDate,'2026-11-11')
})
test('freshness uses Shanghai 10:30 schedule, not execution host timezone',()=>{
 assert.equal(dailyBriefState([success()],new Date('2026-11-11T16:30:00Z')).stale,false)
 assert.equal(dailyBriefState([success()],new Date('2026-11-12T02:30:00Z')).stale,true)
 assert.equal(success().collectedAt,'2026-11-11T03:06:16.000Z')
})
test('missing or conflicting report dates are not silently inferred',()=>{
 assert.throws(()=>makeDailyBrief({data_date:'2026-11-09',status:'completed',checked_at:'2026-11-11T00:00:00Z'},report,'bad'),/日期/)
 assert.throws(()=>makeDailyBrief({data_date:'2026-11-10',status:'completed'},report,'bad'),/时间/)
})
test('partial source coverage shows collected boards rather than requested board count',()=>{
 const brief=makeDailyBrief({data_date:'2026-11-11',status:'completed_with_source_gaps',checked_at:'2026-11-12T03:00:00Z',ranking_count:14,collected_ranking_count:13},null,'partial')
 assert.equal(brief.boardCount,13)
})
