"use client"
import {useCallback,useEffect,useState} from 'react'
import {Button} from '@/components/ui/button'
import {marketJson} from './report-library'
import {monthKey} from '@/lib/market/monthly-history'
import {feedbackEligible,feedbackKey,feedbackSummary,type ValidationFeedback} from '@/lib/market/validation-feedback'
export function useValidationFeedback(period:string,genre=''){
 const [items,setItems]=useState<ValidationFeedback[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const load=useCallback(async()=>{setLoading(true);setError('');try{const r=await marketJson(`/api/market-data/validation-feedback?period=${encodeURIComponent(period)}&genre=${encodeURIComponent(genre)}`);setItems(r.candidates)}catch(e){setError((e as Error).message);setItems([])}finally{setLoading(false)}},[period,genre])
 useEffect(()=>{
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void load()
 },[load])
 return {items,loading,error,load}
}
export function FeedbackDetails({item}:{item:ValidationFeedback}){const f=item;return <div className="space-y-2 text-xs leading-6"><p className="font-semibold">{f.ideaTitle} · {f.sourcePeriod} · {f.action.title}</p><p><strong>原建议：</strong>{f.action.description}</p><p className="whitespace-pre-wrap break-words"><strong>实际结果：</strong>{f.action.result||'尚无实际结果'}</p><p><strong>建议效果：</strong>{f.action.status==='已完成'?f.action.outcome||'未评估':'尚未完成验证'}{f.action.outcomeNote?` · ${f.action.outcomeNote}`:''}</p><p>验证状态：{f.action.status}{f.action.completedAt?` · 完成于 ${new Date(f.action.completedAt).toLocaleString('zh-CN')}`:''}</p><details><summary className="cursor-pointer">原月度结论与关联依据</summary><p>{f.originalConclusion}</p><p>{f.reason}</p><p className="break-all text-muted-foreground">验证记录 {f.linkId} / {f.actionId} · 版本 {f.version}</p></details></div>}
function FeedbackMonth({period}:{period:string}){
 const store=useValidationFeedback(period),[filter,setFilter]=useState('全部'),summary=feedbackSummary(store.items,period)
 const items=store.items.filter(f=>filter==='全部'||(feedbackEligible(f,period)?f.action.outcome===filter:filter==='待完成或待评估'))
 return <div className="space-y-3"><div className="flex flex-wrap gap-2 text-xs">{[['全部',summary.total],['支持原建议',summary.support],['需要调整',summary.adjust],['证据不足',summary.insufficient],['待完成或待评估',summary.pending]].map(([label,count])=><Button key={label} size="sm" variant={filter===label?'default':'outline'} onClick={()=>setFilter(String(label))}>{label} {count}</Button>)}</div><p className="text-xs leading-6">按验证项计数，同一选题可能有多项；不计算全市场成功率。只有早于本月的建议、截至本月底已完成且明确评估的结果可供采用。未完成、未评估及晚于本月完成的记录不作为有效依据。</p><Button size="sm" variant="outline" disabled={store.loading} onClick={()=>void store.load()}>刷新此前建议验证结果</Button>{store.loading&&<p role="status">读取验证结果…</p>}{store.error&&<p role="alert" className="text-red-700">{store.error}</p>}{!store.loading&&!store.error&&!items.length&&<p className="text-xs">当前范围暂无记录。没有已完成结果时，不判断此前建议是否有效。</p>}{items.map(f=><details key={feedbackKey(f)} className="rounded-xl border bg-white p-3"><summary className="cursor-pointer break-words text-sm font-medium">{f.sourcePeriod} · {f.ideaTitle} · {f.action.title} · {feedbackEligible(f,period)?f.action.outcome:'待完成或待评估'}</summary><div className="mt-3"><FeedbackDetails item={f}/></div></details>)}</div>
}
export function ValidationFeedbackPanel({period}:{period:string}){
 const [selected,setSelected]=useState(monthKey(period)||new Date().toISOString().slice(0,7))
 const next=()=>{const [y,m]=selected.split('-').map(Number),d=new Date(Date.UTC(y,m,1));setSelected(d.toISOString().slice(0,7))}
 return <section aria-label="此前建议效果复盘" className="space-y-4 rounded-2xl border border-[#b6ce92] bg-[#f7faef] p-5"><h2 className="text-xl font-semibold text-[#173f31]">此前建议效果复盘</h2><p className="text-xs leading-6">对照原建议、实际结果和调整理由。此处选择反馈月份，不改变上方榜单统计期；新月份尚未导入榜单时也可提前查看，形成当月研判须在对应月份编辑并确认采用。</p><div className="flex flex-wrap items-center gap-3"><label className="text-xs">反馈到月份 <input type="month" aria-label="验证反馈月份" value={selected} onChange={e=>{if(monthKey(e.target.value))setSelected(e.target.value)}} className="max-w-full rounded-lg border bg-white p-2"/></label><Button size="sm" variant="outline" onClick={next}>查看下月复盘</Button></div><FeedbackMonth key={selected} period={selected}/></section>
}
