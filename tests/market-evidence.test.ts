import test from 'node:test'
import assert from 'node:assert/strict'
import {evidenceSchema,evidenceWriteSchema,evidenceApplies,freezeEvidence,evidenceText,EVIDENCE_SOURCE,type EvidenceInput,type EvidenceRecord} from '../src/lib/market/evidence'
import {isBoardImport} from '../src/lib/market/import-scope'
import {createRecordSchema} from '../src/lib/market/research-records'
const id='00000000-0000-4000-8000-000000000001'
const base:EvidenceInput={title:'原文核验',type:'行业报告',period:'2026年10月',source:'发布机构',url:'https://example.com/report',publishedDate:'2026-11-12',scope:'海外样本，地区未确认',locator:'第3页',excerpt:'已阅读原文',fact:'原文说明的样本范围',judgment:'判断待验证',action:'核对作品',work:'',stance:'背景资料',status:'待核验'}
const rec=():EvidenceRecord=>({id,created_at:'2026-11-12T00:00:00Z',updated_at:'2026-11-12T01:00:00Z',payload:{...base,status:'已核验',kind:'evidence',actor:'a',verifiedAt:'2026-11-12T01:00:00Z',verifiedBy:'a'}})
test('evidence drafts allow incomplete attribution but confirmed evidence needs traceable facts',()=>{
 assert.ok(evidenceSchema.safeParse({...base,source:'',fact:'',locator:'',scope:''}).success)
 for(const field of ['source','scope','locator','fact'])assert.equal(evidenceSchema.safeParse({...base,status:'已核验',[field]:''}).success,false)
 assert.equal(evidenceWriteSchema.safeParse({id,evidence:{...base,status:'已核验'}}).success,false)
 assert.ok(evidenceWriteSchema.safeParse({id,evidence:{...base,status:'已核验'},confirmVerified:true}).success)
})
test('reject unsafe source protocols and invalid calendar dates',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,x','ftp://example.com','https://'])assert.equal(evidenceSchema.safeParse({...base,url}).success,false)
 assert.equal(evidenceSchema.safeParse({...base,publishedDate:'2026-02-30'}).success,false)
 assert.ok(evidenceSchema.safeParse({...base,url:'',publishedDate:''}).success)
})
test('evidence stays separate from statistical boards and applies only to declared period or general use',()=>{
 assert.equal(isBoardImport({source_name:EVIDENCE_SOURCE}),false)
 assert.equal(evidenceApplies(base,'2026-10'),true)
 assert.equal(evidenceApplies(base,'2026年9月'),false)
 assert.equal(evidenceApplies({...base,period:''},'2026-11-11'),true)
})
test('archive refuses stale, missing, duplicate, unverified, archived or out-of-scope evidence',()=>{
 const r=rec(),ref={id,updated_at:r.updated_at}
 assert.throws(()=>freezeEvidence([], [ref],'2026年10月'))
 assert.throws(()=>freezeEvidence([r],[{...ref,updated_at:'old'}],'2026年10月'))
 assert.throws(()=>freezeEvidence([r],[ref,ref],'2026年10月'))
 assert.throws(()=>freezeEvidence([r],[ref],'2026年9月'))
 for(const status of ['待核验','已归档'] as const)assert.throws(()=>freezeEvidence([{...r,payload:{...r.payload,status}}],[ref],'2026年10月'))
})
test('frozen evidence remains unchanged after source edits and copied output includes source and limitations',()=>{
 const r=rec(),f=freezeEvidence([r],[{id,updated_at:r.updated_at}],'2026-10')
 r.payload.fact='后来修订';r.payload.status='已归档'
 assert.equal(f[0].payload.fact,base.fact);assert.equal(f[0].payload.status,'已核验')
 const text=evidenceText(f[0]);for(const str of [base.url,base.scope,base.locator,base.excerpt,base.fact,base.judgment,base.action])assert.ok(text.includes(str))
})
test('legacy archive requests stay compatible; evidence references are bounded and versioned',()=>{
 const a={kind:'archive',requestId:id,period:'2026年10月',comparison:'2026年9月',title:'研判',note:'',sources:[{id,updated_at:'now'}]}
 assert.ok(createRecordSchema.safeParse(a).success)
 assert.equal(createRecordSchema.safeParse({...a,evidenceSources:[{id}]}).success,false)
 assert.equal(createRecordSchema.safeParse({...a,evidenceSources:Array.from({length:21},()=>({id,updated_at:'now'}))}).success,false)
})
