import test from 'node:test'
import assert from 'node:assert/strict'
import {loadImportPages} from '../src/lib/market/load-import-pages'
test('all pages loaded in source order without trusting stale row count',async()=>{
 const calls:number[]=[]; const result=await loadImportPages([{id:'a',updated_at:'v1'}],async(_,offset)=>{calls.push(offset);return {rows:Array.from({length:offset===0?1000:2},(_,i)=>({n:offset+i})),total:1002,updated_at:'v1'}})
 assert.deepEqual(calls,[0,1000]);assert.equal(result[0].raw_rows.length,1002);assert.equal(result[0].raw_rows[1001].n,1001)
})
test('partial and changed snapshots reject rather than publish incomplete market data',async()=>{
 await assert.rejects(loadImportPages([{id:'a',updated_at:'v1'}],async()=>({rows:[],total:100,updated_at:'v1'})),/不完整/)
 await assert.rejects(loadImportPages([{id:'a',updated_at:'v1'}],async()=>({rows:[{}],total:1,updated_at:'v2'})),/更新/)
})
