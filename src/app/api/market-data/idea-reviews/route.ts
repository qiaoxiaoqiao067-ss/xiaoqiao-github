import {NextRequest,NextResponse} from 'next/server'
import {createHash} from 'node:crypto'
import {z} from 'zod'
import {requireUser} from '@/lib/supabase/require-user'
import {requireWorkspaceAccess} from '@/lib/supabase/workspace-access'
import {serviceClient} from '@/lib/supabase/service'
import {MONTHLY_REVIEW_SOURCE} from '@/lib/market/monthly-review'
import {readMonthlyReviews} from '@/lib/market/monthly-review-server'
import {IDEA_REVIEW_SOURCE,linkReviewSchema,patchIdeaReviewSchema,ideaReviewKey,createIdeaReview,updateValidation,type IdeaReviewPayload} from '@/lib/market/idea-review'
export const dynamic='force-dynamic'
export const maxDuration=60
const fields='id,created_at,updated_at,raw_rows'
const fail=(error:string,status=400)=>NextResponse.json({error},{status})
const record=(r:{id:string;created_at:string;updated_at:string;raw_rows:IdeaReviewPayload[]})=>({id:r.id,created_at:r.created_at,updated_at:r.updated_at,payload:r.raw_rows[0]})
async function context(edit=false){const {user,response}=await requireUser();if(response)return {response};const [market,discover]=await Promise.all([requireWorkspaceAccess(user.id,'market_data','view'),requireWorkspaceAccess(user.id,'discover',edit?'edit':'view')]);return market&&discover&&market.ownerId===discover.ownerId?{user,owner:market.ownerId,canEdit:discover.canEdit}:{response:fail('需要市场查看及选题'+(edit?'编辑':'查看')+'权限',403)}}
async function getIdea(owner:string,id:string){const r=await serviceClient.from('ideas').select('id,title').eq('user_id',owner).eq('id',id).maybeSingle();if(r.error)throw r.error;return r.data}
export async function GET(req:NextRequest){try{
 const ctx=await context();if(ctx.response)return ctx.response
 const ideaId=req.nextUrl.searchParams.get('ideaId'),reviewId=req.nextUrl.searchParams.get('reviewId'),offset=Number(req.nextUrl.searchParams.get('offset')||0)
 if(Boolean(ideaId)===Boolean(reviewId)||!z.string().uuid().safeParse(ideaId||reviewId).success||!Number.isInteger(offset)||offset<0||offset>100000)return fail('请选择有效的选题或研判')
 if(ideaId&&!await getIdea(ctx.owner!,ideaId))return fail('选题不存在或无权访问',404)
 let query=serviceClient.from('market_data_imports').select(fields).eq('user_id',ctx.owner!).eq('source_name',IDEA_REVIEW_SOURCE)
 query=ideaId?query.eq('raw_rows->0->>ideaId',ideaId):query.eq('raw_rows->0->review->>id',reviewId!)
 const rows=await query.order('created_at',{ascending:false}).order('id').range(offset,offset+20);if(rows.error)throw rows.error
 const records=(rows.data||[]).slice(0,20).map(record),groups=[...new Map(records.map(r=>[`${r.payload.review.payload.period}|${r.payload.review.payload.comparison}`,r.payload.review.payload])).values()]
 const sources=(await Promise.all(groups.map(g=>readMonthlyReviews(ctx.owner!,g.period,g.comparison)))).flat()
 const topics=records.length?await serviceClient.from('ideas').select('id,title').eq('user_id',ctx.owner!).in('id',[...new Set(records.map(r=>r.payload.ideaId))]):{data:[],error:null};if(topics.error)throw topics.error
 return NextResponse.json({canEdit:ctx.canEdit,hasMore:(rows.data||[]).length>20,records:records.map(r=>{const current=sources.find(s=>s.id===r.payload.review.id);return {...r,currentIdeaTitle:topics.data?.find(i=>i.id===r.payload.ideaId)?.title,sourceChanged:!current||current.sourceChanged||current.updated_at!==r.payload.review.updated_at}})},{headers:{'Cache-Control':'private, no-store'}})
}catch{return fail('选题研判与验证进度读取失败，请重试',503)}}
export async function POST(req:NextRequest){try{
 const ctx=await context(true);if(ctx.response)return ctx.response;const parsed=linkReviewSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return fail(parsed.error.issues[0]?.message||'关联信息不完整')
 const v=parsed.data,topic=await getIdea(ctx.owner!,v.ideaId);if(!topic)return fail('选题不存在或无权访问',404)
 const h=createHash('sha256').update(ideaReviewKey(ctx.owner!,topic.id,v.reviewId)).digest('hex'),id=`${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`
 const existing=await serviceClient.from('market_data_imports').select(fields).eq('id',id).eq('user_id',ctx.owner!).eq('source_name',IDEA_REVIEW_SOURCE).maybeSingle();if(existing.error)throw existing.error;if(existing.data)return NextResponse.json({record:record(existing.data),existing:true})
 const raw=await serviceClient.from('market_data_imports').select('raw_rows').eq('id',v.reviewId).eq('user_id',ctx.owner!).eq('source_name',MONTHLY_REVIEW_SOURCE).maybeSingle();if(raw.error)throw raw.error;if(!raw.data)return fail('研判不存在或无权访问',404)
 const p=raw.data.raw_rows[0],review=(await readMonthlyReviews(ctx.owner!,p.period,p.comparison)).find(r=>r.id===v.reviewId);if(!review)return fail('研判不可用',404)
 let payload;try{payload=createIdeaReview(topic,review,v.reviewVersion,v.reason,ctx.user!.id,new Date().toISOString())}catch(e){return fail((e as Error).message,409)}
 const saved=await serviceClient.from('market_data_imports').insert({id,user_id:ctx.owner!,source_name:IDEA_REVIEW_SOURCE,period_label:p.period,file_name:topic.title,row_count:1,columns:[],raw_rows:[payload]}).select(fields).single()
 if(saved.error?.code==='23505'){const again=await serviceClient.from('market_data_imports').select(fields).eq('id',id).eq('user_id',ctx.owner!).eq('source_name',IDEA_REVIEW_SOURCE).single();if(again.error)throw again.error;return NextResponse.json({record:record(again.data),existing:true})}
 if(saved.error)throw saved.error;return NextResponse.json({record:record(saved.data),existing:false},{status:201})
}catch{return fail('关联失败，原选题和进度未改动，请重试',503)}}
export async function PATCH(req:NextRequest){try{
 const ctx=await context(true);if(ctx.response)return ctx.response;const parsed=patchIdeaReviewSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return fail(parsed.error.issues[0]?.message||'验证数据不完整')
 const v=parsed.data;if(!await getIdea(ctx.owner!,v.ideaId))return fail('选题不存在或无权访问',404)
 const row=await serviceClient.from('market_data_imports').select(fields).eq('id',v.id).eq('user_id',ctx.owner!).eq('source_name',IDEA_REVIEW_SOURCE).maybeSingle();if(row.error)throw row.error;if(!row.data||row.data.raw_rows[0].ideaId!==v.ideaId)return fail('关联不存在',404)
 if(row.data.updated_at!==v.updated_at)return fail('进度已被更新，请刷新后重新核对；当前输入保留',409)
 const now=new Date(Math.max(Date.now(),Date.parse(v.updated_at)+1)).toISOString(),old=row.data.raw_rows[0] as IdeaReviewPayload
 let payload;try{payload=v.operation==='validation'?updateValidation(old,v.action,ctx.user!.id,now):{...old,active:v.active,actor:ctx.user!.id}}catch(e){return fail((e as Error).message)}
 const saved=await serviceClient.from('market_data_imports').update({raw_rows:[payload],updated_at:now}).eq('id',v.id).eq('user_id',ctx.owner!).eq('source_name',IDEA_REVIEW_SOURCE).eq('updated_at',v.updated_at).select(fields).maybeSingle();if(saved.error)throw saved.error;if(!saved.data)return fail('进度已被其他人更新，请刷新后重新核对；当前输入保留',409)
 return NextResponse.json({record:record(saved.data)})
}catch{return fail('验证进度保存失败，当前输入保留，请重试',503)}}
