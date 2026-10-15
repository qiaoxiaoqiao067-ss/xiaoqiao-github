"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
import { useProjects } from "@/hooks/use-projects"
import { useContents } from "@/hooks/use-contents"
import { useLocalization, type LocalizationMode, type LocalizationStatus } from "@/hooks/use-localization"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Archive, BookOpen, Download, FileArchive, FileText, Languages, Loader2, PackageCheck, Plus, Upload, X } from "lucide-react"

const OUTPUTS = ["目标语言完整剧本", "双语对照剧本", "人物地名术语表", "本地化修改说明", "翻译审校报告"]
const STATUS_LABEL:Record<LocalizationStatus,string> = {pending:"待翻译",translating:"翻译中",draft_ready:"初译完成",reviewing:"审校中",awaiting_confirmation:"待确认",delivered:"已交付",archived:"已归档",failed:"失败"}
const MODE_LABEL:Record<LocalizationMode,string> = {quick:"快速翻译",standard:"标准本地化",refined:"精翻审校"}

export default function LocalizationPage(){
  const {projects,updateProject}=useProjects()
  const {contents,fetchContents}=useContents()
  const {jobs,files,loading,error,addJob,updateJob,addProjectFile}=useLocalization()
  const uploadRef=useRef<HTMLInputElement>(null)
  const [showForm,setShowForm]=useState(false)
  const [saving,setSaving]=useState(false)
  const [uploading,setUploading]=useState(false)
  const [message,setMessage]=useState("")
  const [form,setForm]=useState({projectId:"",sourceFileId:"",sourceLanguage:"中文",targetLanguage:"英语",targetMarket:"北美",mode:"standard" as LocalizationMode,dueDate:"",glossary:"",styleNotes:"",outputs:[...OUTPUTS]})
  const selectedProject=projects.find((item)=>item.id===form.projectId)
  const selectedContent=contents.find((item)=>item.id===selectedProject?.content_id)
  const sourceFiles=selectedContent?.content_files || []
  const activeJobs=jobs.filter((item)=>item.status!=="archived")
  const archivedJobs=jobs.filter((item)=>item.status==="archived")
  const stats=useMemo(()=>({pending:activeJobs.filter((item)=>item.status==="pending").length,running:activeJobs.filter((item)=>["translating","reviewing"].includes(item.status)).length,confirm:activeJobs.filter((item)=>["draft_ready","awaiting_confirmation"].includes(item.status)).length,delivered:activeJobs.filter((item)=>item.status==="delivered").length}),[activeJobs])

  const chooseProject=(projectId:string)=>{ const project=projects.find((item)=>item.id===projectId); const content=contents.find((item)=>item.id===project?.content_id); const latest=[...(content?.content_files||[])].sort((a,b)=>b.version-a.version)[0]; setForm((value)=>({...value,projectId,sourceFileId:latest?.id||"",targetMarket:project?.market||value.targetMarket})) }
  const toggleOutput=(name:string)=>setForm((value)=>({...value,outputs:value.outputs.includes(name)?value.outputs.filter((item)=>item!==name):[...value.outputs,name]}))

  const uploadSource=async(file:File|undefined)=>{
    if(!file||!selectedProject)return
    setUploading(true);setMessage("")
    try{
      let contentId=selectedProject.content_id
      if(!contentId){
        const response=await fetch("/api/contents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:selectedProject.title,contentType:"development",status:"pending",market:selectedProject.market,genre:selectedProject.genre,source:"项目完稿"})})
        const data=await response.json();if(!response.ok)throw new Error(data.error||"建立内容档案失败")
        contentId=data.content.id;await updateProject(selectedProject.id,{content_id:contentId})
      }
      const body=new FormData();body.set("file",file);body.set("contentId",contentId!)
      const response=await fetch("/api/contents/upload",{method:"POST",body});const data=await response.json();if(!response.ok)throw new Error(data.error||"上传失败")
      await addProjectFile({project_id:selectedProject.id,content_id:contentId,content_file_id:data.file.id,category:"中文完稿",title:file.name,version:data.file.version,status:"final",notes:"从本地化工作区上传并标记为完稿版本"})
      await fetchContents();setForm((value)=>({...value,sourceFileId:data.file.id}));setMessage("完稿已上传并加入项目档案。")
    }catch(caught){setMessage(caught instanceof Error?caught.message:"上传失败")}finally{setUploading(false);if(uploadRef.current)uploadRef.current.value=""}
  }

  const createJob=async()=>{
    if(!selectedProject||!form.sourceFileId)return
    setSaving(true);setMessage("")
    try{await addJob({title:selectedProject.title,project_id:selectedProject.id,content_id:selectedProject.content_id,source_file_id:form.sourceFileId,source_language:form.sourceLanguage,target_language:form.targetLanguage,target_market:form.targetMarket,mode:form.mode,status:"pending",progress:0,due_date:form.dueDate||null,glossary:form.glossary||null,style_notes:form.styleNotes||null,output_options:form.outputs});setShowForm(false);setMessage("本地化任务已建立，完稿版本和交付要求已保存。") }catch(caught){setMessage(caught instanceof Error?caught.message:"创建失败")}finally{setSaving(false)}
  }

  return <AppLayout><div className="space-y-5">
    <PageHero compact eyebrow="完稿 · 翻译 · 审校 · 交付" title="本地化交付" description={`${activeJobs.length} 个处理中 · ${stats.confirm} 个待确认 · ${stats.delivered} 个已交付`} action={<Button onClick={()=>setShowForm((value)=>!value)} className="bg-[#c9f45a] text-[#102a21] hover:bg-[#d8ff74]">{showForm?<X className="mr-2 h-4 w-4"/>:<Plus className="mr-2 h-4 w-4"/>}{showForm?"收起":"新建本地化任务"}</Button>}/>
    {message&&<div className="rounded-xl bg-primary/8 px-4 py-3 text-sm text-primary">{message}</div>}
    {error&&<div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error.includes("localization_jobs")?"本地化数据表尚未初始化，请运行 supabase/localization_setup.sql。":error}</div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="待翻译" value={stats.pending}/><Stat label="翻译/审校中" value={stats.running}/><Stat label="待确认" value={stats.confirm}/><Stat label="已交付" value={stats.delivered}/></div>

    {showForm&&<Card><CardHeader><CardTitle className="text-lg">建立本地化任务</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2"><Field label="选择项目"><select value={form.projectId} onChange={(e)=>chooseProject(e.target.value)} className="h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="">请选择已进入开发的项目</option>{projects.filter((item)=>item.status!=="archived").map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select></Field><Field label="完稿版本"><div className="flex gap-2"><select value={form.sourceFileId} onChange={(e)=>setForm({...form,sourceFileId:e.target.value})} className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm"><option value="">选择完稿文件</option>{sourceFiles.sort((a,b)=>b.version-a.version).map((file)=><option key={file.id} value={file.id}>V{file.version} · {file.file_name}</option>)}</select><input ref={uploadRef} type="file" accept=".docx,.pdf,.txt,.md" className="hidden" onChange={(e)=>void uploadSource(e.target.files?.[0])}/><Button variant="outline" disabled={!selectedProject||uploading} onClick={()=>uploadRef.current?.click()}>{uploading?<Loader2 className="h-4 w-4 animate-spin"/>:<Upload className="h-4 w-4"/>}</Button></div></Field></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Field label="原文语言"><Input value={form.sourceLanguage} onChange={(e)=>setForm({...form,sourceLanguage:e.target.value})}/></Field><Field label="目标语言"><Input value={form.targetLanguage} onChange={(e)=>setForm({...form,targetLanguage:e.target.value})}/></Field><Field label="目标市场"><Input value={form.targetMarket} onChange={(e)=>setForm({...form,targetMarket:e.target.value})}/></Field><Field label="翻译模式"><select value={form.mode} onChange={(e)=>setForm({...form,mode:e.target.value as LocalizationMode})} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">{Object.entries(MODE_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field><Field label="交付日期"><Input type="date" value={form.dueDate} onChange={(e)=>setForm({...form,dueDate:e.target.value})}/></Field></div>
      <div className="grid gap-3 md:grid-cols-2"><Field label="术语、人名与地名规则"><Textarea rows={3} value={form.glossary} onChange={(e)=>setForm({...form,glossary:e.target.value})} placeholder="例如：固定英文名、专有名词和禁用译法"/></Field><Field label="本地化与对白要求"><Textarea rows={3} value={form.styleNotes} onChange={(e)=>setForm({...form,styleNotes:e.target.value})} placeholder="例如：北美口语、短句、保留剧本格式、降低翻译腔"/></Field></div>
      <div><p className="mb-2 text-xs font-semibold text-muted-foreground">交付文件</p><div className="flex flex-wrap gap-2">{OUTPUTS.map((item)=><button key={item} onClick={()=>toggleOutput(item)} className={`rounded-full border px-3 py-1.5 text-xs ${form.outputs.includes(item)?"border-primary bg-primary/10 text-primary":"border-border text-muted-foreground"}`}>{item}</button>)}</div></div>
      <div className="flex justify-end"><Button disabled={saving||!form.projectId||!form.sourceFileId||!form.outputs.length} onClick={()=>void createJob()}>{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Languages className="mr-2 h-4 w-4"/>}保存并进入待翻译</Button></div>
    </CardContent></Card>}

    <section><div className="mb-3 flex items-end justify-between"><div><p className="section-kicker">PIPELINE</p><h2 className="mt-1 text-lg font-semibold">本地化任务</h2></div><p className="text-xs text-muted-foreground">一次上传，统一管理译稿与交付要求</p></div>{loading?<Card className="h-28 animate-pulse"/>:activeJobs.length?<div className="overflow-hidden rounded-2xl border bg-card">{activeJobs.map((job)=><JobRow key={job.id} job={job} projectName={projects.find((item)=>item.id===job.project_id)?.title} onStatus={(status,progress)=>void updateJob(job.id,{status,progress})}/>)}</div>:<Card className="border-dashed"><CardContent className="flex flex-col items-center py-12 text-center"><Languages className="h-10 w-10 text-muted-foreground/30"/><p className="mt-3 font-semibold">还没有本地化任务</p><p className="mt-1 text-sm text-muted-foreground">选择一个已完稿项目，保存翻译语言、市场和交付要求。</p></CardContent></Card>}</section>

    <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">项目完稿档案</CardTitle><Link href="/projects" className="text-xs font-semibold text-primary">进入项目推进</Link></CardHeader><CardContent>{files.length?<div className="space-y-2">{files.slice(0,6).map((file)=><div key={file.id} className="flex items-center gap-3 rounded-xl border px-3 py-2"><FileArchive className="h-4 w-4 text-primary"/><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{file.title}</p><p className="text-[10px] text-muted-foreground">{projects.find((item)=>item.id===file.project_id)?.title||"未关联项目"} · {file.category} · V{file.version}</p></div><Badge variant={file.status==="final"?"success":"outline"}>{file.status==="final"?"完稿":"已保存"}</Badge></div>)}</div>:<p className="text-sm text-muted-foreground">上传完稿后会自动进入项目档案。</p>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">历史交付</CardTitle></CardHeader><CardContent>{archivedJobs.length?<div className="space-y-2">{archivedJobs.slice(0,5).map((job)=><div key={job.id} className="flex items-center justify-between rounded-xl border px-3 py-2"><div><p className="text-xs font-semibold">{job.title}</p><p className="text-[10px] text-muted-foreground">{job.target_language} · {job.target_market||"未指定市场"}</p></div><Archive className="h-4 w-4 text-muted-foreground"/></div>)}</div>:<p className="text-sm text-muted-foreground">已归档的本地化交付会保存在这里。</p>}</CardContent></Card></section>
  </div></AppLayout>
}

function JobRow({job,projectName,onStatus}:{job:import("@/hooks/use-localization").LocalizationJob;projectName?:string;onStatus:(status:LocalizationStatus,progress:number)=>void}){return <div className="grid gap-3 border-b px-4 py-3 last:border-b-0 md:grid-cols-[minmax(190px,1.2fr)_130px_150px_minmax(160px,1fr)_auto] md:items-center"><div className="min-w-0"><p className="truncate text-sm font-semibold">{job.title}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{projectName||"未关联项目"} · {job.source_language} → {job.target_language}</p></div><div><Badge variant={job.status==="failed"?"destructive":job.status==="delivered"?"success":"secondary"}>{STATUS_LABEL[job.status]}</Badge><p className="mt-1 text-[10px] text-muted-foreground">{MODE_LABEL[job.mode]}</p></div><div><div className="flex justify-between text-[10px] text-muted-foreground"><span>进度</span><span>{job.progress}%</span></div><Progress value={job.progress} className="mt-1 h-1.5"/></div><div className="min-w-0"><p className="truncate text-xs">{job.output_options.slice(0,2).join("、")}</p><p className="mt-1 text-[10px] text-muted-foreground">{job.due_date?`交付 ${job.due_date}`:"未设置交付日期"}</p></div><div className="flex gap-1">{job.status==="pending"&&<Button size="sm" variant="outline" onClick={()=>onStatus("translating",10)}><Languages className="mr-1.5 h-3.5 w-3.5"/>开始</Button>}{job.status==="translating"&&<Button size="sm" variant="outline" onClick={()=>onStatus("draft_ready",70)}>标记初译完成</Button>}{job.status==="draft_ready"&&<Button size="sm" variant="outline" onClick={()=>onStatus("reviewing",80)}>开始审校</Button>}{job.status==="reviewing"&&<Button size="sm" variant="outline" onClick={()=>onStatus("awaiting_confirmation",90)}>提交确认</Button>}{job.status==="awaiting_confirmation"&&<Button size="sm" onClick={()=>onStatus("delivered",100)}><PackageCheck className="mr-1.5 h-3.5 w-3.5"/>确认交付</Button>}{job.status==="delivered"&&<><Button size="sm" variant="outline" disabled><Download className="mr-1.5 h-3.5 w-3.5"/>交付包</Button><Button size="icon" variant="ghost" onClick={()=>onStatus("archived",100)}><Archive className="h-4 w-4"/></Button></>}</div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>}
function Stat({label,value}:{label:string;value:number}){return <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>}
