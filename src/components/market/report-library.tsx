"use client"
import {useCallback,useEffect,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {createDirectStorageClient} from '@/lib/supabase/client'
import {MAX_REPORT_BYTES,REPORT_EXTENSIONS,type ReportRecord,type ReportUnit,type ReportRef,type ReportCitation} from '@/lib/market/report-types'
export async function marketJson(url:string,body?:unknown,method='POST'){
 const r=await fetch(url,body?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(125000)}:{cache:'no-store',signal:AbortSignal.timeout(30000)})
 const data=await r.json().catch(()=>null);if(!r.ok||!data)throw new Error(data?.error||`服务暂不可用（HTTP ${r.status}），请重试`);return data
}
export function ReportOriginal({citation}:{citation:Pick<ReportCitation,'reportId'|'page'>}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function open(){setBusy(true);setError('');setUrl('');try{const r=await marketJson(`/api/market-data/reports?id=${encodeURIComponent(citation.reportId)}&download=1`);setUrl(r.url+(citation.page?`#page=${citation.page}`:''))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <span className="inline-flex flex-wrap items-center gap-2 text-xs"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void open()}>{busy?'准备原附件…':'查看原附件'}</Button>{url&&<a href={url} target="_blank" rel="noreferrer" className="text-primary underline">打开原文件{citation.page?` · 第${citation.page}页`:''}（链接2分钟有效）</a>}{error&&<span role="alert">{error}</span>}</span>
}
export function ReportLibrary({onCite,disabled=false}:{disabled?:boolean;onCite:(ref:ReportRef,report:ReportRecord,unit:ReportUnit)=>void}){
 const [reports,setReports]=useState<ReportRecord[]>([]),[more,setMore]=useState(false),[canEdit,setCanEdit]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[retryUpload,setRetryUpload]=useState(false)
 const [selected,setSelected]=useState<{record:ReportRecord;units:ReportUnit[]}|null>(null),[unitId,setUnitId]=useState(''),[search,setSearch]=useState(''),[quote,setQuote]=useState('')
 const input=useRef<HTMLInputElement>(null),pending=useRef<{file:File;uploadId:string}|null>(null)
 const load=useCallback(async(offset=0)=>{setLoading(true);try{const r=await marketJson(`/api/market-data/reports?offset=${offset}`);setReports(old=>offset?[...old,...r.records.filter((n:ReportRecord)=>!old.some(o=>o.id===n.id))]:r.records);setMore(r.hasMore);setCanEdit(r.canEdit)}catch(e){setError((e as Error).message)}finally{setLoading(false)}},[])
 useEffect(()=>{ // Load the library only when its panel is opened.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void load()
 },[load])
 function show(r:{record:ReportRecord;units:ReportUnit[]}){setSelected(r);const u=r.units.find(u=>u.text.trim());setUnitId(u?.id||'');setQuote('');setSearch('')}
 async function open(id:string){setBusy(true);setError('');try{show(await marketJson(`/api/market-data/reports?id=${id}`))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function parse(id:string){setBusy(true);setError('');try{const r=await marketJson('/api/market-data/reports',{action:'parse',id});show(r);setMessage(r.message||'解析完成，请对照原文件选取引用段落');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function upload(file?:File){if(!file)return;const ext=file.name.split('.').pop()?.toLowerCase();if(file.size>MAX_REPORT_BYTES||!file.size||!REPORT_EXTENSIONS.some(e=>e===ext)){setError('请选择20MB以内的PDF、DOCX、TXT、Markdown文件');return}
  if(pending.current?.file!==file)pending.current={file,uploadId:crypto.randomUUID()}
  setBusy(true);setError('');setRetryUpload(false);setMessage('正在上传原附件…')
  try{const init=await marketJson('/api/market-data/reports',{action:'init',uploadId:pending.current.uploadId,fileName:file.name,size:file.size})
   if(!init.uploaded){const r=await createDirectStorageClient().storage.from('content-files').uploadToSignedUrl(init.path,init.token,file,{contentType:init.contentType});if(r.error)throw new Error('原附件上传失败，请点击继续上传：'+r.error.message)}
   setMessage('原附件已上传，正在提取文字与出处…');const r=await marketJson('/api/market-data/reports',{action:'parse',id:init.id});show(r);pending.current=null;setMessage(r.message||'已解析。请选择具体页/段/行，再填写要引用的原文；不会自动标为已核验。');await load()
  }catch(e){setError((e as Error).message);setRetryUpload(true)}finally{setBusy(false);if(input.current)input.current.value=''}
 }
 const units=selected?.units||[],unit=units.find(u=>u.id===unitId),filtered=units.filter(u=>!search||`${u.label} ${u.text}`.toLowerCase().includes(search.toLowerCase()))
 return <section aria-label="报告附件与出处" className="space-y-3 rounded-xl border border-[#b5cba5] bg-white p-3 sm:p-4">
  <div className="flex flex-wrap gap-2 items-center justify-between"><h3 className="font-medium text-primary">报告附件与出处</h3><div className="flex flex-wrap gap-2">{canEdit&&<><input ref={input} type="file" aria-label="上传报告附件" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={e=>void upload(e.target.files?.[0])}/><Button size="sm" disabled={busy} onClick={()=>input.current?.click()}>上传报告附件</Button></>}<Button size="sm" variant="outline" disabled={busy||loading} onClick={()=>void load()}>刷新附件列表</Button></div></div>
  <p className="text-xs leading-6 text-muted-foreground">PDF按物理页码定位；Word按提取段落、TXT/Markdown按原始行号定位。支持20MB以内文件。原附件保留，图片/扫描页暂不做OCR，缺字请对照原件。</p>
  {message&&<p role="status" className="text-sm">{message}</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{retryUpload&&!busy&&<Button size="sm" onClick={()=>void upload(pending.current?.file)}>继续上传同一附件</Button>}
  {loading&&!reports.length?<p>正在读取附件…</p>:reports.length===0?<p className="text-sm">尚无报告附件。</p>:<div className="max-h-52 overflow-y-auto divide-y">{reports.map(r=><div key={r.id} className="flex flex-wrap items-center gap-2 py-2"><button type="button" disabled={busy} className="min-w-0 flex-1 text-left text-sm break-all" onClick={()=>void open(r.id)}>{r.payload.fileName}<span className="block text-xs text-muted-foreground">{r.payload.status} · {(r.payload.size/1024/1024).toFixed(2)}MB · 上传{new Date(r.created_at).toLocaleString('zh-CN')}</span></button>{canEdit&&!r.payload.parsedPath&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void parse(r.id)}>重试解析</Button>}</div>)}</div>}
  {more&&<Button size="sm" disabled={busy||loading} onClick={()=>void load(reports.length)}>更多附件</Button>}
  {selected&&<div className="space-y-3 border-t pt-3"><h4 className="break-all font-medium">{selected.record.payload.fileName}</h4><ReportOriginal key={`${selected.record.id}:${unit?.page||0}`} citation={{reportId:selected.record.id,page:unit?.page}}/>{selected.record.payload.error&&<p role="alert" className="text-sm text-amber-800">{selected.record.payload.error}</p>}
   {!!units.length&&<><input aria-label="搜索报告正文" className="w-full min-w-0 rounded-lg border p-2 text-sm" placeholder="搜索正文或页/段/行号" value={search} onChange={e=>{setSearch(e.target.value);setUnitId('');setQuote('')}}/><p className="text-xs">匹配{filtered.length}处 / 共{units.length}处{selected.record.payload.emptyUnits?`；${selected.record.payload.emptyUnits}页无可提取文字`:''}</p><select aria-label="报告出处位置" className="w-full min-w-0 rounded-lg border p-2 text-sm" value={unitId} onChange={e=>{setUnitId(e.target.value);setQuote('')}}><option value="">选择具体出处</option>{filtered.map(u=><option key={u.id} value={u.id}>{u.label}{u.text?'':' · 无可提取文字'}</option>)}</select>
   {unit&&<><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#f8faef] p-3 font-sans text-sm">{unit.text||'本页无可提取文字，请查看原附件。'}</pre>{canEdit&&unit.text&&<><label className="block text-xs">精确引用（从上方原文复制，可缩小到一句）<textarea aria-label="报告精确引用" value={quote} maxLength={12000} onChange={e=>setQuote(e.target.value)} className="mt-1 min-h-24 w-full rounded-lg border p-2 text-sm"/></label><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>setQuote(unit.text.slice(0,12000))}>填入本处原文{unit.text.length>12000?'前12000字':''}</Button><Button size="sm" disabled={disabled||busy||!quote.trim()||!unit.text.includes(quote.trim())} onClick={()=>{onCite({reportId:selected.record.id,unitId:unit.id,quote:quote.trim()},selected.record,unit);setMessage(`已将${unit.label}带入证据草稿，补齐事实与范围后再保存。`)}}>采用此出处</Button></div>{quote&&!unit.text.includes(quote.trim())&&<p className="text-xs text-red-700">引用必须是当前出处的连续原文，不能改写；判断请写入证据的人工判断。</p>}</>}</>}
   </>}
  </div>}
 </section>
}
