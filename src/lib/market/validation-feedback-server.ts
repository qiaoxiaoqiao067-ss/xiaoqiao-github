import {serviceClient} from '@/lib/supabase/service'
import {IDEA_REVIEW_SOURCE,type IdeaReviewRecord} from './idea-review'
import {feedbackCandidates} from './validation-feedback'
export async function readActiveIdeaReviews(owner:string){
 const records:IdeaReviewRecord[]=[]
 for(let offset=0;;offset+=200){const r=await serviceClient.from('market_data_imports').select('id,created_at,updated_at,raw_rows').eq('user_id',owner).eq('source_name',IDEA_REVIEW_SOURCE).eq('raw_rows->0->>active','true').order('id').range(offset,offset+199);if(r.error)throw r.error;records.push(...(r.data||[]).map(v=>({id:v.id,created_at:v.created_at,updated_at:v.updated_at,payload:v.raw_rows[0]})));if((r.data||[]).length<200)break;if(offset>=9800)throw new Error('关联量过大，请缩小读取范围')}
 const ids=[...new Set(records.map(r=>r.payload.ideaId))],titles=new Map<string,string>()
 for(let i=0;i<ids.length;i+=200){const topics=await serviceClient.from('ideas').select('id,title').eq('user_id',owner).in('id',ids.slice(i,i+200));if(topics.error)throw topics.error;topics.data?.forEach(t=>titles.set(t.id,t.title))}
 return records.filter(r=>titles.has(r.payload.ideaId)).map(r=>({...r,currentIdeaTitle:titles.get(r.payload.ideaId)}))
}

export async function readFeedbackCandidates(owner:string,period:string,genre=''){return feedbackCandidates(await readActiveIdeaReviews(owner),period,genre)}
