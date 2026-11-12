import {serviceClient} from '@/lib/supabase/service'
import {EVIDENCE_SOURCE,type EvidencePayload} from './evidence'
import {MONTHLY_REVIEW_SOURCE,type MonthlyReview,type MonthlyReviewRecord} from './monthly-review'
import {isBoardImport} from './import-scope'
export const reviewFields='id,created_at,updated_at,raw_rows'
export const asReview=(r:{id:string;created_at:string;updated_at:string;raw_rows:MonthlyReview[]})=>({id:r.id,created_at:r.created_at,updated_at:r.updated_at,payload:r.raw_rows[0]})
export async function readMonthlyReviews(owner:string,period:string,comparison:string){
 const rows=await serviceClient.from('market_data_imports').select(reviewFields).eq('user_id',owner).eq('source_name',MONTHLY_REVIEW_SOURCE).eq('period_label',period).eq('raw_rows->0->>comparison',comparison);if(rows.error)throw rows.error
 const records=(rows.data||[]).map(asReview),ids=[...new Set(records.flatMap(r=>r.payload.evidence.map(e=>e.evidence.id)))];if(!records.length)return [] as MonthlyReviewRecord[]
 const evidence=ids.length?await serviceClient.from('market_data_imports').select('id,updated_at,raw_rows').eq('user_id',owner).eq('source_name',EVIDENCE_SOURCE).in('id',ids):{data:[],error:null};if(evidence.error)throw evidence.error
 const sources=await serviceClient.from('market_data_imports').select('id,updated_at,source_name').eq('user_id',owner).in('period_label',[period,comparison]);if(sources.error)throw sources.error
 const directory=(sources.data||[]).filter(s=>isBoardImport(s)||s.source_name.startsWith('市场版本:'))
 return records.map(r=>({...r,sourceChanged:r.payload.sources.length!==directory.length||r.payload.sources.some(s=>!directory.some(d=>d.id===s.id&&d.updated_at===s.updated_at))||r.payload.evidence.some(e=>!evidence.data?.some(v=>v.id===e.evidence.id&&v.updated_at===e.evidence.updated_at&&(v.raw_rows[0] as EvidencePayload).status==='已核验'))}))
}
