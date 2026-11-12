"use client"
import {useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {MarketResearchPanel} from './market-research'
import {researchRequest,useResearchRecords} from '@/hooks/use-market-research-records'
import type {MarketDataImport} from '@/hooks/use-market-data-imports'
import {isBoardImport} from '@/lib/market/import-scope'
import {monthKey} from '@/lib/market/monthly-history'
import type {ArchiveRecord} from '@/lib/market/research-records'
export function ResearchArchive({imports,period,comparison}:{imports:MarketDataImport[];period:string;comparison:string}){
  const store=useResearchRecords('archive')
  const [title,setTitle]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[expanded,setExpanded]=useState(''),[filter,setFilter]=useState('')
  const requestId=useRef<{id:string;signature:string}|null>(null)
  async function save(){setBusy(true);setMessage('');try{
    const sources=imports.filter(i=>[period,comparison].includes(i.period_label||'')&&(isBoardImport(i)||i.source_name.startsWith('市场版本:'))).map(i=>({id:i.id,updated_at:i.updated_at}))
    const content={period,comparison,title:title.trim()||`${period}市场研判${comparison?`（对比${comparison}）`:''}`,note,sources}
    const signature=JSON.stringify(content)
    if(requestId.current?.signature!==signature)requestId.current={id:crypto.randomUUID(),signature}
    const result=await researchRequest('POST',{kind:'archive',requestId:requestId.current.id,...content})
    store.replace(result.record);setExpanded(result.record.id);setMessage('研判与证据已存档。以后重新保存会形成独立版本，不覆盖这一份。');requestId.current=null
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  async function copy(a:ArchiveRecord){try{await navigator.clipboard.writeText([a.title,`${a.period} / 对比 ${a.comparison||'无'}\n规则版本：${a.rulesVersion}`,a.note,...a.research.findings.map(f=>`${f.title}\n依据：${f.facts.join('\n')}\n判断：${f.judgment}\n开发：${f.development}\n投放：${f.advertising}\n复核：${f.validation}\n${f.cautions.join('\n')}\n对标作品：\n${f.cases.map(c=>`${c.title}｜${c.channel}｜${c.period}｜${c.source}｜原榜第${c.rank}名｜${c.metric} ${c.value??'未提供'}｜${c.regions}`).join('\n')}`),a.research.method,...a.research.limitations,'来源版本：',...a.sources.map(s=>`${s.file_name}｜${s.period_label}｜${s.updated_at}｜${s.id}`)].join('\n\n'));setMessage('已复制存档正文与来源版本')}catch{setMessage('浏览器未允许复制，请展开存档后手动选择正文。')}}
  const records=store.records.filter(r=>r.payload.kind==='archive'&&`${r.payload.title} ${r.payload.period} ${r.payload.comparison}`.includes(filter))
  return <section aria-label="市场研判存档" className="space-y-4 rounded-2xl border border-[#c8d9bc] bg-[#f8faef] p-4 sm:p-5">
    <h2 className="text-lg font-semibold text-[#173f31]">市场研判存档</h2><p className="text-xs leading-6 text-muted-foreground">保存当前月度研判、对比期、来源版本和人工观察。存档是当时的判断，不随新榜单刷新；新增记录保留旧版，不自动标为已验证结论。</p>
    {store.canEdit&&<div className="space-y-3"><label className="block text-xs">存档标题<input aria-label="研判存档标题" maxLength={200} value={title} onChange={e=>{setTitle(e.target.value);requestId.current=null}} placeholder={`${period}市场研判`} disabled={busy} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm"/></label><label className="block text-xs">人工观察与后续验证（可选）<textarea aria-label="研判人工观察" maxLength={10000} value={note} disabled={busy} onChange={e=>{setNote(e.target.value);requestId.current=null}} placeholder="补充已核验内容、需要推翻或继续验证的判断。" className="mt-1 min-h-24 w-full rounded-lg border bg-white p-3 text-sm"/></label><Button size="sm" disabled={busy||!monthKey(period)} onClick={()=>void save()}>{busy?'核对来源并保存…':'保存当前月度研判'}</Button>{!monthKey(period)&&<p className="text-xs">请切换月榜后保存月度研判。</p>}</div>}
    {message&&<p role="status" className="text-sm">{message}</p>}{store.error&&<p role="alert">{store.error}<Button variant="outline" onClick={()=>void store.load()}>重试存档库</Button></p>}
    <input aria-label="搜索研判存档" placeholder="按标题或月份搜索已加载存档" value={filter} onChange={e=>setFilter(e.target.value)} className="w-full rounded-lg border bg-white p-2 text-sm"/>
    {store.loading&&!store.records.length?<p role="status">正在读取研判存档…</p>:!records.length?<p className="text-sm text-muted-foreground">暂无匹配存档。</p>:records.map(r=>{const a=r.payload as ArchiveRecord;return <article key={r.id} className="min-w-0 rounded-xl border bg-white p-4"><button type="button" aria-expanded={expanded===r.id} className="w-full text-left" onClick={()=>setExpanded(expanded===r.id?'':r.id)}><span className="block break-words font-medium">{a.title}</span><span className="mt-1 block text-xs text-muted-foreground">{a.period} · 对比{a.comparison||'无'} · 存档于{new Date(r.created_at).toLocaleString('zh-CN')} · 编号{r.id.slice(0,8)}</span></button>{expanded===r.id&&<div className="mt-4 space-y-4 border-t pt-4"><Button variant="outline" size="sm" onClick={()=>void copy(a)}>复制存档正文</Button>{a.note&&<p className="whitespace-pre-wrap break-words text-sm">人工观察：{a.note}</p>}<MarketResearchPanel research={a.research} frozen/><details className="text-xs"><summary className="cursor-pointer">查看冻结来源与规则版本</summary><p className="my-2">{a.rulesVersion}</p>{a.sources.map(s=><p key={s.id} className="break-all py-1">{s.file_name} · {s.period_label} · 版本时间{s.updated_at} · {s.id}</p>)}</details></div>}</article>})}
    {store.hasMore&&<Button disabled={store.loading} variant="outline" onClick={()=>void store.load(store.records.length)}>加载更多存档</Button>}
  </section>
}
