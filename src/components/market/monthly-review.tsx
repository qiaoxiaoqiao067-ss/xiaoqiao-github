"use client"
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {useMarketEvidence} from '@/hooks/use-market-evidence'
import {evidenceApplies} from '@/lib/market/evidence'
import {reviewDraft,findingFingerprint,reviewApplies,type MonthlyReviewRecord,type ReviewRef,type ReviewText} from '@/lib/market/monthly-review'
import type {ResearchFinding} from '@/lib/market/research'
import {EvidenceDetails} from './evidence-details'
import {marketJson} from './report-library'
export function MonthlyReviewDetails({record,evidenceOnly=false}:{record:MonthlyReviewRecord;evidenceOnly?:boolean}){
 const p=record.payload
 return <div className="space-y-3 rounded-xl border border-[#9ebc84] bg-white p-4 text-xs leading-6" aria-label={`报告联合研判：${p.genre}`}>
  <p className="font-semibold text-[#173f31]">报告联合研判 · {p.period} · 已确认</p>
  {!evidenceOnly&&<dl className="space-y-2">{[['本月结论',p.conclusion],['选题要求',p.topicBrief],['投放验证',p.testPlan],['调整条件',p.revisit]].map(([label,value])=><div key={label}><dt className="font-semibold text-[#315f4a]">{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>}
  <p className="text-muted-foreground">确认于{new Date(p.confirmedAt).toLocaleString('zh-CN')}；来源核验不等于商业判断已验证。</p>
  <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">查看本条依据与出处（{p.evidence.length}）</summary><div className="mt-3 space-y-4">{p.evidence.map(({evidence,relation,independence},i)=><article key={evidence.id} className="space-y-2 border-t pt-3"><h4 className="font-semibold">[报告{i+1}] {evidence.payload.title}</h4><p>{relation} · {independence}{independence==='同源复述'?'；不作为独立交叉验证':independence==='尚未确认'?'；不得据此提高可信度':''}</p><EvidenceDetails evidence={evidence}/></article>)}</div></details>
 </div>
}
export function MonthlyReviewControl({finding,period,comparison,record,onSaved}:{finding:ResearchFinding;period:string;comparison:string;record?:MonthlyReviewRecord;onSaved:(r:MonthlyReviewRecord)=>void}){
 const [open,setOpen]=useState(false)
 return <div className="mt-3 space-y-3">{record&&!reviewApplies(record,finding,period,comparison)&&<p className="text-xs text-amber-800">联合研判的榜单或证据已变化，暂不应用旧判断。可打开旧稿核对后重新确认。</p>}<Button size="sm" variant="outline" onClick={()=>setOpen(!open)}>{open?'收起联合研判编辑':record?'编辑报告联合研判':'结合报告完善本条研判'}</Button>{open&&<ReviewEditor key={`${period}:${comparison}:${finding.id}`} finding={finding} period={period} comparison={comparison} record={record} onSaved={r=>{onSaved(r);setOpen(false)}}/>}</div>
}
function ReviewEditor({finding,period,comparison,record,onSaved}:{finding:ResearchFinding;period:string;comparison:string;record?:MonthlyReviewRecord;onSaved:(r:MonthlyReviewRecord)=>void}){
 const [editingVersion]=useState(record?.updated_at),[editingFingerprint]=useState(findingFingerprint(finding))
 const store=useMarketEvidence(),[refs,setRefs]=useState<ReviewRef[]>(record?.payload.evidence.map(e=>({id:e.evidence.id,updated_at:e.evidence.updated_at,relation:e.relation,independence:e.independence}))||[])
 const [draft,setDraft]=useState<ReviewText>(record?{conclusion:record.payload.conclusion,topicBrief:record.payload.topicBrief,testPlan:record.payload.testPlan,revisit:record.payload.revisit}:{conclusion:'',topicBrief:'',testPlan:'',revisit:''}),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[proposed,setProposed]=useState<ReviewText|null>(null)
 const available=store.records.filter(r=>r.payload.status==='已核验'&&evidenceApplies(r.payload,period))
 function propose(){const selected=refs.map(ref=>({evidence:available.find(e=>e.id===ref.id&&e.updated_at===ref.updated_at)!,relation:ref.relation,independence:ref.independence}));if(!selected.length||selected.some(e=>!e.evidence)){setError('请重新选择本期有效的已核验证据');return}setError('');setProposed(reviewDraft(finding,selected))}
 async function save(){setBusy(true);setError('');try{const res=await marketJson('/api/market-data/monthly-reviews',{...draft,period,comparison,findingId:finding.id,fingerprint:editingFingerprint,evidence:refs,confirmed,updated_at:editingVersion});onSaved(res.record)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="space-y-3 rounded-xl border bg-[#f1f7e9] p-4" aria-label={`联合研判编辑：${finding.genre}`}>
 <p className="text-xs leading-6">选择适用本条的已核验证据，说明与判断的关系。整理草稿只组合已填事实、判断和动作，不代表AI已阅读全文；确认后才进入本月结论、选题正文和新存档。</p>
 {store.loading&&<p role="status" className="text-xs">正在读取证据…</p>}{store.error&&<p role="alert">{store.error}</p>}
 <Button size="sm" variant="outline" disabled={busy||store.loading} onClick={()=>void store.load()}>刷新可选报告证据</Button>
 {available.map(r=>{const selected=refs.find(e=>e.id===r.id);return <div key={r.id} className="space-y-2 rounded-lg border bg-white p-3 text-xs"><label className="flex items-start gap-2"><input type="checkbox" aria-label={`联合研判证据：${r.payload.title}`} checked={!!selected} disabled={busy||!selected&&refs.length>=10} onChange={e=>{setRefs(old=>e.target.checked?[...old,{id:r.id,updated_at:r.updated_at,relation:r.payload.stance==='提示反例'?'提示反例':'背景参考',independence:'尚未确认'}]:old.filter(v=>v.id!==r.id));setConfirmed(false)}}/>{r.payload.title} · {r.payload.period||'通用'}{`${r.payload.title} ${r.payload.fact}`.includes(finding.genre)?' · 题材相关，仍需核对适用范围':''}</label>{selected&&<><div className="flex flex-wrap gap-2"><select aria-label={`证据关系：${r.payload.title}`} value={selected.relation} disabled={busy} onChange={e=>{setRefs(old=>old.map(v=>v.id===r.id?{...v,updated_at:r.updated_at,relation:e.target.value as ReviewRef['relation']}:v));setConfirmed(false)}} className="max-w-full rounded-lg border p-2">{['支持判断','提示反例','背景参考'].map(v=><option key={v}>{v}</option>)}</select><select aria-label={`来源独立性：${r.payload.title}`} value={selected.independence} disabled={busy} onChange={e=>{setRefs(old=>old.map(v=>v.id===r.id?{...v,updated_at:r.updated_at,independence:e.target.value as ReviewRef['independence']}:v));setConfirmed(false)}} className="max-w-full rounded-lg border p-2">{['同源复述','独立来源','尚未确认'].map(v=><option key={v}>{v}</option>)}</select></div>{selected.updated_at!==r.updated_at&&<p className="text-amber-800">来源已更新，请重新勾选或调整关系以采用新版本。</p>}<details><summary className="cursor-pointer">核对原文与范围</summary><EvidenceDetails evidence={r}/></details></>}</div>})}
 {refs.some(ref=>!available.some(e=>e.id===ref.id))&&<p className="text-xs text-amber-800">旧稿包含已归档、失效或尚未加载的证据。请加载更多，或清空后重新选择。</p>}
 {refs.length>0&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>{setRefs([]);setConfirmed(false)}}>清空本条证据选择</Button>}{store.hasMore&&<Button size="sm" disabled={busy||store.loading} onClick={()=>void store.load(store.records.length)}>更多报告证据</Button>}
 <Button size="sm" variant="outline" disabled={busy||!refs.length} onClick={propose}>整理联合研判草稿</Button>
 {proposed&&<div className="space-y-2 rounded-lg border bg-white p-3 text-xs"><p className="font-medium">草稿预览 · 不会覆盖下方文字</p>{Object.entries(proposed).map(([key,value])=><p key={key} className="whitespace-pre-wrap break-words">{value}</p>)}<Button size="sm" disabled={busy} onClick={()=>{setDraft(proposed);setProposed(null);setConfirmed(false)}}>采用草稿，替换下方编辑内容</Button><Button size="sm" variant="ghost" onClick={()=>setProposed(null)}>保留原编辑内容</Button></div>}
 {([['conclusion','本月结论'],['topicBrief','选题要求'],['testPlan','投放验证'],['revisit','调整条件']] as const).map(([key,label])=><label key={key} className="block text-xs font-medium">{label}<textarea aria-label={`联合研判${label}`} disabled={busy} maxLength={key==='conclusion'||key==='topicBrief'?3000:2000} value={draft[key]} onChange={e=>{setDraft(old=>({...old,[key]:e.target.value}));setConfirmed(false)}} className="mt-1 min-h-28 w-full rounded-lg border bg-white p-3 text-sm leading-6"/></label>)}
 <label className="flex gap-2 text-xs leading-6"><input type="checkbox" aria-label="确认联合研判依据与边界" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>已核对本月结论与报告适用范围、反例和来源独立性；选题与投放是待验证建议。</label>
 {editingFingerprint!==findingFingerprint(finding)&&<p role="alert" className="text-amber-800">榜单在编辑时已变化，请保留文字，重新打开本条核对后再确认。</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<Button size="sm" disabled={busy||editingFingerprint!==findingFingerprint(finding)||!confirmed||!refs.length||Object.values(draft).some(v=>!v.trim())} onClick={()=>void save()}>{busy?'核对版本并保存…':'确认并应用本月研判'}</Button>
 </div>
}
