import {NextRequest,NextResponse} from 'next/server'
import {createHash} from 'node:crypto'
import {requireUser} from '@/lib/supabase/require-user'
import {requireWorkspaceAccess} from '@/lib/supabase/workspace-access'
import {serviceClient} from '@/lib/supabase/service'
import {EVIDENCE_SOURCE,freezeEvidence,type EvidenceRecord} from '@/lib/market/evidence'
import {monthKey} from '@/lib/market/monthly-history'
import {MONTHLY_REVIEW_SOURCE,reviewWriteSchema,findingFingerprint,type MonthlyReview} from '@/lib/market/monthly-review'
import {monthlyResearch} from '@/lib/market/monthly-research-server'
import {asReview,reviewFields,readMonthlyReviews} from '@/lib/market/monthly-review-server'
export const dynamic='force-dynamic'
export const maxDuration=60
const fail=(error:string,status=400)=>NextResponse.json({error},{status})
async function context(edit=false){const {user,response}=await requireUser();if(response)return {response};const access=await requireWorkspaceAccess(user.id,'market_data',edit?'edit':'view');return access?{user,access}:{response:fail('没有市场'+(edit?'编辑':'查看')+'权限',403)}}
export async function GET(req:NextRequest){try{const ctx=await context();if(ctx.response)return ctx.response;const period=req.nextUrl.searchParams.get('period')||'',comparison=req.nextUrl.searchParams.get('comparison')||'';if(!monthKey(period)||comparison&&!monthKey(comparison))return fail('请选择月度统计期');return NextResponse.json({records:await readMonthlyReviews(ctx.access!.ownerId,period,comparison),canEdit:ctx.access!.canEdit},{headers:{'Cache-Control':'private, no-store'}})}catch{return fail('报告联合研判读取失败，请重试',503)}}
export async function POST(req:NextRequest){try{
 const ctx=await context(true);if(ctx.response)return ctx.response;const parsed=reviewWriteSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return fail(parsed.error.issues[0]?.message||'请补全研判');const input=parsed.data,owner=ctx.access!.ownerId
 if(!monthKey(input.period)||input.comparison&&!monthKey(input.comparison)||input.period===input.comparison)return fail('请选择不同月份')
 const {research,directory}=await monthlyResearch(owner,input.period,input.comparison),finding=research.findings.find(f=>f.id===input.findingId)
 if(!finding||findingFingerprint(finding)!==input.fingerprint)return fail('榜单研判已变化，请刷新后重新核对，当前文字保留',409)
 const source=await serviceClient.from('market_data_imports').select(reviewFields).eq('user_id',owner).eq('source_name',EVIDENCE_SOURCE).in('id',input.evidence.map(e=>e.id));if(source.error)throw source.error
 let frozen;try{frozen=freezeEvidence((source.data||[]).map(r=>({id:r.id,created_at:r.created_at,updated_at:r.updated_at,payload:r.raw_rows[0]})) as EvidenceRecord[],input.evidence,input.period)}catch(e){return fail((e as Error).message,409)}
 const now=new Date().toISOString(),hash=createHash('sha256').update(`${owner}:${input.period}:${input.comparison}:${input.findingId}:monthly-review`).digest('hex'),id=`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`
 const payload:MonthlyReview={kind:'monthly-review',period:input.period,comparison:input.comparison,findingId:finding.id,genre:finding.genre,fingerprint:input.fingerprint,conclusion:input.conclusion,topicBrief:input.topicBrief,testPlan:input.testPlan,revisit:input.revisit,sources:directory.map(s=>({id:s.id,updated_at:s.updated_at})),evidence:input.evidence.map(ref=>({evidence:frozen.find(e=>e.id===ref.id)!,relation:ref.relation,independence:ref.independence})),actor:ctx.user!.id,confirmedAt:now}
 const row={file_name:`${input.period}｜${finding.genre}｜报告联合研判`,period_label:input.period,raw_rows:[payload],updated_at:now}
 if(input.updated_at){const result=await serviceClient.from('market_data_imports').update(row).eq('user_id',owner).eq('source_name',MONTHLY_REVIEW_SOURCE).eq('id',id).eq('updated_at',input.updated_at).select(reviewFields).maybeSingle();if(result.error)throw result.error;if(!result.data)return fail('研判已被修改，请重新打开后编辑；当前输入保留',409);return NextResponse.json({record:asReview(result.data)})}
 const result=await serviceClient.from('market_data_imports').insert({...row,id,user_id:owner,source_name:MONTHLY_REVIEW_SOURCE,row_count:1,columns:[]}).select(reviewFields).single();if(result.error?.code==='23505')return fail('本月已有该研判，请刷新后编辑，避免重复覆盖',409);if(result.error)throw result.error;return NextResponse.json({record:asReview(result.data)},{status:201})
}catch{return fail('联合研判保存失败，文字仍保留，请重试',503)}}
