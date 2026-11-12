import {test} from 'node:test'
import assert from 'node:assert/strict'
import {activeMonthlySources,candidateWorks,describeContinuity,genreTimeline,historyRequests,monthKey,monthRange,monthlySeries,trackIdentity,workObservations} from '../src/lib/market/monthly-history'
import {isBoardImport} from '../src/lib/market/import-scope'
import {createRecordSchema,patchWatchSchema} from '../src/lib/market/research-records'
const source=(period:string,rows:Record<string,unknown>[],extra={})=>({id:period,source_name:'ADX',file_name:'TK短剧热播榜.xlsx',period_label:period,created_at:'2026-11-01',updated_at:'2026-11-01',raw_rows:rows,...extra})
const row=(n:number,title:string,tags='AI仿真人,家庭',channel='a')=>({'排名':n,'剧名':title,'标签':tags,'剧场号':channel,'播放增量':n*100})
test('calendar months include missing months and cross year boundaries',()=>{
 assert.equal(monthKey('2026年9月'),'2026-09');assert.equal(monthKey('2026-09'),'2026-09');assert.equal(monthKey('2026-09-01'),null);assert.equal(monthKey('2026年13月'),null)
 assert.deepEqual(monthRange('2026年2月',3),['2025-12','2026-01','2026-02'])
})
test('history loads only selected board and version markers; excludes reports',()=>{
 const items=[source('2026年9月',[]),source('2026年9月',[],{id:'other',file_name:'ReelShort月榜.xlsx'}),source('2026年9月',[{version_id:'a'}],{id:'marker',source_name:'市场版本:a'}),source('2026年8月',[])]
 assert.deepEqual(historyRequests(items,['2026-09'],'ADX:tiktok-hot').map(i=>i.id),['2026年9月','marker'])
 assert.equal(isBoardImport({source_name:'市场研究:watch'}),false);assert.equal(isBoardImport({source_name:'市场研究:archive'}),false)
})
test('explicit version marker wins over a more recent unrelated import',()=>{
 const items=[source('2026年9月',[row(1,'old')],{created_at:'2026-11-10'}),source('2026-09',[row(1,'chosen')],{source_name:'ADX版本:a'}),source('2026年9月',[{version_id:'a'}],{source_name:'市场版本:a',created_at:'2026-11-11'})]
 assert.equal(activeMonthlySources(items,'2026-09')[0].raw_rows[0]['剧名'],'chosen')
})
test('one common TopN denominator, no interpolation over missing month, zero genre differs from absent',()=>{
 const series=monthlySeries([source('2026年7月',[row(1,'x'),row(2,'y','AI仿真人,黑帮'),row(3,'z')]),source('2026年9月',[row(1,'x','AI仿真人,黑帮'),row(2,'y','AI仿真人,黑帮')])],['2026-07','2026-08','2026-09'],'ADX:tiktok-hot')
 const t=genreTimeline(series,'家庭');assert.equal(t.commonN,2);assert.deepEqual(t.points.map(p=>p.share),[50,null,0]);assert.ok(t.changes.every(c=>c.change===null))
})
test('month anomalies and mixed metric definitions block trends',()=>{
 const a=source('2026年8月',[row(1,'x')]),b=source('2026年9月',[row(1,'x')],{analysis_issues:['未来日期']})
 const t=genreTimeline(monthlySeries([a,b],['2026-08','2026-09'],'ADX:tiktok-hot'),'家庭');assert.equal(t.points[1].share,null)
 const heat=source('2026年9月',[{'排名':1,'剧名':'x','标签':'AI仿真人,家庭','热度':100}])
 const mixed=genreTimeline(monthlySeries([a,heat],['2026-08','2026-09'],'ADX:tiktok-hot'),'家庭');assert.ok(mixed.points.every(p=>p.share===null))
})
test('tracking separates channels, detects duplicates, preserves removed AI labels and missing data',()=>{
 const sources=[source('2026年7月',[row(1,'Story','AI仿真人,家庭','b'),row(2,'Story','AI仿真人,家庭','a')]),source('2026年8月',[row(1,'Story','家庭','a')]),source('2026年9月',[row(1,'Story','AI仿真人','a'),row(2,'Story','AI仿真人','a')])]
 const obs=workObservations(monthlySeries(sources,['2026-07','2026-08','2026-09','2026-10'],'ADX:tiktok-hot'),'Story','a')
 assert.equal(obs[0].rank,2);assert.equal(obs[1].rank,1);assert.equal(obs[1].tags,'家庭');assert.equal(obs[2].rank,null);assert.match(obs[2].state,/重复/);assert.equal(obs[3].state,'未采集')
 assert.notEqual(trackIdentity('ADX:tiktok-hot','Story','a'),trackIdentity('ADX:tiktok-hot','Story','b'));assert.equal(trackIdentity('ADX:tiktok-hot',' Story ','a'),trackIdentity('ADX:tiktok-hot','story','a'))
})
test('save requires explicit source version and concurrent update token; archive cannot patch content',()=>{
 assert.equal(createRecordSchema.safeParse({kind:'watch',title:'x',channel:''}).success,false)
 assert.equal(patchWatchSchema.safeParse({id:'00000000-0000-4000-8000-000000000001',status:'观察中',note:'a'}).success,false)
 assert.equal(createRecordSchema.safeParse({kind:'archive',requestId:'00000000-0000-4000-8000-000000000001',period:'2026年10月',comparison:'2026年9月',title:'研判',note:'',sources:[]}).success,false)
})

test('continuity conclusions require three valid recent months and do not bridge gaps',()=>{
 const points=(shares:(number|null)[])=>shares.map((share,i)=>({month:`2026-${i+1}`,share,works:10,count:1,reason:null}))
 assert.equal(describeContinuity(points([10,14,18])).title,'连续两次明显上升')
 assert.equal(describeContinuity(points([18,14,10])).title,'连续两次明显回落')
 assert.equal(describeContinuity(points([65,66,63])).title,'近三月相对稳定')
 assert.equal(describeContinuity(points([10,null,18])).title,'连续证据不足')
})

test('tracking candidates omit ambiguous duplicates but keep distinct channels',()=>{
 const sample=monthlySeries([source('2026年10月',[row(1,'Story','AI仿真人','a'),row(2,'Story','AI仿真人','a'),row(3,'Story','AI仿真人','b')])],['2026-10'],'ADX:tiktok-hot')[0].sample!
 assert.deepEqual(candidateWorks(sample).map(w=>w.channel),['b'])
})
