"use client"
import {useMemo,useState} from 'react'
import {DailyWorkHistory} from './daily-work-history'
import {Button} from '@/components/ui/button'
import type {MarketDataImport} from '@/hooks/use-market-data-imports'
import {useMonthlyHistory} from '@/hooks/use-monthly-history'
import {researchRequest,useResearchRecords} from '@/hooks/use-market-research-records'
import {boardLabel,candidateWorks,monthKey,monthRange,trackIdentity,workObservations} from '@/lib/market/monthly-history'
import {type BoardSample} from '@/lib/market/board-analysis'
import type {ResearchRecord,WatchRecord} from '@/lib/market/research-records'
function WatchDetail({record,imports,period,canEdit,onSaved}:{record:ResearchRecord;imports:MarketDataImport[];period:string;canEdit:boolean;onSaved:(r:ResearchRecord)=>void}){
  const w=record.payload as WatchRecord
  const [status,setStatus]=useState(w.status),[note,setNote]=useState(w.note),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const end=monthKey(period)?period:imports.map(i=>monthKey(i.period_label||'')).filter((m):m is string=>!!m).sort().at(-1)||''
  const months=useMemo(()=>monthRange(end,6),[end])
  const history=useMonthlyHistory(imports,months,w.board)
  const observations=workObservations(history.series,w.title,w.channel)
  async function save(){setBusy(true);setMessage('');try{const data=await researchRequest('PATCH',{id:record.id,updated_at:record.updated_at,status,note});onSaved(data.record);setMessage('追踪状态和笔记已保存')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  return <div className="space-y-3 border-t pt-3">
    <p className="break-all text-xs text-muted-foreground">开始追踪于{record.created_at.slice(0,10)} · 首次依据：{w.startedPeriod}，原榜第{w.initialRank}名 · {w.source.file_name}</p>
    <p className="text-xs text-amber-800">仅匹配同榜、原名和同剧场号，不自动合并译名或不同账号；同名仍需人工核验版本。名次是原榜名次，指标不跨榜相加。</p>
    <DailyWorkHistory imports={imports} period={period} work={w}/>
    <details><summary className="cursor-pointer text-sm font-medium text-[#315f4a]">月度记录（截至{end}）</summary>
    {history.loading?<p role="status">正在读取作品月度记录…</p>:history.error?<div role="alert">{history.error}<Button variant="outline" onClick={history.reload}>重试</Button></div>:<div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-xs"><thead><tr className="border-b"><th>月份</th><th>名次</th><th>指标</th><th>状态 / 标签</th></tr></thead><tbody>{observations.map(o=><tr key={o.month} className="border-b"><td className="py-3">{o.month}</td><td>{o.rank??'—'}</td><td>{o.value===null?'—':`${o.metric} ${o.value.toLocaleString()}`}</td><td className="max-w-[220px]">{o.state}{o.tags&&` · ${o.tags}`}</td></tr>)}</tbody></table></div>}
    </details>
    <label className="block text-xs">追踪状态<select aria-label="作品追踪状态" disabled={!canEdit||busy} value={status} onChange={e=>setStatus(e.target.value as WatchRecord['status'])} className="ml-2 rounded-lg border bg-white p-2">{['观察中','优先拆解','暂停观察','已归档'].map(s=><option key={s}>{s}</option>)}</select></label>
    <label className="block text-xs">跟进笔记<textarea aria-label="作品跟进笔记" disabled={!canEdit||busy} maxLength={10000} value={note} onChange={e=>setNote(e.target.value)} placeholder="记录看片结论、标签核验、下一步，不自动编造剧情。" className="mt-2 min-h-24 w-full rounded-xl border bg-white p-3 text-sm"/></label>
    {canEdit&&<Button size="sm" disabled={busy} onClick={()=>void save()}>{busy?'保存中…':'保存追踪'}</Button>}{message&&<p role="status" className="text-sm">{message}</p>}
  </div>
}
export function WorkTracking({imports,period,samples}:{imports:MarketDataImport[];period:string;samples:BoardSample[]}){
  const store=useResearchRecords('watch')
  const [query,setQuery]=useState(''),[picked,setPicked]=useState(''),[expanded,setExpanded]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[showArchived,setShowArchived]=useState(false)
  const candidates=samples.filter(s=>!s.issues.length).flatMap(candidateWorks)
  const options=candidates.filter(c=>`${c.title} ${c.channel} ${boardLabel(c.board)}`.toLowerCase().includes(query.toLowerCase()))
  const selected=options.find(c=>trackIdentity(c.board,c.title,c.channel)===picked)
  const records=store.records.filter(r=>r.payload.kind==='watch'&&(showArchived||r.payload.status!=='已归档'))
  async function add(){if(!selected)return;setBusy(true);setMessage('');try{
    const sample=samples.find(s=>s.key===selected.board)!
    const source=imports.filter(i=>i.id===sample.sourceId).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
    if(!source)throw new Error('找不到原榜，请刷新后重试')
    const result=await researchRequest('POST',{kind:'watch',sourceId:source.id,sourceVersion:source.updated_at,title:selected.title,channel:selected.channel})
    store.replace(result.record);setExpanded(result.record.id);setMessage(result.existing?'该作品已在追踪库中，已打开原记录':'已加入重点作品追踪')
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  return <section aria-label="重点作品追踪" className="space-y-4 rounded-2xl border border-[#c8d9bc] bg-[#f8faef] p-4 sm:p-5">
    <h2 className="text-lg font-semibold text-[#173f31]">重点作品追踪</h2><p className="text-xs leading-6 text-muted-foreground">从当前榜单中的AI仿真人样本选择作品；同名同剧场号重复记录暂不加入候选。追踪记录和笔记保存到工作台，切换月份后仍保留。</p>
    {store.canEdit&&<div className="space-y-2"><input aria-label="搜索追踪候选作品" className="w-full rounded-lg border bg-white p-2 text-sm" placeholder="搜索作品原名、榜单或剧场号" value={query} onChange={e=>{setQuery(e.target.value);setPicked('')}}/><div className="flex flex-wrap gap-2"><select aria-label="选择追踪作品" className="min-w-0 flex-1 rounded-lg border bg-white p-2 text-sm" value={selected?picked:''} onChange={e=>setPicked(e.target.value)}><option value="">选择作品（{options.length}条）</option>{options.map((c,i)=><option key={i} value={trackIdentity(c.board,c.title,c.channel)}>{c.title} · {boardLabel(c.board)}{c.channel?` · ${c.channel}`:''} · 第{c.rank}名</option>)}</select><Button size="sm" disabled={!selected||busy} onClick={()=>void add()}>{busy?'加入中…':'加入重点追踪'}</Button></div></div>}
    {message&&<p role="status" className="text-sm">{message}</p>}{store.error&&<p role="alert">{store.error}<Button variant="outline" onClick={()=>void store.load()}>重试追踪库</Button></p>}
    <label className="flex gap-2 text-xs"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>显示已归档作品</label>
    {store.loading&&!store.records.length?<p role="status">正在读取追踪库…</p>:!records.length?<p className="text-sm text-muted-foreground">暂无重点追踪作品。选择需要持续观察的作品后，展开查看月度轨迹和笔记。</p>:records.map(r=>{const w=r.payload as WatchRecord;return <article key={r.id} className="rounded-xl border bg-white p-4"><button type="button" aria-expanded={expanded===r.id} className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={()=>setExpanded(expanded===r.id?'':r.id)}><span className="min-w-0 flex-1 break-words font-medium">{w.title}<small className="mt-1 block break-all text-xs font-normal text-muted-foreground">{boardLabel(w.board)}{w.channel?` · ${w.channel}`:''}</small></span><span className="rounded-full bg-[#dce9c9] px-3 py-1 text-xs">{w.status}</span></button>{expanded===r.id&&<WatchDetail key={r.id} record={r} imports={imports} period={period} canEdit={store.canEdit} onSaved={store.replace}/>}</article>})}
    {store.hasMore&&<Button disabled={store.loading} variant="outline" onClick={()=>void store.load(store.records.length)}>加载更多追踪</Button>}
  </section>
}
