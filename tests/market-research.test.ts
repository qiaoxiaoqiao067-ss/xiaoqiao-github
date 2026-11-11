import test from 'node:test'
import assert from 'node:assert/strict'
import { boardSamples, compareBoards } from '../src/lib/market/board-analysis'
import { buildMarketResearch } from '../src/lib/market/research'

function source(period: string, board: 'ad'|'tk', counts: Record<string,number>, sourceName='ADX') {
  return {source_name:sourceName,file_name:board==='ad'?'短剧榜.xlsx':'TK短剧热播榜.xlsx',period_label:period,created_at:'2026-11-01',raw_rows:Array.from({length:100},(_,i)=>({排名:i+1,剧名:`作品${i}`,标签:['AI仿真人',...Object.entries(counts).filter(([,n])=>i<n).map(([g])=>g)].join(','),新素材数:100-i,播放增量:i===0?0:1000-i,剧场号:'账号'}))}
}
const fixture = () => {
  const before=boardSamples([source('2026年9月','ad',{黑帮:10,狼人:30,复仇:70}),source('2026年9月','tk',{家庭:65,黑帮:15,狼人:10,复仇:80})],'month')
  const now=boardSamples([source('2026年10月','ad',{黑帮:20,狼人:10,复仇:10}),source('2026年10月','tk',{家庭:63,黑帮:10,狼人:7,复仇:10})],'month')
  return {now,before,comparisons:compareBoards(now,before)}
}
test('research connects comparable facts to stable, divergent and cooling directions, with specific evidence',()=>{
  const {now,comparisons}=fixture(), r=buildMarketResearch(now,comparisons)
  assert.deepEqual(r.findings.map(f=>f.genre),['家庭','黑帮','狼人'])
  assert.match(r.findings[0].facts[0],/65\/100部（65.0%）→ 63\/100部（63.0%）/)
  assert.match(r.findings[1].facts[0],/\+10.0个百分点/)
  assert.match(r.findings[1].facts[1],/-5.0个百分点/)
  assert.ok(r.findings.every(f=>f.development && f.advertising && f.validation && f.cases.length))
  assert.ok(r.findings[1].cases.some(c=>c.metric==='新素材数'&&c.value===100&&c.rank===1))
  assert.ok(r.findings[1].cases.some(c=>c.metric==='播放增量'&&c.channel==='账号'))
  assert.ok(r.findings[1].cautions.some(s=>s.includes('标签发生变化')))
})
test('missing historical source produces observation, not growth from zero',()=>{
  const {now}=fixture();const r=buildMarketResearch(now,compareBoards(now,[]))
  assert.equal(r.findings.length,1);assert.equal(r.findings[0].decision,'观察与补证')
  assert.ok(r.limitations.some(s=>s.includes('对比期未采集')))
})
test('anomalous board never supplies comparisons or case recommendations',()=>{
  const {now,before}=fixture();now.forEach(s=>s.issues.push('月份错误'))
  const r=buildMarketResearch(now,compareBoards(now,before));assert.equal(r.findings.length,0)
})
test('separate providers are never treated as a cross-board pair',()=>{
  const {now,before}=fixture();now[1].key='Other:tiktok-hot';before[1].key='Other:tiktok-hot'
  const r=buildMarketResearch(now,compareBoards(now,before));assert.ok(r.findings.every(f=>!f.id.includes('divergent')&&!f.id.includes('cooling')))
})
test('different periods and small samples cannot produce paired trend claims',()=>{
  const {now,before}=fixture();now[1].period='2026年11月'
  let r=buildMarketResearch(now,compareBoards(now,before));assert.ok(r.findings.every(f=>!f.id.includes('divergent')&&!f.id.includes('cooling')))
  now.forEach(s=>{s.rows=s.rows.slice(0,10);s.ai=s.ai.slice(0,10)})
  r=buildMarketResearch(now,compareBoards(now,before));assert.equal(r.findings[0].decision,'观察与补证')
})
test('case selection preserves missing and zero metrics and never includes rows outside common range',()=>{
  const {now,before}=fixture();before[0].rows=before[0].rows.slice(0,60);now[0].ai[0]['新素材数']=null;now[0].ai[1]['新素材数']=0
  const r=buildMarketResearch(now,compareBoards(now,before))
  assert.ok(r.findings.flatMap(f=>f.cases).filter(c=>c.metric==='新素材数').every(c=>c.rank<=60))
  const only=boardSamples([source('2026年10月','ad',{黑帮:2})],'month');only[0].ai[0]['新素材数']=null;only[0].ai[1]['新素材数']=0
  const c=buildMarketResearch(only,compareBoards(only,[])).findings[0].cases
  assert.deepEqual(c.map(x=>x.value),[0,null])
})
