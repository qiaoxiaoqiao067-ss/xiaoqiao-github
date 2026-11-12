import test from 'node:test'
import assert from 'node:assert/strict'
import {knownBoardSignal,displayMetric,displayNumber} from '../src/lib/market/display-metrics'
test('normalized all-column daily captures retain board identity and exact metric',()=>{
 assert.equal(knownBoardSignal('TikTok短剧热播榜_日榜_2026-11-10.json'),'tk')
 assert.equal(knownBoardSignal('TK短剧热播榜_月榜_2026-09.xlsx'),'tk')
 assert.equal(knownBoardSignal('NetShort_日榜_2026-11-10.json'),'platform')
 assert.equal(knownBoardSignal('短剧排行榜_日榜_2026-11-10.json'),'ad')
 const r={'播放增量':null,'预估曝光':null,'热度':5290000000,'采集排序':'热度'}
 assert.equal(displayMetric('platform',r),'热度')
 assert.equal(displayNumber(r[displayMetric('platform',r) as keyof typeof r]),5290000000)
 assert.equal(displayMetric('tk',r),'播放增量')
 assert.equal(displayMetric('ad',r),'预估曝光')
 assert.equal(displayMetric('platform',{'播放增量':null,'热度':2,'采集排序':'播放增量'}),'播放增量')
})
test('missing and malformed values stay missing while real zero is preserved',()=>{
 for(const v of [null,undefined,'','  ','—','NaN','Infinity'])assert.equal(displayNumber(v),null)
 for(const v of [0,'0','0.0'])assert.equal(displayNumber(v),0)
 assert.equal(displayNumber('52.9亿'),5290000000)
 assert.equal(displayNumber('2,000'),2000)
})
