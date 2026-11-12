import {NextRequest,NextResponse} from 'next/server'
import {createHash} from 'node:crypto'
import {requireUser} from '@/lib/supabase/require-user'
import {requireWorkspaceAccess} from '@/lib/supabase/workspace-access'
import {serviceClient} from '@/lib/supabase/service'
import {ARCHIVE_SOURCE,WATCH_SOURCE,createRecordSchema,patchWatchSchema,type ArchiveRecord,type WatchRecord} from '@/lib/market/research-records'
import {activeMonthlySources,monthKey,trackIdentity} from '@/lib/market/monthly-history'
import {boardSamples,compareBoards} from '@/lib/market/board-analysis'
import {buildMarketResearch} from '@/lib/market/research'
import {periodKind,isBoardImport,requestedImports} from '@/lib/market/import-scope'
export const dynamic='force-dynamic'
export const maxDuration=60
const fields='id,created_at,updated_at,raw_rows'
const record=(row:{id:string;created_at:string;updated_at:string;raw_rows:unknown[]})=>({id:row.id,created_at:row.created_at,updated_at:row.updated_at,payload:row.raw_rows[0]})
const fail=(error:string,status=400)=>NextResponse.json({error},{status})
function stableId(value:string){const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`}
async function context(edit=false){const {user,response}=await requireUser();if(response)return {response};const access=await requireWorkspaceAccess(user.id,'market_data',edit?'edit':'view');if(!access)return {response:fail(edit?'没有市场编辑权限':'没有市场查看权限',403)};return {access,user}}
export async function GET(request:NextRequest){
  try{
    const ctx=await context();if(ctx.response)return ctx.response
    const offset=Number(request.nextUrl.searchParams.get('offset')||0),kind=request.nextUrl.searchParams.get('kind')
    if(!['watch','archive'].includes(kind||'')||!Number.isInteger(offset)||offset<0||offset>100000)return fail('查询参数无效')
    const {data,error}=await serviceClient.from('market_data_imports').select(fields).eq('user_id',ctx.access!.ownerId).eq('source_name',kind==='watch'?WATCH_SOURCE:ARCHIVE_SOURCE).order('created_at',{ascending:false}).order('id').range(offset,offset+50)
    if(error)throw error
    return NextResponse.json({records:(data||[]).slice(0,50).map(record),hasMore:(data||[]).length>50,canEdit:ctx.access!.canEdit},{headers:{'Cache-Control':'private, no-store'}})
  }catch{return fail('研究记录读取失败，请重试',503)}
}
export async function POST(request:NextRequest){
  try{
    const ctx=await context(true);if(ctx.response)return ctx.response
    const parsed=createRecordSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail('请检查记录标题及数据范围')
    const input=parsed.data,owner=ctx.access!.ownerId
    let payload:WatchRecord|ArchiveRecord,id:string,source:string,period:string
    if(input.kind==='watch'){
      const {data,error}=await serviceClient.from('market_data_imports').select('*').eq('id',input.sourceId).eq('user_id',owner).single()
      if(error||!data)return fail('原始榜单不存在或无权访问',404)
      if(data.updated_at!==input.sourceVersion)return fail('榜单已更新，请刷新后再加入追踪',409)
      const sample=boardSamples([data],periodKind(data.period_label||''))[0]
      if(!sample||sample.issues.length)return fail('原榜存在异常，核验后才能加入追踪')
      const matches=sample.ai.filter(r=>String(r[sample.titleKey]??'').trim()===input.title&&String(r[sample.channelKey||'']??'')===input.channel)
      if(matches.length!==1)return fail('作品不存在或同名记录不唯一，请核对来源及剧场号')
      id=stableId(`${owner}:${trackIdentity(sample.key,input.title,input.channel)}`);source=WATCH_SOURCE;period=sample.period
      payload={kind:'watch',board:sample.key,title:input.title,channel:input.channel,status:'观察中',note:'',startedPeriod:sample.period,source:{id:data.id,file_name:data.file_name,updated_at:data.updated_at},initialRank:Number(matches[0][sample.rankKey])||null,actor:ctx.user!.id}
    }else{
      if(!monthKey(input.period)||input.comparison&&!monthKey(input.comparison)||input.comparison===input.period)return fail('研判存档目前支持不同月份的月度结论')
      const {data:allDirectory,error:directoryError}=await serviceClient.from('market_data_imports').select('id,source_name,file_name,columns,created_at,updated_at,period_label').eq('user_id',owner).in('period_label',[input.period,input.comparison])
      if(directoryError)throw directoryError
      const directory=(allDirectory||[]).filter(i=>isBoardImport(i)||i.source_name.startsWith('市场版本:'))
      // Client evidence must still match the entire selected ADX scope, including version markers.
      const expected=new Map(input.sources.map(i=>[i.id,i.updated_at]))
      if(!directory?.length||directory.length!==expected.size||directory.some(i=>expected.get(i.id)!==i.updated_at))return fail('榜单目录或版本已变化，请重新加载后再存档',409)
      const {data,error}=await serviceClient.from('market_data_imports').select('*').eq('user_id',owner).in('id',requestedImports(directory,input.period,input.comparison).map(i=>i.id))
      if(error)throw error
      if(!data||data.length!==requestedImports(directory,input.period,input.comparison).length||data.some(i=>expected.get(i.id)!==i.updated_at))return fail('读取时榜单更新，请重新加载后再存档',409)
      const allSources=directory.map(i=>({...i,raw_rows:[],...data.find(d=>d.id===i.id)}))
      const current=activeMonthlySources(allSources,monthKey(input.period)!),previous=activeMonthlySources(allSources,monthKey(input.comparison)||'')
      const currentSamples=boardSamples(current,'month'),previousSamples=boardSamples(previous,'month')
      const research=buildMarketResearch(currentSamples,compareBoards(currentSamples,previousSamples))
      if(!research.findings.length)return fail('当前没有可归档的有效研判，请先补齐或核验数据')
      id=stableId(`${owner}:archive:${input.requestId}`);source=ARCHIVE_SOURCE;period=input.period
      payload={kind:'archive',title:input.title,period,comparison:input.comparison,note:input.note,research,sources:directory.map(i=>({id:i.id,file_name:i.file_name,period_label:i.period_label,updated_at:i.updated_at})),actor:ctx.user!.id,rulesVersion:'monthly-research-2026-11-12-v1'}
    }
    const {data,error}=await serviceClient.from('market_data_imports').insert({id,user_id:owner,source_name:source,period_label:period,file_name:payload.title,row_count:1,columns:[],raw_rows:[payload]}).select(fields).single()
    if(error?.code==='23505'){
      const existing=await serviceClient.from('market_data_imports').select(fields).eq('id',id).eq('user_id',owner).eq('source_name',source).single()
      if(existing.error)throw existing.error
      return NextResponse.json({record:record(existing.data),existing:true})
    }
    if(error)throw error
    return NextResponse.json({record:record(data)},{status:201})
  }catch{return fail('保存失败，原有记录未改动。请重试。',503)}
}
export async function PATCH(request:NextRequest){
  try{
    const ctx=await context(true);if(ctx.response)return ctx.response
    const parsed=patchWatchSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail('追踪记录格式无效')
    const input=parsed.data
    const {data,error}=await serviceClient.from('market_data_imports').select(fields).eq('id',input.id).eq('user_id',ctx.access!.ownerId).eq('source_name',WATCH_SOURCE).single()
    if(error||!data)return fail('追踪记录不存在',404)
    const updated=await serviceClient.from('market_data_imports').update({raw_rows:[{...data.raw_rows[0],status:input.status,note:input.note,actor:ctx.user!.id}],updated_at:new Date(Math.max(Date.now(),Date.parse(input.updated_at)+1)).toISOString()}).eq('id',input.id).eq('user_id',ctx.access!.ownerId).eq('source_name',WATCH_SOURCE).eq('updated_at',input.updated_at).select(fields).maybeSingle()
    if(updated.error)throw updated.error
    if(!updated.data)return fail('记录已被其他人修改，请刷新后再编辑；当前文字仍保留。',409)
    return NextResponse.json({record:record(updated.data)})
  }catch{return fail('追踪保存失败，请重试；当前文字仍保留。',503)}
}
