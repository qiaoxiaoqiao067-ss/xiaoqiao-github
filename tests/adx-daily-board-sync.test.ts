import {test} from 'node:test'
import assert from 'node:assert/strict'
import {prepareDailyBoards,dailyBatchTotals,AUTO_DAILY_SOURCE,DAILY_SYNC_SOURCE} from '../src/lib/adx/daily-board-sync'
import {boardSamples,compareBoards} from '../src/lib/market/board-analysis'
import {analysisSnapshot,isBoardImport} from '../src/lib/market/import-scope'
import {dayKey,dayRange,dailySeries,dailyWorkObservations,trackIdentity} from '../src/lib/market/monthly-history'
const filters={extra_filters:false,merge_same_drama:false,only_new_drama:false}
const row=(rank:number)=>({board:'TikTok短剧热播榜',rank,title:`Story ${rank}`,tags:rank===51?['AI仿真人']:['实拍'],sort:'播放增量',channel:'a',playback_increment:rank===1?0:100,heat:null,source_url:'https://oversea-v2.dataeye.com/playlet/tiktok-rank',captured_at:'2026-11-11T02:40:00Z',raw:{排行:'',剧名:`Story ${rank}`}})
const fixture=(n=100)=>({manifest:{data_date:'2026-11-10',status:'completed_with_source_shortfall',actual_records:n,generated_at_shanghai:'2026-11-11 11:00:00',boards:[{name:'TikTok短剧热播榜',data_date:'2026-11-10',actual:n,sort:'播放增量',status:'success',filters:{...filters},note:''}]},standard:{data_date:'2026-11-10',rows:Array.from({length:n},(_,i)=>row(i+1))}})
function prepare(n=100){const f=fixture(n);return prepareDailyBoards(f.manifest,f.standard,'2026-11-10/run','hash')}
test('normalizes without losing zero, missing values, provenance or raw page; uses real rank',()=>{
 const items=prepare(),r=items[0].raw_rows[0];assert.equal(r['排名'],1);assert.equal(r['播放增量'],0);assert.equal(r['热度'],null);assert.equal(r['剧名'],'Story 1');assert.ok(r['原始页面']);assert.equal(r['采集批次'],'2026-11-10/run');assert.equal(items[0].source_name,AUTO_DAILY_SOURCE)
 const sample=boardSamples(items,'day')[0];assert.equal(sample.rows.length,50);assert.equal(sample.ai.length,0);assert.equal(sample.key,'ADX:tiktok-hot');assert.equal(items[0].row_count,100);assert.equal(dailyBatchTotals(items).samples,50)
})
test('rejects date mismatch, wrong counts, filters, duplicate ranks, mixed sorting and missing board evidence',()=>{
 for(const mutate of [(f:ReturnType<typeof fixture>)=>{f.standard.data_date='2026-11-09'},(f:ReturnType<typeof fixture>)=>{f.manifest.actual_records=99},(f:ReturnType<typeof fixture>)=>{f.standard.rows[1].rank=1},(f:ReturnType<typeof fixture>)=>{f.standard.rows[0].sort='热度'},(f:ReturnType<typeof fixture>)=>{f.manifest.boards[0].filters.extra_filters=true},(f:ReturnType<typeof fixture>)=>{f.manifest.boards[0].data_date='2026-11-09'}]){
  const f=fixture();mutate(f);assert.throws(()=>prepareDailyBoards(f.manifest,f.standard,'run','hash'))
 }
})
test('login failures and trial results cannot masquerade as a current daily board',()=>{
 const f=fixture();for(const status of ['blocked_login_required','completed_trial_with_source_shortfall'])assert.throws(()=>prepareDailyBoards({...f.manifest,status},f.standard,'run','hash'))
 assert.equal(isBoardImport({source_name:DAILY_SYNC_SOURCE}),false)
})
test('source shortfalls stay short and flagged data pauses comparisons',()=>{
 const f=fixture(24);f.manifest.boards[0].note='数据异常，待核验'
 const items=prepareDailyBoards(f.manifest,f.standard,'run','hash');assert.equal(dailyBatchTotals(items).samples,24)
 const source={...items[0],id:'one',updated_at:'now'};const snapshot=analysisSnapshot(source)
 assert.match(snapshot.issues.join(''),/待核验/)
 assert.ok(compareBoards(boardSamples(items,'day'),boardSamples(items,'day'))[0].reason)
})
test('sorting and filter changes pause otherwise identical comparisons',()=>{
 const items=prepare();const a=boardSamples(items,'day'),b=boardSamples(items,'day');b[0].sort='热度';assert.match(compareBoards(a,b)[0].reason!,/排序/)
})
test('daily dates and deltas use adjacent days and exact board/channel; preserve AI tag removal',()=>{
 assert.equal(dayKey('2026年11月10日'),'2026-11-10');assert.equal(dayKey('2026-02-30'),null)
 assert.deepEqual(dayRange('2026-03-01',2),['2026-02-28','2026-03-01'])
 const item=prepare(3)[0]
 const prev={...item,id:'a',updated_at:'a',period_label:'2026-11-09',raw_rows:item.raw_rows.map((r,i)=>({...r,'剧名':i===1?'Target':'Other'+i,'标签':'AI仿真人'}))}
 const next={...item,id:'b',updated_at:'b',period_label:'2026-11-10',raw_rows:item.raw_rows.map((r,i)=>({...r,'剧名':i===0?'Target':'Other'+i,'标签':'实拍'}))}
 const series=dailySeries([prev,next],['2026-11-09','2026-11-10','2026-11-11'],'ADX:tiktok-hot')
 const obs=dailyWorkObservations(series,'Target','a');assert.deepEqual(obs.map(o=>o.rank),[2,1,null]);assert.deepEqual(obs.map(o=>o.rankChange),[null,1,null]);assert.equal(obs[1].tags,'实拍')
 assert.ok(dailyWorkObservations(series,'Target','b').every(o=>o.rank===null))
 assert.equal(trackIdentity('ADX:tiktok-hot','Target','a'),trackIdentity('ADX:tiktok-hot',' Target ','a'))
})
test('unpublished boards do not block verified peers or become empty/old daily boards',()=>{
 const f=fixture(2)
 const pending={name:'DramaBox',actual:0,sort:null,data_date:null,status:'awaiting_source_publication',note:'目标日未发布',filters:null,requested_data_date:'2026-11-10',latest_available_date:'2026-11-09'}
 const manifest={...f.manifest,status:'completed_with_source_gaps',boards:[...f.manifest.boards,pending]}
 const items=prepareDailyBoards(manifest,f.standard,'run','hash')
 assert.equal(items.length,1);assert.equal(items[0].row_count,2)
 assert.throws(()=>prepareDailyBoards({...manifest,boards:[...f.manifest.boards,{...pending,requested_data_date:'2026-11-09'}]},f.standard,'run','hash'))
 assert.throws(()=>prepareDailyBoards({...manifest,boards:[...f.manifest.boards,{...pending,actual:1}]},f.standard,'run','hash'))
 assert.throws(()=>prepareDailyBoards({...manifest,boards:[...f.manifest.boards,{...pending,name:'TikTok短剧热播榜'}]},f.standard,'run','hash'))
 assert.throws(()=>prepareDailyBoards({...manifest,actual_records:3},{...f.standard,rows:[...f.standard.rows,{...row(1),board:'DramaBox'}]},'run','hash'))
 assert.throws(()=>prepareDailyBoards({...manifest,actual_records:0,boards:[pending]},{...f.standard,rows:[]},'run','hash'))
})
