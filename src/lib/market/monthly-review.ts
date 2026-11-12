import {z} from 'zod'
import type {ResearchFinding,MarketResearch} from './research'
import type {FrozenEvidence} from './evidence'
export const MONTHLY_REVIEW_SOURCE='市场研究:monthly-review'
export const reviewRefSchema=z.object({id:z.string().uuid(),updated_at:z.string().min(1),relation:z.enum(['支持判断','提示反例','背景参考']),independence:z.enum(['同源复述','独立来源','尚未确认'])})
export const reviewTextSchema=z.object({conclusion:z.string().trim().min(1).max(3000),topicBrief:z.string().trim().min(1).max(3000),testPlan:z.string().trim().min(1).max(2000),revisit:z.string().trim().min(1).max(2000)})
export const reviewWriteSchema=reviewTextSchema.extend({period:z.string().min(1).max(100),comparison:z.string().max(100),findingId:z.string().min(1).max(500),fingerprint:z.string().max(30000),updated_at:z.string().optional(),evidence:z.array(reviewRefSchema).min(1).max(10),confirmed:z.literal(true)})
export type ReviewText=z.infer<typeof reviewTextSchema>
export type ReviewRef=z.infer<typeof reviewRefSchema>
export type ReviewEvidence={evidence:FrozenEvidence;relation:ReviewRef['relation'];independence:ReviewRef['independence']}
export type MonthlyReview=ReviewText&{kind:'monthly-review';period:string;comparison:string;findingId:string;genre:string;fingerprint:string;sources:{id:string;updated_at:string}[];evidence:ReviewEvidence[];actor:string;confirmedAt:string}
export type MonthlyReviewRecord={id:string;created_at:string;updated_at:string;payload:MonthlyReview;sourceChanged?:boolean}
export function findingFingerprint(f:ResearchFinding){const {review:_,reviewNotice:__,...base}=f;void _;void __;return JSON.stringify(base)}
export function reviewApplies(r:MonthlyReviewRecord,f:ResearchFinding,period:string,comparison:string){return !r.sourceChanged&&r.payload.period===period&&r.payload.comparison===comparison&&r.payload.findingId===f.id&&r.payload.fingerprint===findingFingerprint(f)}
export function applyMonthlyReviews(research:MarketResearch,records:MonthlyReviewRecord[],period:string,comparison:string):MarketResearch{return {...research,findings:research.findings.map(f=>({...f,review:records.find(r=>reviewApplies(r,f,period,comparison)),reviewNotice:records.some(r=>r.payload.findingId===f.id&&!reviewApplies(r,f,period,comparison))?'报告联合研判的来源或榜单已变化，暂显示榜单判断，请到研究与行动重新核对。':undefined}))}}
export function reviewDraft(f:ResearchFinding,refs:ReviewEvidence[]):ReviewText{
 const conflict=refs.some(e=>e.relation==='提示反例'),support=refs.filter(e=>e.relation==='支持判断'),independent=support.filter(e=>e.independence==='独立来源')
 const scope=refs.map((e,i)=>`[报告${i+1}] ${e.evidence.payload.fact}（范围：${e.evidence.payload.scope}）`).join('\n')
 const judgments=refs.filter(e=>e.evidence.payload.judgment).map((e,i)=>`来源判断${i+1}：${e.evidence.payload.judgment}`).join('\n')
 const actions=refs.filter(e=>e.evidence.payload.action).map(e=>e.evidence.payload.action).join('\n')
 return {
  conclusion:`${conflict?'报告存在反向证据，暂缓强化本月判断，先核对样本与适用条件。':independent.length?'报告提供补充依据，仍需逐项核对地区、时期与制作类型是否适用。':'当前报告尚未提供独立支持，维持榜单给出的研究优先级，不上调为商业机会。'}\n榜单判断：${f.judgment}\n${scope}${judgments?'\n'+judgments:''}`,
  topicBrief:`${f.development}\n${actions?`报告给出的下一步：${actions}\n`:''}交付要求：候选选题注明人物关系、前三集主冲突、与对标作品的差异，并逐项列出内容核验依据；材料缺失时标待补，不凭榜单标签编造剧情。`,
  testPlan:`${conflict?'先解释反例与榜单信号的差异，再决定是否测试。\n':''}${f.advertising}\n报告未提供可比较的账户转化结果时，不增加预算或承诺收益。`,
  revisit:`${f.validation}\n复核报告与本月样本的时期、地区、制作类型和来源独立性；来源变更或原文不支持判断时撤回这一版，重新确认。`,
 }
}
export function reviewText(r:MonthlyReviewRecord){const p=r.payload;return [`报告联合研判｜${p.period} 对比${p.comparison||'无'}｜${p.genre}`,`本月结论：${p.conclusion}`,`选题要求：${p.topicBrief}`,`投放验证：${p.testPlan}`,`调整条件：${p.revisit}`,`确认时间：${p.confirmedAt}｜版本：${r.updated_at}`, ...p.evidence.map((e,i)=>`[报告${i+1}] ${e.relation}｜${e.independence}｜${e.evidence.payload.title}｜${e.evidence.payload.source}｜${e.evidence.payload.locator}\n原文：${e.evidence.payload.excerpt}\n证据版本：${e.evidence.updated_at}｜${e.evidence.id}`)].join('\n\n')}
