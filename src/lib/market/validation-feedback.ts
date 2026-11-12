import {z} from 'zod'
import {monthKey} from './monthly-history'
import type {IdeaReviewRecord,ValidationAction} from './idea-review'
export const feedbackRefSchema=z.object({linkId:z.string().uuid(),version:z.string().min(1),actionId:z.enum(['content','test','revisit'])})
export type FeedbackRef=z.infer<typeof feedbackRefSchema>
export type ValidationFeedback=FeedbackRef&{ideaId:string;ideaTitle:string;genre:string;sourcePeriod:string;reviewId:string;reviewVersion:string;originalConclusion:string;reason:string;action:ValidationAction}
export function feedbackKey(f:FeedbackRef){return `${f.linkId}:${f.actionId}`}
export function feedbackEligible(f:ValidationFeedback,period:string){const target=monthKey(period),source=monthKey(f.sourcePeriod),a=f.action;return !!target&&!!source&&source<target&&a.status==='已完成'&&!!a.completedAt&&Number.isFinite(Date.parse(a.completedAt))&&new Date(a.completedAt).toISOString().slice(0,7)<=target&&Number.isFinite(Date.parse(a.updatedAt))&&new Date(a.updatedAt).toISOString().slice(0,7)<=target&&!!a.result.trim()&&!!a.outcome&&a.outcome!=='未评估'&&!!a.outcomeNote?.trim()}
export function feedbackCandidates(records:IdeaReviewRecord[],period:string,genre=''){
 const target=monthKey(period);if(!target)return []
 return records.filter(r=>r.payload.active&&!!monthKey(r.payload.review.payload.period)&&monthKey(r.payload.review.payload.period)!<target&&(!genre||r.payload.review.payload.genre===genre)).flatMap(r=>r.payload.actions.map(a=>({linkId:r.id,version:r.updated_at,actionId:a.id,ideaId:r.payload.ideaId,ideaTitle:r.currentIdeaTitle||r.payload.ideaTitle,genre:r.payload.review.payload.genre,sourcePeriod:r.payload.review.payload.period,reviewId:r.payload.review.id,reviewVersion:r.payload.review.updated_at,originalConclusion:r.payload.review.payload.conclusion,reason:r.payload.reason,action:structuredClone(a)})))
}
export function freezeFeedback(candidates:ValidationFeedback[],refs:FeedbackRef[],period:string,genre:string){
 if(new Set(refs.map(feedbackKey)).size!==refs.length)throw new Error('同一验证项不能重复采用')
 return refs.map(ref=>{const f=candidates.find(c=>feedbackKey(c)===feedbackKey(ref));if(!f||f.version!==ref.version||f.genre!==genre||!feedbackEligible(f,period))throw new Error('验证结果已更新、撤回或不适用本月，请刷新核对；当前文字保留');return structuredClone(f)})
}
export function feedbackSummary(items:ValidationFeedback[],period:string){const eligible=items.filter(f=>feedbackEligible(f,period));return {total:items.length,support:eligible.filter(f=>f.action.outcome==='支持原建议').length,adjust:eligible.filter(f=>f.action.outcome==='需要调整').length,insufficient:eligible.filter(f=>f.action.outcome==='证据不足').length,pending:items.length-eligible.length}}
export function feedbackText(f:ValidationFeedback,index=0){return `[验证${index+1}] ${f.sourcePeriod}｜${f.ideaTitle}｜${f.action.title}\n原建议：${f.action.description}\n实际结果：${f.action.result}\n效果：${f.action.outcome||'未评估'}；${f.action.outcomeNote||'尚未评估'}\n完成时间：${f.action.completedAt||'未完成'}｜来源：${f.linkId}/${f.actionId}｜版本：${f.version}`}
