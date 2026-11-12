"use client"
import {useCallback,useEffect,useState} from 'react'
import {Button} from '@/components/ui/button'
import {marketJson} from './report-library'
import {MonthlyReviewDetails} from './monthly-review'
import {VALIDATION_OUTCOMES,VALIDATION_STATUSES,validationInput,validationProgress,type IdeaReviewRecord,type ValidationAction} from '@/lib/market/idea-review'
import type {MonthlyReviewRecord} from '@/lib/market/monthly-review'

function useIdeaReviews(query:string){
 const [records,setRecords]=useState<IdeaReviewRecord[]>([]),[canEdit,setCanEdit]=useState(false),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const load=useCallback(async(offset=0)=>{setLoading(true);setError('');try{const r=await marketJson(`/api/market-data/idea-reviews?${query}&offset=${offset}`);setRecords(old=>offset?[...old,...r.records.filter((n:IdeaReviewRecord)=>!old.some(o=>o.id===n.id))]:r.records);setCanEdit(r.canEdit);setMore(r.hasMore)}catch(e){setError((e as Error).message)}finally{setLoading(false)}},[query])
 useEffect(()=>{
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void load()
 },[load])
 return {records,canEdit,more,loading,error,load,replace:(r:IdeaReviewRecord)=>setRecords(old=>old.map(o=>o.id===r.id?{...r,sourceChanged:o.sourceChanged,currentIdeaTitle:o.currentIdeaTitle}:o))}
}
function ValidationEditor({record,action,onSaved,onCancel}:{record:IdeaReviewRecord;action:ValidationAction;onSaved:(r:IdeaReviewRecord)=>void;onCancel:()=>void}){
 const [version]=useState(record.updated_at),[draft,setDraft]=useState(action),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function save(){const parsed=validationInput.safeParse(draft);if(!parsed.success){setError(parsed.error.issues[0]?.message||'请检查验证内容');return}setBusy(true);setError('');try{const r=await marketJson('/api/market-data/idea-reviews',{operation:'validation',id:record.id,ideaId:record.payload.ideaId,updated_at:version,action:parsed.data},'PATCH');onSaved(r.record)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="space-y-3 rounded-lg border bg-[#f1f7e9] p-3" aria-label={`编辑验证：${action.title}`}>
  <label className="block text-xs">验证事项<input aria-label="验证事项" value={draft.title} maxLength={100} disabled={busy} onChange={e=>setDraft({...draft,title:e.target.value})} className="mt-1 w-full rounded-lg border bg-white p-2"/></label>
  <label className="block text-xs">具体动作与通过条件<textarea aria-label="验证动作" value={draft.description} maxLength={4000} disabled={busy} onChange={e=>setDraft({...draft,description:e.target.value})} className="mt-1 min-h-28 w-full rounded-lg border bg-white p-2 leading-6"/></label>
  <div className="flex flex-wrap gap-3"><label className="text-xs">验证状态<select aria-label="验证状态" value={draft.status} disabled={busy} onChange={e=>setDraft({...draft,status:e.target.value as ValidationAction['status'],...(e.target.value!=='已完成'?{outcome:'未评估',outcomeNote:''}:{})})} className="mt-1 block rounded-lg border bg-white p-2">{VALIDATION_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label><label className="text-xs">预计完成日期（可选）<input type="date" aria-label="预计完成日期" value={draft.dueDate} disabled={busy} onChange={e=>setDraft({...draft,dueDate:e.target.value})} className="mt-1 block max-w-full rounded-lg border bg-white p-2"/></label></div>
  <label className="block text-xs">实际结果或记录位置<textarea aria-label="验证结果" placeholder="如实填写支持、反例或信息不足；已完成时必填。" value={draft.result} maxLength={4000} disabled={busy} onChange={e=>setDraft({...draft,result:e.target.value})} className="mt-1 min-h-20 w-full rounded-lg border bg-white p-2 leading-6"/></label>
  {draft.status==='已完成'&&<div className="space-y-2"><label className="block text-xs">建议效果<select aria-label="建议效果" value={draft.outcome||'未评估'} disabled={busy} onChange={e=>setDraft({...draft,outcome:e.target.value as ValidationAction['outcome']})} className="ml-2 rounded-lg border bg-white p-2">{VALIDATION_OUTCOMES.map(v=><option key={v}>{v}</option>)}</select></label><label className="block text-xs">效果判断依据与后续调整<textarea aria-label="效果判断依据" value={draft.outcomeNote||''} maxLength={2000} disabled={busy} onChange={e=>setDraft({...draft,outcomeNote:e.target.value})} placeholder="具体结果支持了哪条建议？适用范围是什么？下次保留或调整什么？" className="mt-1 min-h-20 w-full rounded-lg border bg-white p-2"/></label><p className="text-xs">完成不等于有效。评估后的结果可供后续月份研判选择，未评估结果不会自动成为支持依据。</p></div>}
  {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}<div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>void save()}>{busy?'正在保存…':'保存验证进度'}</Button><Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>取消编辑</Button></div>
 </div>
}
function IdeaReviewCard({record,canEdit,onSaved}:{record:IdeaReviewRecord;canEdit:boolean;onSaved:(r:IdeaReviewRecord)=>void}){
 const [editing,setEditing]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),p=record.payload,progress=validationProgress(p.actions)
 async function toggle(){setBusy(true);setError('');try{const r=await marketJson('/api/market-data/idea-reviews',{operation:'active',id:record.id,ideaId:p.ideaId,updated_at:record.updated_at,active:!p.active},'PATCH');onSaved(r.record);setMessage(p.active?'已解除关联，依据和进度保留。':'已恢复关联及原验证进度。')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <article className="min-w-0 space-y-3 rounded-xl border border-[#b6ce92] bg-white p-4 text-xs leading-6" aria-label={`研判验证：${p.ideaTitle}`}>
  <h5 className="break-words font-semibold text-[#173f31]">{record.currentIdeaTitle||p.ideaTitle}</h5><p>{p.review.payload.period} 对比 {p.review.payload.comparison} · {p.review.payload.genre} · {p.active?'已关联':'已解除'}</p><p className="whitespace-pre-wrap break-words"><strong>用于此选题：</strong>{p.reason}</p>
  <div className="flex flex-wrap justify-between gap-2 font-semibold text-[#19523f]"><span>验证完成 {progress.done}/{progress.total} · {progress.percent}%</span><span>验证中 {progress.inProgress} 项</span></div><div role="progressbar" aria-label="验证完成比例" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-[#e5edda]"><div className="h-full bg-[#215e46]" style={{width:`${progress.percent}%`}}/></div>
  <p className="text-muted-foreground">完成指验证已有结果，不代表选题通过；选题决策状态由你另行确认。</p>
  {record.sourceChanged&&<p className="text-amber-800">研判或来源已更新、失效：以下保留关联时的版本，请回市场看板复核；已有验证进度不会被重置。</p>}
  <details><summary className="cursor-pointer font-semibold text-[#315f4a]">查看关联时的月度结论与原文出处</summary><div className="mt-2"><MonthlyReviewDetails record={p.review}/></div></details>
  <div className="divide-y">{p.actions.map(a=><div key={a.id} className="space-y-2 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{a.title}</strong><span className="rounded-full bg-[#e7efd9] px-3 text-[#24513e]">{a.status}{a.dueDate?` · ${a.dueDate}`:''}</span></div>{editing===a.id?<ValidationEditor record={record} action={a} onSaved={r=>{onSaved(r);setEditing('');setMessage('验证进度已保存。')}} onCancel={()=>setEditing('')}/>:<><p className="whitespace-pre-wrap break-words">{a.description}</p>{a.result&&<p className="whitespace-pre-wrap break-words rounded-lg bg-[#f5f8ed] p-2"><strong>实际结果：</strong>{a.result}</p>}{a.status==='已完成'&&<p className="whitespace-pre-wrap break-words"><strong>建议效果：{a.outcome||'未评估'}</strong>{a.outcomeNote&&` · ${a.outcomeNote}`}</p>}{a.completedAt&&<p className="text-muted-foreground">完成于 {new Date(a.completedAt).toLocaleString('zh-CN')}</p>}{canEdit&&p.active&&<Button size="sm" variant="outline" disabled={!!editing||busy} onClick={()=>{setEditing(a.id);setMessage('')}}>更新{a.title}</Button>}</>}</div>)}</div>
  {error&&<p role="alert" className="text-red-700">{error}</p>}{message&&<p role="status">{message}</p>}{canEdit&&<Button size="sm" variant="ghost" disabled={busy||!!editing} onClick={()=>void toggle()}>{p.active?'解除本条关联':'恢复原关联与进度'}</Button>}
 </article>
}
export function IdeaReviewPanel({ideaId}:{ideaId:string}){
 const store=useIdeaReviews(`ideaId=${ideaId}`)
 return <section aria-label="月度研判与后续验证" className="space-y-3"><h4 className="font-semibold">月度研判与后续验证</h4><p className="text-xs">查看已关联的具体建议、原始依据和实际验证结果。新关联可从市场看板的月度研判进入。</p>{store.error&&<p role="alert" className="text-red-700">{store.error}</p>}<Button size="sm" variant="outline" disabled={store.loading} onClick={()=>void store.load()}>刷新验证进度</Button>{store.loading&&<p role="status">读取验证进度…</p>}{!store.loading&&!store.error&&!store.records.length&&<p className="text-xs">尚未关联月度研判。</p>}{store.records.map(r=><IdeaReviewCard key={r.id} record={r} canEdit={store.canEdit} onSaved={store.replace}/>)}{store.more&&<Button size="sm" disabled={store.loading} onClick={()=>void store.load(store.records.length)}>更多研判关联</Button>}</section>
}
export function ReviewIdeaControl({review}:{review:MonthlyReviewRecord}){
 const [open,setOpen]=useState(false)
 return <div className="mt-3"><Button size="sm" variant="outline" onClick={()=>setOpen(!open)}>{open?'收起选题关联与验证':'关联已有选题 / 查看验证进度'}</Button>{open&&<ReviewIdeaPicker review={review}/>}</div>
}
function ReviewIdeaPicker({review}:{review:MonthlyReviewRecord}){
 const store=useIdeaReviews(`reviewId=${review.id}`),[ideas,setIdeas]=useState<{id:string;title:string}[]>([]),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const loadIdeas=useCallback(async()=>{setError('');try{const r=await marketJson('/api/ideas');setIdeas(r.ideas||[])}catch(e){setError((e as Error).message)}},[])
 useEffect(()=>{
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void loadIdeas()
 },[loadIdeas])
 async function save(){setBusy(true);setError('');try{const r=await marketJson('/api/market-data/idea-reviews',{ideaId:selected,reviewId:review.id,reviewVersion:review.updated_at,reason});setMessage(r.existing?'此研判已关联该选题，保留原有依据和验证进度，未重复创建。':'已关联已有选题，三项建议已进入待验证。未新建选题。');await store.load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const filtered=ideas.filter(i=>i.title.toLowerCase().includes(search.toLowerCase())||i.id===selected)
 return <section aria-label="关联已有选题与验证" className="mt-3 min-w-0 space-y-3 rounded-xl border bg-[#f1f7e9] p-4 text-xs leading-6"><p>把本条月度建议用于已有选题，保留本次研判与出处。重复关联保留原进度，不会新建选题或改变选题决策。</p>{store.error&&<p role="alert" className="text-red-700">{store.error}</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}{message&&<p role="status">{message}</p>}<Button size="sm" variant="outline" disabled={busy||store.loading} onClick={()=>{void store.load();void loadIdeas()}}>刷新已有选题与验证</Button>
  {store.canEdit&&<><input aria-label="搜索已有选题" placeholder="搜索已有选题名称" value={search} onChange={e=>setSearch(e.target.value)} className="w-full rounded-lg border bg-white p-2"/><select aria-label="月度研判关联选题" disabled={busy} value={selected} onChange={e=>setSelected(e.target.value)} className="w-full min-w-0 max-w-full rounded-lg border bg-white p-2"><option value="">选择已有选题</option>{filtered.map(i=><option key={i.id} value={i.id}>{i.title}</option>)}</select><textarea aria-label="研判用于此选题的依据" placeholder="说明本条建议适用于哪个故事方向，接下来要验证什么。" maxLength={2000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} className="min-h-20 w-full rounded-lg border bg-white p-2"/><Button size="sm" disabled={busy||!selected||!reason.trim()||review.sourceChanged} onClick={()=>void save()}>{busy?'正在关联…':'关联所选已有选题'}</Button></>}
  {store.loading&&<p role="status">读取验证进度…</p>}{!store.loading&&!store.error&&!store.records.length&&<p>本条研判尚未关联选题。</p>}{store.records.map(r=><IdeaReviewCard key={r.id} record={r} canEdit={store.canEdit} onSaved={store.replace}/>)}{store.more&&<Button size="sm" disabled={store.loading} onClick={()=>void store.load(store.records.length)}>更多关联选题</Button>}
 </section>
}
