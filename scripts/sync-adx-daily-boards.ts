/** Publish verified local captures atomically per run; never collect or fabricate missing days. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {loadEnvConfig} from '@next/env'
import {AUTO_DAILY_SOURCE,DAILY_SYNC_SOURCE,prepareDailyBoards,dailyBatchTotals,dailyBoardIdentity,type DailySyncStatus} from '../src/lib/adx/daily-board-sync'
import {makeDailyBrief} from '../src/lib/adx/daily-brief'
function idFor(value:string){const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`}
async function main(){
 loadEnvConfig(process.cwd())
 const args=process.argv.slice(2),get=(s:string)=>args.includes(s)?args[args.indexOf(s)+1]:''
 const owner=get('--owner'),root=get('--root')?path.resolve(get('--root')):''
 if(!/^[0-9a-f-]{36}$/.test(owner)||!root)throw new Error('请提供 --owner 工作台所有者UUID --root 日报目录')
 const {serviceClient}=await import('../src/lib/supabase/service')
 const workspace=await serviceClient.from('workspaces').select('id').eq('owner_id',owner).maybeSingle()
 if(workspace.error||!workspace.data)throw new Error('未找到指定所有者工作台')
 const manifests:string[]=[]
 async function scan(dir:string,depth:number){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.isFile()&&e.name==='采集清单.json')manifests.push(path.join(dir,e.name));else if(e.isDirectory()&&depth<2)await scan(path.join(dir,e.name),depth+1)}}
 await scan(root,0)
 let published=0,unchanged=0,failed=0,blocked=0,trial=0
 for(const file of manifests.sort()){
   const manifest=JSON.parse(await fs.readFile(file,'utf8')),runKey=path.relative(root,path.dirname(file))
   const brief=makeDailyBrief(manifest,null,runKey)
   let status:DailySyncStatus={runKey,checkedAt:brief.collectedAt,requestedDate:brief.requestedDate,dataDate:brief.dataDate,state:'collection_blocked',boards:0,records:0,samples:0,note:brief.note||brief.status}
   if(/trial/.test(brief.status)){status={...status,state:'trial_skipped',note:'试跑基线未具备逐榜日期和筛选凭证，保留本地，不自动发布为正式日榜'};trial++}
   else if(!/^completed|^success/.test(brief.status)){blocked++;if(/login|登录/i.test(brief.status+' '+brief.note))status.note='ADX登录已失效，请在原采集浏览器完成登录后恢复采集；未生成该日榜单。'}
   else try{
     const content=await fs.readFile(path.join(path.dirname(file),'标准化数据.json'),'utf8')
     const checksum=createHash('sha256').update(content).digest('hex')
     const prepared=prepareDailyBoards(manifest,JSON.parse(content),runKey,checksum)
     const items=prepared.map(i=>({...i,id:idFor(`${owner}:${runKey}:${dailyBoardIdentity(i)}`),user_id:owner}))
     const existing=await serviceClient.from('market_data_imports').select('id,raw_rows,columns,row_count').eq('user_id',owner).eq('source_name',AUTO_DAILY_SOURCE).in('id',items.map(i=>i.id))
     if(existing.error)throw new Error(existing.error.message)
     const changes=items.filter(i=>{const old=existing.data?.find(o=>o.id===i.id);return !old||!isDeepStrictEqual(old.raw_rows,i.raw_rows)||!isDeepStrictEqual(old.columns,i.columns)||old.row_count!==i.row_count})
     if(!args.includes('--dry-run')&&changes.length){const result=await serviceClient.from('market_data_imports').upsert(changes.map(i=>({...i,updated_at:new Date().toISOString()})),{onConflict:'id'});if(result.error)throw new Error(result.error.message)}
     published+=changes.length;unchanged+=items.length-changes.length
     status={...status,state:'synced',...dailyBatchTotals(prepared),checksum,note:brief.note||'正式日榜已同步，按每榜Top50分析'}
   }catch(e){failed++;status={...status,state:'sync_failed',note:`本批次未发布：${e instanceof Error?e.message:'数据校验或写入失败'}`}}
   if(!args.includes('--dry-run')){
     const id=idFor(`${owner}:daily-sync:${runKey}`)
     const old=await serviceClient.from('market_data_imports').select('raw_rows').eq('id',id).eq('user_id',owner).maybeSingle()
     if(old.error)throw new Error(old.error.message)
     if(!isDeepStrictEqual(old.data?.raw_rows?.[0],status)){
       const result=await serviceClient.from('market_data_imports').upsert({id,user_id:owner,source_name:DAILY_SYNC_SOURCE,period_label:brief.dataDate||brief.requestedDate,file_name:`daily-sync-${id}.json`,row_count:1,columns:Object.keys(status),raw_rows:[status],created_at:brief.collectedAt,updated_at:new Date().toISOString()},{onConflict:'id'})
       if(result.error)throw new Error(result.error.message)
     }
   }
   console.log(JSON.stringify({run:runKey,state:status.state,boards:status.boards,records:status.records,samples:status.samples,...(status.state==='sync_failed'?{error:status.note}:{})}))
 }
 console.log(JSON.stringify({dryRun:args.includes('--dry-run'),published,unchanged,blocked,trial,failed}))
 if(failed)process.exitCode=1
}
main().catch(e=>{console.error(e instanceof Error?e.message:'日榜同步失败');process.exitCode=1})
