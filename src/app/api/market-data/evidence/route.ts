import {NextRequest,NextResponse} from 'next/server'
import {createHash} from 'node:crypto'
import {requireUser} from '@/lib/supabase/require-user'
import {requireWorkspaceAccess} from '@/lib/supabase/workspace-access'
import {serviceClient} from '@/lib/supabase/service'
import {EVIDENCE_SOURCE,evidenceWriteSchema,type EvidencePayload} from '@/lib/market/evidence'
import {readReport,readReportUnits} from '@/lib/market/report-store'
import {resolveCitation} from '@/lib/market/report-types'
export const dynamic='force-dynamic'
const fields='id,created_at,updated_at,raw_rows'
const fail=(error:string,status=400)=>NextResponse.json({error},{status})
const record=(r:{id:string;created_at:string;updated_at:string;raw_rows:EvidencePayload[]})=>({id:r.id,created_at:r.created_at,updated_at:r.updated_at,payload:r.raw_rows[0]})
async function context(edit=false){const {user,response}=await requireUser();if(response)return {response};const access=await requireWorkspaceAccess(user.id,'market_data',edit?'edit':'view');return access?{user,access}:{response:fail('没有市场'+(edit?'编辑':'查看')+'权限',403)}}
export async function GET(request:NextRequest){try{
 const ctx=await context();if(ctx.response)return ctx.response
 const offset=Number(request.nextUrl.searchParams.get('offset')||0);if(!Number.isInteger(offset)||offset<0||offset>100000)return fail('无效分页')
 const r=await serviceClient.from('market_data_imports').select(fields).eq('user_id',ctx.access!.ownerId).eq('source_name',EVIDENCE_SOURCE).order('created_at',{ascending:false}).order('id').range(offset,offset+50)
 if(r.error)throw r.error
 return NextResponse.json({records:(r.data||[]).slice(0,50).map(record),hasMore:(r.data||[]).length>50,canEdit:ctx.access!.canEdit},{headers:{'Cache-Control':'private, no-store'}})
}catch{return fail('证据读取失败，请重试',503)}}
async function write(request:NextRequest,edit:boolean){try{
 const ctx=await context(true);if(ctx.response)return ctx.response
 const parsed=evidenceWriteSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail(parsed.error.issues[0]?.message||'请检查证据内容')
 const input=parsed.data,owner=ctx.access!.ownerId
 if(edit&&!input.updated_at)return fail('缺少记录版本，请重新打开证据')
 const now=new Date(Math.max(Date.now(),Date.parse(input.updated_at||'')+1||0)).toISOString()
 let citation
 if(input.evidence.reportRef){
  const report=await readReport(owner,input.evidence.reportRef.reportId);if(!report)return fail('引用附件不存在或无权访问',404)
  try{citation=resolveCitation(report,await readReportUnits(report),input.evidence.reportRef)}catch(e){return fail(e instanceof Error?e.message:'附件引用无效')}
  if(input.evidence.excerpt!==citation.quote)return fail('摘录与附件引用不一致，请重新选取出处')
 }
 const payload:EvidencePayload={...input.evidence,...(citation?{citation,locator:`${citation.fileName} · ${citation.label}`} : {}),kind:'evidence',actor:ctx.user!.id,verifiedAt:input.evidence.status==='已核验'?now:null,verifiedBy:input.evidence.status==='已核验'?ctx.user!.id:null}
 if(edit){
  const r=await serviceClient.from('market_data_imports').update({file_name:payload.title,period_label:payload.period||null,raw_rows:[payload],updated_at:now}).eq('user_id',owner).eq('source_name',EVIDENCE_SOURCE).eq('id',input.id).eq('updated_at',input.updated_at!).select(fields).maybeSingle()
  if(r.error)throw r.error;if(!r.data)return fail('证据已被修改或不存在，请刷新列表后重新打开；当前输入仍保留。',409)
  return NextResponse.json({record:record(r.data)})
 }
 const h=createHash('sha256').update(`${owner}:evidence:${input.id}`).digest('hex'),id=`${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`
 const r=await serviceClient.from('market_data_imports').insert({id,user_id:owner,source_name:EVIDENCE_SOURCE,file_name:payload.title,period_label:payload.period||null,row_count:1,columns:[],raw_rows:[payload]}).select(fields).single()
 if(r.error?.code==='23505'){const old=await serviceClient.from('market_data_imports').select(fields).eq('id',id).eq('user_id',owner).eq('source_name',EVIDENCE_SOURCE).single();if(old.error)throw old.error;return NextResponse.json({record:record(old.data),existing:true})}
 if(r.error)throw r.error
 return NextResponse.json({record:record(r.data)},{status:201})
}catch{return fail('证据保存失败，输入仍保留，请重试',503)}}
export async function POST(r:NextRequest){return write(r,false)}
export async function PATCH(r:NextRequest){return write(r,true)}
