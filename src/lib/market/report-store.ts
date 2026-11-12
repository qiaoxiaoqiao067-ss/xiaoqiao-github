import {serviceClient} from '@/lib/supabase/service'
import {REPORT_SOURCE,type ReportPayload,type ReportRecord,type ReportUnit} from './report-types'
export async function readReport(owner:string,id:string):Promise<ReportRecord|null>{
 const {data,error}=await serviceClient.from('market_data_imports').select('id,created_at,updated_at,raw_rows').eq('user_id',owner).eq('source_name',REPORT_SOURCE).eq('id',id).maybeSingle()
 if(error)throw error;return data?{id:data.id,created_at:data.created_at,updated_at:data.updated_at,payload:data.raw_rows[0] as ReportPayload}:null
}
export async function readReportUnits(report:ReportRecord):Promise<ReportUnit[]>{
 if(!report.payload.parsedPath)return []
 const {data,error}=await serviceClient.storage.from('content-files').download(report.payload.parsedPath);if(error||!data)throw new Error('附件正文读取失败，请重试')
 return JSON.parse(await data.text()) as ReportUnit[]
}
