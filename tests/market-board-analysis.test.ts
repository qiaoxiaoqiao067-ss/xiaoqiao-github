import test from 'node:test'
import assert from 'node:assert/strict'
import {boardSamples,compareBoards,metricNumber} from '../src/lib/market/board-analysis'
const source=(period:string,name='TK短剧热播榜.xlsx',n=60)=>({source_name:'ADX',file_name:name,period_label:period,created_at:'2026-11-11',raw_rows:Array.from({length:n},(_,i)=>({'排行':i+1,'剧名':`剧${i}`,'标签':i<40?'实拍':'AI仿真人,家庭','剧场号':'账号','播放增量':100,'上线时间':'2026-08-01'}))})
test('Top50 is sampled before filtering AI; no lower-ranked refill',()=>{
 const [s]=boardSamples([source('2026-09-01')],'day');assert.equal(s.rows.length,50);assert.equal(s.ai.length,10);assert.equal(s.ai.at(-1)?.排行,50)
})
test('missing platform does not block common boards; unequal source sizes use common range',()=>{
 const a=boardSamples([source('2026年10月','TK短剧热播榜.xlsx',60)],'month')
 const b=boardSamples([source('2026年9月','TK短剧热播榜.xlsx',50),source('2026年9月','DramaBox_2026-09.xlsx')],'month')
 const r=compareBoards(a,b);assert.equal(r[0].reason,null);assert.equal(r[0].sampleSize,50);assert.equal(r[0].currentAI,10);assert.equal(r[0].previousAI,10);assert.match(r[1].reason!,/本期未采集/)
})
test('future dates and mismatched metrics block only their board',()=>{
 const a=source('2026年9月');a.raw_rows[0].上线时间='2026-10-01';const [s]=boardSamples([a],'month');assert.match(s.issues.join(''),/晚于统计月/)
 assert.match(compareBoards([s],boardSamples([source('2026年8月')],'month'))[0].reason!,/异常/)
 const b=boardSamples([source('2026年8月')],'month');b[0].metric='热度';assert.match(compareBoards(boardSamples([source('2026年9月')],'month'),b)[0].reason!,/指标不同/)
})
test('genre share uses unique titles, includes disappeared genres, skips ambiguous ranking keys',()=>{
 const a=source('2026年10月'),b=source('2026年9月');
 a.raw_rows[40].标签='AI仿真人,女频,黑帮';a.raw_rows[41].剧名=a.raw_rows[40].剧名
 b.raw_rows[40].标签='AI仿真人,狼人';
 const [c]=compareBoards(boardSamples([a],'month'),boardSamples([b],'month'))
 assert.equal(c.currentWorks,19);assert.equal(c.previousWorks,20);assert.equal(c.ambiguous,1)
 assert.equal(c.genres.find(g=>g.name==='狼人')?.change,-5);assert.equal(c.genres.some(g=>g.name==='女频'),false)
 assert.equal(c.changes.some(w=>w.title==='剧40'),false)
})
test('zero remains zero; missing or formatted unknown metric is not invented',()=>{
 assert.equal(metricNumber('0'),0);assert.equal(metricNumber(''),null);assert.equal(metricNumber('--'),null);assert.equal(metricNumber('5.2亿'),null);assert.equal(metricNumber('1,200'),1200)
})
