import {z} from 'zod'
import type {MonthlyReviewRecord} from './monthly-review'
export const IDEA_REVIEW_SOURCE='市场研究:idea-review'
export const VALIDATION_STATUSES=['待验证','验证中','已完成'] as const
export const VALIDATION_OUTCOMES=['未评估','支持原建议','需要调整','证据不足'] as const
export const actionId=z.enum(['content','test','revisit'])
const date=z.string().refine(v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'日期无效')
export const validationInput=z.object({id:actionId,title:z.string().trim().min(1).max(100),description:z.string().trim().min(1).max(4000),status:z.enum(VALIDATION_STATUSES),dueDate:date,result:z.string().trim().max(4000),outcome:z.enum(VALIDATION_OUTCOMES).optional(),outcomeNote:z.string().trim().max(2000).optional()}).refine(v=>!v.outcome||v.outcome==='未评估'||v.status==='已完成'&&!!v.outcomeNote?.trim(),'请完成验证并填写效果判断依据，不能仅凭进度判断有效').refine(v=>v.status!=='已完成'||!!v.result,'完成验证时请填写实际结果或记录位置；不支持、信息不足也可如实记录')
export type ValidationAction=z.infer<typeof validationInput>&{updatedAt:string;completedAt:string|null}
export const linkReviewSchema=z.object({ideaId:z.string().uuid(),reviewId:z.string().uuid(),reviewVersion:z.string().min(1),reason:z.string().trim().min(1,'请说明这条研判如何用于该选题').max(2000)})
export const patchIdeaReviewSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('validation'),id:z.string().uuid(),ideaId:z.string().uuid(),updated_at:z.string().min(1),action:validationInput}),
 z.object({operation:z.literal('active'),id:z.string().uuid(),ideaId:z.string().uuid(),updated_at:z.string().min(1),active:z.boolean()}),
])
export type IdeaReviewPayload={kind:'idea-review';ideaId:string;ideaTitle:string;reason:string;active:boolean;review:MonthlyReviewRecord;actions:ValidationAction[];actor:string}
export type IdeaReviewRecord={id:string;created_at:string;updated_at:string;payload:IdeaReviewPayload;sourceChanged?:boolean;currentIdeaTitle?:string}
export function ideaReviewKey(owner:string,idea:string,review:string){return `${owner}:idea-review:${idea}:${review}`}
export function createIdeaReview(idea:{id:string;title:string},review:MonthlyReviewRecord,expected:string,reason:string,actor:string,now:string):IdeaReviewPayload{
 if(review.updated_at!==expected||review.sourceChanged||!review.payload.confirmedAt||!(review.payload.evidence.length||review.payload.feedback?.length))throw new Error('月度研判或依据已变化，请回到市场看板核对后重新确认')
 return {kind:'idea-review',ideaId:idea.id,ideaTitle:idea.title,reason,active:true,review:structuredClone(review),actor,actions:([
 ['content','内容与选题核验',review.payload.topicBrief],['test','投放对照验证',review.payload.testPlan],['revisit','后续复核与调整',review.payload.revisit]
 ] as const).map(([id,title,description])=>({id,title,description,status:'待验证',dueDate:'',result:'',updatedAt:now,completedAt:null}))}
}
export function updateValidation(payload:IdeaReviewPayload,input:z.infer<typeof validationInput>,actor:string,now:string):IdeaReviewPayload{
 const action=validationInput.parse(input)
 if(!payload.active)throw new Error('请先恢复关联再更新验证')
 if(!payload.actions.some(a=>a.id===action.id))throw new Error('验证项不存在')
 return {...payload,actor,actions:payload.actions.map(old=>old.id!==action.id?old:{...action,updatedAt:now,completedAt:action.status==='已完成'?(old.status==='已完成'?old.completedAt:now):null})}
}
export function validationProgress(actions:ValidationAction[]){const done=actions.filter(a=>a.status==='已完成').length;return {done,total:actions.length,percent:actions.length?Math.round(100*done/actions.length):0,inProgress:actions.filter(a=>a.status==='验证中').length}}
