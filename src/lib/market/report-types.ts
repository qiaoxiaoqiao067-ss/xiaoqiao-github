import {z} from 'zod'
export const REPORT_SOURCE='市场研究:report'
export const MAX_REPORT_BYTES=20*1024*1024
export const REPORT_EXTENSIONS=['pdf','docx','txt','md'] as const
export type ReportUnit={id:string;label:string;text:string;page?:number}
export type ReportPayload={kind:'report';fileName:string;size:number;extension:string;storagePath:string;parsedPath?:string;sha256?:string;status:'待上传'|'已解析'|'部分可读'|'解析失败';error?:string;unitCount?:number;emptyUnits?:number;actor:string}
export type ReportRecord={id:string;created_at:string;updated_at:string;payload:ReportPayload}
export const reportRefSchema=z.object({reportId:z.string().uuid(),unitId:z.string().min(1).max(100),quote:z.string().trim().min(1).max(12000)})
export type ReportRef=z.infer<typeof reportRefSchema>
export type ReportCitation=ReportRef&{fileName:string;sha256:string;label:string;page?:number}
export function resolveCitation(report:ReportRecord,units:ReportUnit[],ref:ReportRef):ReportCitation{
 if(report.id!==ref.reportId||!['已解析','部分可读'].includes(report.payload.status)||!report.payload.sha256)throw new Error('附件尚未解析，请重新打开来源')
 const unit=units.find(u=>u.id===ref.unitId)
 if(!unit||!unit.text.includes(ref.quote)||!ref.quote.trim())throw new Error('引用文字与原文位置不匹配，请从附件正文重新选择')
 return {...ref,fileName:report.payload.fileName,sha256:report.payload.sha256,label:unit.label,...(unit.page?{page:unit.page}:{})}
}
export function textUnits(text:string,kind:'txt'|'md'|'docx'):ReportUnit[]{
 const normalized=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n')
 if(kind==='docx')return normalized.split(/\n\s*\n/).map((text,index)=>({id:`paragraph-${index+1}`,label:`提取段落 ${index+1}（非页码）`,text:text.trim()})).filter(u=>u.text)
 return normalized.split('\n').map((text,index)=>({id:`line-${index+1}`,label:`第 ${index+1} 行`,text})).filter(u=>u.text.trim())
}
