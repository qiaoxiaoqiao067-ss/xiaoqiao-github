import {z} from 'zod'
import {monthKey} from './monthly-history'
export const EVIDENCE_SOURCE='市场研究:evidence'
const date=z.string().refine(v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'日期无效')
export const evidenceSchema=z.object({
 title:z.string().trim().min(1,'请填写证据标题').max(200),
 type:z.enum(['行业报告','作品核验','平台公告','调研记录']),
 period:z.string().trim().max(100),source:z.string().trim().max(300),
 url:z.string().trim().max(2000).refine(v=>!v||/^https?:\/\//i.test(v)&&URL.canParse(v),'来源链接仅支持http或https'),
 publishedDate:date,scope:z.string().trim().max(500),locator:z.string().trim().max(500),
 excerpt:z.string().trim().min(1,'请粘贴原文摘录或实际观看记录').max(12000),
 fact:z.string().trim().max(3000),judgment:z.string().trim().max(3000),action:z.string().trim().max(2000),work:z.string().trim().max(500),
 stance:z.enum(['背景资料','支持判断','提示反例']),status:z.enum(['待核验','已核验','已归档'])
}).superRefine((v,ctx)=>{
 if(v.status==='已核验')for(const field of ['source','scope','locator','fact'] as const)if(!v[field])ctx.addIssue({code:'custom',path:[field],message:'核验前请填写来源、适用范围、原文位置和可核查事实'})
})
export const evidenceWriteSchema=z.object({id:z.string().uuid(),updated_at:z.string().min(1).optional(),evidence:evidenceSchema,confirmVerified:z.boolean().optional()}).refine(v=>v.evidence.status!=='已核验'||v.confirmVerified===true,'请明确确认已核对原文')
export type EvidenceInput=z.infer<typeof evidenceSchema>
export type EvidencePayload=EvidenceInput&{kind:'evidence';actor:string;verifiedAt:string|null;verifiedBy:string|null}
export type EvidenceRecord={id:string;created_at:string;updated_at:string;payload:EvidencePayload}
export type FrozenEvidence={id:string;updated_at:string;payload:EvidencePayload}
export function evidenceApplies(e:EvidenceInput,period:string){return !e.period||e.period===period||!!monthKey(period)&&monthKey(e.period)===monthKey(period)}
export function freezeEvidence(records:EvidenceRecord[],refs:{id:string;updated_at:string}[],period:string):FrozenEvidence[]{
 const expected=new Map(refs.map(r=>[r.id,r.updated_at]))
 if(expected.size!==refs.length||records.length!==refs.length||records.some(r=>!expected.has(r.id)||expected.get(r.id)!==r.updated_at||r.payload.status!=='已核验'||!evidenceApplies(r.payload,period)))throw new Error('证据已变化、未核验或不适用本期，请刷新证据列表并重新选择')
 return records.map(r=>({id:r.id,updated_at:r.updated_at,payload:structuredClone(r.payload)}))
}
export function evidenceText(e:FrozenEvidence){const p=e.payload;return `${p.title}｜${p.type}｜${p.stance}\n来源：${p.source}｜发布/观看日期：${p.publishedDate||'未记录'}｜${p.url||'无链接'}\n适用范围：${p.scope}｜原文位置：${p.locator}｜关联作品：${p.work||'无'}\n原文/观看记录：${p.excerpt}\n可核查事实：${p.fact}\n人工判断：${p.judgment||'未填写'}\n建议行动：${p.action||'未填写'}\n人工核验：${p.verifiedAt||'未确认'}｜证据版本：${e.updated_at}｜${e.id}`}
