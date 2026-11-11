/** Publish existing local ADX reports only. Does not collect new data or invoke AI. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {loadEnvConfig} from '@next/env'
import {DAILY_BRIEF_SOURCE,makeDailyBrief} from '../src/lib/adx/daily-brief'

async function main(){
  loadEnvConfig(process.cwd())
  const args=process.argv.slice(2), value=(name:string)=>args[args.indexOf(name)+1]
  const owner=args.includes('--owner')?value('--owner'):''
  const root=args.includes('--root')?path.resolve(value('--root')):''
  if(!/^[0-9a-f-]{36}$/.test(owner)||!root)throw new Error('请提供 --owner 工作台所有者UUID --root ADX日报目录')
  const {serviceClient}=await import('../src/lib/supabase/service')
  const {data:workspace,error:workspaceError}=await serviceClient.from('workspaces').select('id').eq('owner_id',owner).maybeSingle()
  if(workspaceError||!workspace)throw new Error('未找到指定所有者的工作台，不发布日报')
  const files:string[]=[]
  async function scan(dir:string,depth:number){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      if(entry.isFile()&&entry.name==='采集清单.json')files.push(path.join(dir,entry.name))
      else if(entry.isDirectory()&&depth<2)await scan(path.join(dir,entry.name),depth+1)
    }
  }
  await scan(root,0)
  let published=0, unchanged=0, skipped=0
  for(const file of files.sort()){
    const manifest=JSON.parse(await fs.readFile(file,'utf8')) as Record<string,unknown>
    const dir=path.dirname(file),runKey=path.relative(root,dir)
    let report:string|null=null
    if(typeof manifest.data_date==='string'){
      const reportPath=path.join(dir,`日报_${manifest.data_date}.md`)
      try{report=await fs.readFile(reportPath,'utf8')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
    }
    let brief
    try{brief=makeDailyBrief(manifest,report,runKey)}catch(e){console.warn(`${runKey}：${e instanceof Error?e.message:'无法识别清单'}，已跳过`);skipped++;continue}
    const filename=`adx-daily-${createHash('sha256').update(runKey).digest('hex').slice(0,24)}.json`
    const {data:existing,error}=await serviceClient.from('market_data_imports').select('id,raw_rows').eq('user_id',owner).eq('source_name',DAILY_BRIEF_SOURCE).eq('file_name',filename).maybeSingle()
    if(error)throw new Error(error.message)
    if(existing&&isDeepStrictEqual(existing.raw_rows?.[0],brief)){unchanged++;continue}
    if(args.includes('--dry-run')){console.log(`${runKey}：${brief.status}，${brief.report?'有完整日报':'仅采集状态'}`);continue}
    const payload={user_id:owner,source_name:DAILY_BRIEF_SOURCE,period_label:brief.dataDate||brief.requestedDate,file_name:filename,row_count:1,columns:Object.keys(brief),raw_rows:[brief],updated_at:new Date().toISOString()}
    const write=existing?await serviceClient.from('market_data_imports').update(payload).eq('id',existing.id).eq('user_id',owner):await serviceClient.from('market_data_imports').insert({...payload,created_at:brief.collectedAt})
    if(write.error)throw new Error(write.error.message)
    published++;console.log(`${runKey}：已同步${brief.report?'日报与采集状态':'采集状态'}`)
  }
  console.log(JSON.stringify({published,unchanged,skipped,manifests:files.length}))
  if(skipped)process.exitCode=1
}
main().catch(e=>{console.error(e instanceof Error?e.message:'日报同步失败');process.exitCode=1})
