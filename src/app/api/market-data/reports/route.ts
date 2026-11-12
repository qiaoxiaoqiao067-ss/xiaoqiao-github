import {NextRequest,NextResponse} from 'next/server'
import {createHash} from 'node:crypto'
import {z} from 'zod'
import {requireUser} from '@/lib/supabase/require-user'
import {requireWorkspaceAccess} from '@/lib/supabase/workspace-access'
import {serviceClient} from '@/lib/supabase/service'
import {MAX_REPORT_BYTES,REPORT_SOURCE,REPORT_EXTENSIONS,type ReportPayload} from '@/lib/market/report-types'
import {parseReport} from '@/lib/market/report-parser'
import {readReport,readReportUnits} from '@/lib/market/report-store'
export const runtime='nodejs'
export const maxDuration=120
export const dynamic='force-dynamic'
const fail=(error:string,status=400)=>NextResponse.json({error},{status})
const uid=z.string().uuid()
const init=z.object({action:z.literal('init'),uploadId:uid,fileName:z.string().min(1).max(250),size:z.number().int().min(1).max(MAX_REPORT_BYTES)})
const finalize=z.object({action:z.literal('parse'),id:uid})
const mime:Record<string,string>={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain',md:'text/plain'}
export async function GET(req:NextRequest){try{
 const {user,response}=await requireUser();if(response)return response
 const access=await requireWorkspaceAccess(user.id,'market_data','view');if(!access)return fail('没有市场查看权限',403)
 const id=req.nextUrl.searchParams.get('id')
 if(id){if(!uid.safeParse(id).success)return fail('附件编号无效');const record=await readReport(access.ownerId,id);if(!record)return fail('附件不存在或无权访问',404)
  if(req.nextUrl.searchParams.get('download')==='1'){const {data,error}=await serviceClient.storage.from('content-files').createSignedUrl(record.payload.storagePath,120,record.payload.extension==='pdf'?undefined:{download:record.payload.fileName});if(error)throw error;const originalUrl=new URL(data.signedUrl);if(record.payload.extension!=='pdf')originalUrl.searchParams.set('download',record.payload.fileName);return NextResponse.json({url:originalUrl.toString(),download:record.payload.extension!=='pdf'},{headers:{'Cache-Control':'private, no-store'}})}
  return NextResponse.json({record,units:await readReportUnits(record)},{headers:{'Cache-Control':'private, no-store'}})
 }
 const offset=Number(req.nextUrl.searchParams.get('offset')||0);if(!Number.isInteger(offset)||offset<0||offset>100000)return fail('无效分页')
 const {data,error}=await serviceClient.from('market_data_imports').select('id,created_at,updated_at,raw_rows').eq('user_id',access.ownerId).eq('source_name',REPORT_SOURCE).order('created_at',{ascending:false}).order('id').range(offset,offset+20)
 if(error)throw error;return NextResponse.json({records:(data||[]).slice(0,20).map(r=>({id:r.id,created_at:r.created_at,updated_at:r.updated_at,payload:r.raw_rows[0]})),hasMore:(data||[]).length>20,canEdit:access.canEdit},{headers:{'Cache-Control':'private, no-store'}})
}catch{return fail('附件读取失败，请重试',503)}}
export async function POST(req:NextRequest){try{
 const {user,response}=await requireUser();if(response)return response
 const access=await requireWorkspaceAccess(user.id,'market_data','edit');if(!access)return fail('没有市场编辑权限',403)
 const body=await req.json().catch(()=>null),input=z.union([init,finalize]).safeParse(body);if(!input.success)return fail('请选择20MB以内的PDF、DOCX、TXT或Markdown文件')
 const owner=access.ownerId
 if(input.data.action==='init'){
  const v=input.data,extension=v.fileName.split('.').pop()!.toLowerCase();if(!REPORT_EXTENSIONS.some(e=>e===extension))return fail('仅支持PDF、DOCX、TXT、Markdown')
  const h=createHash('sha256').update(`${owner}:report:${v.uploadId}`).digest('hex'),id=`${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`
  let record=await readReport(owner,id)
  if(record&&(record.payload.fileName!==v.fileName||record.payload.size!==v.size))return fail('上传任务与文件不匹配，请重新选择',409)
  if(!record){const payload:ReportPayload={kind:'report',fileName:v.fileName,size:v.size,extension,storagePath:`${owner}/market-reports/${id}/original.${extension}`,status:'待上传',actor:user.id};const r=await serviceClient.from('market_data_imports').insert({id,user_id:owner,source_name:REPORT_SOURCE,file_name:v.fileName,row_count:1,columns:[],raw_rows:[payload]});if(r.error&&r.error.code!=='23505')throw r.error;record=await readReport(owner,id)}
  if(!record)throw new Error('附件初始化失败')
  if(record.payload.parsedPath)return NextResponse.json({id,uploaded:true,complete:true})
  // A previous upload may have succeeded even when its response was lost.
  const info=await serviceClient.storage.from('content-files').info(record.payload.storagePath)
  if(!info.error)return NextResponse.json({id,uploaded:true})
  const {data,error}=await serviceClient.storage.from('content-files').createSignedUploadUrl(record.payload.storagePath,{upsert:false});if(error)throw error
  return NextResponse.json({id,path:record.payload.storagePath,token:data.token,contentType:mime[extension],uploaded:false})
 }
 const record=await readReport(owner,input.data.id);if(!record)return fail('附件不存在或无权访问',404)
 if(record.payload.parsedPath)return NextResponse.json({record,units:await readReportUnits(record)})
 const {data:blob,error}=await serviceClient.storage.from('content-files').download(record.payload.storagePath);if(error||!blob)return fail('原附件尚未上传完成，请重新选择同一文件继续上传',409)
 if(blob.size!==record.payload.size||blob.size>MAX_REPORT_BYTES)return fail('附件大小不一致，请重新选择文件上传',409)
 const bytes=Buffer.from(await blob.arrayBuffer()),sha256=createHash('sha256').update(bytes).digest('hex')
 let payload:ReportPayload,units
 try{const parsed=await parseReport(bytes,record.payload.extension);units=parsed.units;const parsedPath=`${owner}/market-reports/${record.id}/parsed-${sha256}.json`
  const saved=await serviceClient.storage.from('content-files').upload(parsedPath,Buffer.from(JSON.stringify(units)),{contentType:'text/plain',upsert:false});if(saved.error&&!/already exists|duplicate/i.test(saved.error.message))throw saved.error
  payload={...record.payload,sha256,parsedPath,status:parsed.status,unitCount:units.length,emptyUnits:parsed.emptyUnits,error:parsed.emptyUnits?'部分页面没有可提取文字，请逐页对照原附件；未进行OCR。':undefined}
 }catch(e){payload={...record.payload,sha256,status:'解析失败',error:(e instanceof Error?e.message:'无法读取该报告').slice(0,500)}}
 const updated=await serviceClient.from('market_data_imports').update({raw_rows:[payload],updated_at:new Date().toISOString()}).eq('id',record.id).eq('user_id',owner).eq('source_name',REPORT_SOURCE).eq('updated_at',record.updated_at)
 if(updated.error)throw updated.error
 const savedRecord=await readReport(owner,record.id)
 return NextResponse.json({record:savedRecord,units:savedRecord?.payload.parsedPath?await readReportUnits(savedRecord):[],message:payload.status==='解析失败'?'原附件已保留，解析失败，可重试或另行粘贴摘录':undefined})
}catch{return fail('附件处理暂时失败，已上传原件保留，可重试解析',503)}}
