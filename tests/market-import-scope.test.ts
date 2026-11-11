import test from 'node:test'
import assert from 'node:assert/strict'
import {analysisSnapshot,comparisonPeriod,requestedImports} from '../src/lib/market/import-scope'
import {boardSamples,compareBoards} from '../src/lib/market/board-analysis'
const source=(period:string,name='短剧榜.xlsx')=>({id:period+name,source_name:'ADX',file_name:name,period_label:period,created_at:'2026-11-01',updated_at:'v1',raw_rows:Array.from({length:1000},(_,i)=>({排名:i+1,剧名:`剧${i}`,标签:'AI仿真人,家庭',新素材数:1000-i,上线时间:i===999?'2026-11-01':'2026-08-01'}))})
test('first load requests selected and comparison periods plus shared title mapping only',()=>{
 const all=[source('2026年10月'),source('2026年9月'),source('2026年8月'),{...source('2026年7月'),source_name:'中文名映射'}]
 assert.equal(comparisonPeriod(all,'2026年10月',''),'2026年9月')
 assert.equal(comparisonPeriod(all,'2026年10月','2026年8月'),'2026年8月')
 assert.deepEqual(requestedImports(all,'2026年10月','2026年9月').map(m=>m.source_name==='中文名映射'?'mapping':m.period_label),['2026年10月','2026年9月','mapping'])
})
test('sample response reduces rows without losing original-source quality checks',()=>{
 const s=source('2026年9月'),snap=analysisSnapshot(s)
 assert.equal(snap.rows.length,500);assert.equal(s.raw_rows.length,1000);assert.match(snap.issues.join(''),/晚于统计月/)
 const loaded=boardSamples([{...s,raw_rows:snap.rows,analysis_issues:snap.issues}],'month')
 assert.match(compareBoards(loaded,boardSamples([source('2026年8月')],'month'))[0].reason!,/异常/)
})
test('previous-only platforms need metadata, not raw history, to report missing current coverage',()=>{
 const previousOnly={...source('2026年9月','DramaBox.xlsx'),columns:['排名','剧名','标签']}
 const list=[source('2026年10月'),source('2026年9月'),previousOnly]
 assert.equal(requestedImports(list,'2026年10月','2026年9月').length,2)
 const comparison=compareBoards(boardSamples([list[0]],'month'),boardSamples([{...previousOnly,raw_rows:[]}],'month'))
 assert.match(comparison.find(c=>c.key==='ADX:platform:DramaBox')!.reason!,/本期未采集/)
})
test('different board periods have independent sample limits; mappings and unrecognized ranks remain complete',()=>{
 assert.equal(analysisSnapshot(source('2026年11月10日')).rows.length,50)
 assert.equal(analysisSnapshot(source('2026年第45周')).rows.length,300)
 assert.equal(analysisSnapshot({...source('2026年10月'),source_name:'中文名映射'}).rows.length,1000)
 const custom={...source('2026年10月'),raw_rows:Array.from({length:700},()=>({'自定义顺序':1,剧名:'剧',标签:'AI仿真人'}))}
 assert.equal(analysisSnapshot(custom).rows.length,700)
})
