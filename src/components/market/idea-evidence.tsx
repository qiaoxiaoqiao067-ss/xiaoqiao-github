"use client"
import {useCallback,useEffect,useState} from 'react'
import {Button} from '@/components/ui/button'
import {useMarketEvidence} from '@/hooks/use-market-evidence'
import {IdeaReviewPanel} from './idea-reviews'
import {EvidenceDetails} from './evidence-details'
import {marketJson} from './report-library'
import type {IdeaEvidenceRecord} from '@/lib/market/idea-evidence'
export function IdeaEvidencePanel({ideaId,ideaTitle,initialEvidenceId=''}:{ideaId:string;ideaTitle:string;initialEvidenceId?:string}){
 const evidence=useMarketEvidence(),[records,setRecords]=useState<IdeaEvidenceRecord[]>([]),[more,setMore]=useState(false),[canEdit,setCanEdit]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const [selected,setSelected]=useState(initialEvidenceId),[reason,setReason]=useState(''),[purpose,setPurpose]=useState('背景参考'),[expanded,setExpanded]=useState('')
 const load=useCallback(async(offset=0)=>{try{const r=await marketJson(`/api/market-data/idea-evidence?ideaId=${ideaId}&offset=${offset}`);setRecords(old=>offset?[...old,...r.records.filter((n:IdeaEvidenceRecord)=>!old.some(o=>o.id===n.id))]:r.records);setMore(r.hasMore);setCanEdit(r.canEdit)}catch(e){setError((e as Error).message)}},[ideaId])
 useEffect(()=>{ // Fetch this topic's evidence only when its panel is opened.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void load()
 },[load])
 const source=evidence.records.find(r=>r.id===selected),existing=records.find(r=>r.payload.evidence.id===selected)
 async function save(){if(!source)return;setBusy(true);setError('');try{await marketJson('/api/market-data/idea-evidence',{ideaId,evidenceId:source.id,evidenceVersion:source.updated_at,reason,purpose,...(existing?{updated_at:existing.updated_at}:{})});setMessage('关联已保存，保留本次核验快照；不会改变选题状态或正文。');setReason('');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function unlink(r:IdeaEvidenceRecord){setBusy(true);setError('');try{await marketJson('/api/market-data/idea-evidence',{id:r.id,ideaId,updated_at:r.updated_at},'PATCH');setMessage('已解除关联，历史快照保留，可重新选择证据恢复。');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 function choose(id:string){setSelected(id);const r=records.find(r=>r.payload.evidence.id===id);setReason(r?.payload.reason||'');setPurpose(r?.payload.purpose||'背景参考')}
 return <section aria-label={`选题市场证据：${ideaTitle}`} className="space-y-3 rounded-xl border border-[#c8d9bc] bg-[#f8faef] p-3 text-sm"><IdeaReviewPanel ideaId={ideaId}/><h4 className="border-t pt-4 font-semibold">选题市场证据 · {ideaTitle}</h4><p className="text-xs text-muted-foreground">明确记录证据支持什么、有什么风险。关联不等于选题通过；来源改变时保留旧版本并提示复核。</p>
  {error&&<p role="alert" className="text-red-700">{error}</p>}{message&&<p role="status">{message}</p>}{evidence.error&&<p role="alert">{evidence.error}</p>}
  <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setError('');void load();void evidence.load()}}>刷新关联与证据</Button>{evidence.hasMore&&<Button size="sm" variant="outline" onClick={()=>void evidence.load(evidence.records.length)}>更多可选证据</Button>}</div>
  {canEdit&&<div className="space-y-2"><select aria-label="选择已核验证据" value={selected} disabled={busy} onChange={e=>choose(e.target.value)} className="w-full min-w-0 rounded-lg border bg-white p-2"><option value="">选择已核验的证据</option>{evidence.records.filter(r=>r.payload.status==='已核验').map(r=><option key={r.id} value={r.id}>{r.payload.title} · {r.payload.period||'通用'}</option>)}</select>{source?.payload.status==='已核验'&&<details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-xs">核对本次将关联的证据</summary><EvidenceDetails evidence={source}/></details>}<select aria-label="证据与选题的关系" value={purpose} disabled={busy} onChange={e=>setPurpose(e.target.value)} className="rounded-lg border bg-white p-2">{['支持选题','提示风险','背景参考'].map(p=><option key={p}>{p}</option>)}</select><textarea aria-label="选题关联依据" placeholder="具体支持哪一个冲突、受众或判断？哪些信息仍需核验？" value={reason} maxLength={1000} disabled={busy} onChange={e=>setReason(e.target.value)} className="min-h-20 w-full rounded-lg border bg-white p-2"/><Button size="sm" disabled={busy||!reason.trim()||source?.payload.status!=='已核验'} onClick={()=>void save()}>{existing?(existing.payload.active?'更新关联为当前核验版本':'恢复关联并使用当前核验版本'):'关联到此选题'}</Button></div>}
  {!records.length&&<p className="text-xs">暂无关联证据。</p>}{records.map(r=><article key={r.id} className="space-y-2 rounded-lg border bg-white p-3"><button type="button" className="w-full text-left break-words font-medium" aria-expanded={expanded===r.id} onClick={()=>setExpanded(expanded===r.id?'':r.id)}>{r.payload.evidence.payload.title} · {r.payload.active?'已关联':'已解除'}</button><p className="text-xs">{r.payload.purpose}：{r.payload.reason}</p>{r.sourceChanged&&<p className="text-xs text-amber-800">来源已变化（当前{r.sourceStatus}），这里保留关联时的证据；请重新核对后手动更新。</p>}{expanded===r.id&&<EvidenceDetails evidence={r.payload.evidence}/>}<div className="flex flex-wrap gap-2">{canEdit&&<><Button size="sm" variant="outline" disabled={busy} onClick={()=>choose(r.payload.evidence.id)}>编辑关联 / 更新版本</Button>{r.payload.active&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void unlink(r)}>解除关联</Button>}</>}</div></article>)}
  {more&&<Button size="sm" onClick={()=>void load(records.length)}>更多关联记录</Button>}
 </section>
}
export function EvidenceIdeaPicker({evidenceId}:{evidenceId:string}){
 const [ideas,setIdeas]=useState<{id:string;title:string}[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState('')
 useEffect(()=>{let active=true;void marketJson('/api/ideas').then(r=>{if(active)setIdeas(r.ideas||[])}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
 return <div className="space-y-3">{error&&<p role="alert">{error}</p>}<select aria-label="选择关联选题" value={selected} onChange={e=>setSelected(e.target.value)} className="w-full min-w-0 rounded-lg border bg-white p-2 text-sm"><option value="">选择已有选题</option>{ideas.map(i=><option key={i.id} value={i.id}>{i.title}</option>)}</select>{selected&&<IdeaEvidencePanel key={selected} ideaId={selected} ideaTitle={ideas.find(i=>i.id===selected)?.title||'选题'} initialEvidenceId={evidenceId}/>}</div>
}
