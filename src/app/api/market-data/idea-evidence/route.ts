import {NextRequest,NextResponse} from 'next/server'
import {createHash} from 'node:crypto'
import {z} from 'zod'
import {requireUser} from '@/lib/supabase/require-user'
import {requireWorkspaceAccess} from '@/lib/supabase/workspace-access'
import {serviceClient} from '@/lib/supabase/service'
import {EVIDENCE_SOURCE} from '@/lib/market/evidence'
import {IDEA_EVIDENCE_SOURCE,linkSchema,linkSnapshot,type IdeaEvidencePayload} from '@/lib/market/idea-evidence'
export const dynamic='force-dynamic'
const fail=(error:string,status=400)=>NextResponse.json({error},{status})
const fields='id,created_at,updated_at,raw_rows'
async function context(edit=false){const {user,response}=await requireUser();if(response)return {response};const [market,discover]=await Promise.all([requireWorkspaceAccess(user.id,'market_data','view'),requireWorkspaceAccess(user.id,'discover',edit?'edit':'view')]);if(!market||!discover||market.ownerId!==discover.ownerId)return {response:fail(edit?'需要市场查看及选题编辑权限':'需要市场和选题查看权限',403)};return {user,owner:market.ownerId,canEdit:discover.canEdit}}
async function idea(owner:string,id:string){const r=await serviceClient.from('ideas').select('id,title').eq('user_id',owner).eq('id',id).maybeSingle();if(r.error)throw r.error;return r.data}
export async function GET(req:NextRequest){try{
 const ctx=await context();if(ctx.response)return ctx.response
 const id=z.string().uuid().safeParse(req.nextUrl.searchParams.get('ideaId'));if(!id.success)return fail('选题编号无效');if(!await idea(ctx.owner!,id.data))return fail('选题不存在或无权访问',404)
 const offset=Number(req.nextUrl.searchParams.get('offset')||0);if(!Number.isInteger(offset)||offset<0||offset>100000)return fail('无效分页')
 const r=await serviceClient.from('market_data_imports').select(fields).eq('user_id',ctx.owner!).eq('source_name',IDEA_EVIDENCE_SOURCE).eq('raw_rows->0->>ideaId',id.data).order('created_at',{ascending:false}).order('id').range(offset,offset+20);if(r.error)throw r.error
 const rows=(r.data||[]).slice(0,20),ids=rows.map(r=>r.raw_rows[0].evidence.id)
 const sources=ids.length?await serviceClient.from('market_data_imports').select('id,updated_at,raw_rows').eq('user_id',ctx.owner!).eq('source_name',EVIDENCE_SOURCE).in('id',ids):{data:[],error:null};if(sources.error)throw sources.error
 return NextResponse.json({canEdit:ctx.canEdit,hasMore:(r.data||[]).length>20,records:rows.map(r=>{const payload=r.raw_rows[0] as IdeaEvidencePayload,source=sources.data?.find(s=>s.id===payload.evidence.id);return {id:r.id,created_at:r.created_at,updated_at:r.updated_at,payload,sourceChanged:!source||source.updated_at!==payload.evidence.updated_at,sourceStatus:source?.raw_rows[0].status||'来源不可用'}})},{headers:{'Cache-Control':'private, no-store'}})
}catch{return fail('关联证据读取失败，请重试',503)}}
export async function POST(req:NextRequest){try{
 const ctx=await context(true);if(ctx.response)return ctx.response
 const parsed=linkSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return fail(parsed.error.issues[0]?.message||'关联数据不完整')
 const v=parsed.data,topic=await idea(ctx.owner!,v.ideaId);if(!topic)return fail('选题不存在或无权访问',404)
 const r=await serviceClient.from('market_data_imports').select(fields).eq('user_id',ctx.owner!).eq('source_name',EVIDENCE_SOURCE).eq('id',v.evidenceId).maybeSingle();if(r.error)throw r.error;if(!r.data)return fail('证据不存在或无权访问',404)
 let frozen;try{frozen=linkSnapshot({...r.data,payload:r.data.raw_rows[0]},v.evidenceVersion)}catch(e){return fail((e as Error).message,409)}
 const payload:IdeaEvidencePayload={kind:'idea-evidence',ideaId:topic.id,ideaTitle:topic.title,purpose:v.purpose,reason:v.reason,active:true,evidence:frozen,actor:ctx.user!.id}
 const h=createHash('sha256').update(`${ctx.owner}:idea-evidence:${v.ideaId}:${v.evidenceId}`).digest('hex'),id=`${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`
 if(v.updated_at){const u=await serviceClient.from('market_data_imports').update({raw_rows:[payload],updated_at:new Date(Math.max(Date.now(),Date.parse(v.updated_at)+1||0)).toISOString()}).eq('id',id).eq('source_name',IDEA_EVIDENCE_SOURCE).eq('user_id',ctx.owner!).eq('updated_at',v.updated_at).select('id').maybeSingle();if(u.error)throw u.error;if(!u.data)return fail('关联已被修改，请刷新后重新操作',409)}
 else {const u=await serviceClient.from('market_data_imports').insert({id,user_id:ctx.owner!,source_name:IDEA_EVIDENCE_SOURCE,file_name:topic.title,row_count:1,columns:[],raw_rows:[payload]});if(u.error?.code==='23505')return fail('该证据已有关联记录，请使用更新或恢复关联',409);if(u.error)throw u.error}
 return NextResponse.json({success:true})
}catch{return fail('关联保存失败，输入保留，请刷新列表核对后重试',503)}}
export async function PATCH(req:NextRequest){try{
 const ctx=await context(true);if(ctx.response)return ctx.response
 const v=z.object({id:z.string().uuid(),ideaId:z.string().uuid(),updated_at:z.string().min(1)}).safeParse(await req.json().catch(()=>null));if(!v.success)return fail('关联数据无效');if(!await idea(ctx.owner!,v.data.ideaId))return fail('选题不存在',404)
 const r=await serviceClient.from('market_data_imports').select(fields).eq('user_id',ctx.owner!).eq('source_name',IDEA_EVIDENCE_SOURCE).eq('id',v.data.id).maybeSingle();if(r.error)throw r.error;if(!r.data||r.data.raw_rows[0].ideaId!==v.data.ideaId)return fail('关联不存在',404)
 const u=await serviceClient.from('market_data_imports').update({raw_rows:[{...r.data.raw_rows[0],active:false,actor:ctx.user!.id}],updated_at:new Date().toISOString()}).eq('id',r.data.id).eq('user_id',ctx.owner!).eq('source_name',IDEA_EVIDENCE_SOURCE).eq('updated_at',v.data.updated_at).select('id').maybeSingle();if(u.error)throw u.error;if(!u.data)return fail('关联已变化，请刷新后重试',409)
 return NextResponse.json({success:true})
}catch{return fail('解除关联失败，请重试',503)}}
