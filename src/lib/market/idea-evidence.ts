import {z} from 'zod'
import type {FrozenEvidence,EvidenceRecord} from './evidence'
export const IDEA_EVIDENCE_SOURCE='市场研究:idea-evidence'
export const linkSchema=z.object({ideaId:z.string().uuid(),evidenceId:z.string().uuid(),evidenceVersion:z.string().min(1),reason:z.string().trim().min(1,'请说明这条证据与选题的关系').max(1000),purpose:z.enum(['支持选题','提示风险','背景参考']),updated_at:z.string().min(1).optional()})
export type IdeaEvidencePayload={kind:'idea-evidence';ideaId:string;ideaTitle:string;purpose:'支持选题'|'提示风险'|'背景参考';reason:string;active:boolean;evidence:FrozenEvidence;actor:string}
export type IdeaEvidenceRecord={id:string;created_at:string;updated_at:string;payload:IdeaEvidencePayload;sourceChanged?:boolean;sourceStatus?:string}
export function linkSnapshot(record:EvidenceRecord,expected:string):FrozenEvidence{
 if(record.updated_at!==expected||record.payload.status!=='已核验')throw new Error('来源证据已变化或尚未核验，请刷新后重新选择')
 return {id:record.id,updated_at:record.updated_at,payload:structuredClone(record.payload)}
}
