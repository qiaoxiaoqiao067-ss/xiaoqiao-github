"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { Project } from "@/hooks/use-projects"
import type { ProjectAsset, ContractInfo } from "@/hooks/use-project-files"
import type { ProjectTimelineItem } from "@/hooks/use-project-timeline"
import type { Meeting } from "@/hooks/use-meetings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Circle, FileCheck2, Languages, Loader2, MessageSquareText, PackageCheck, RotateCcw, Save, ScanText } from "lucide-react"

const MILESTONES = ["拟购买/合同审批","正式推进","剧本修改","剧本定稿","双语稿确认","围读","制作交接","完成归档"] as const
const MILESTONE_CATEGORY:Record<string,string>={"拟购买/合同审批":"剧本采购合同","正式推进":"责编意见","剧本修改":"剧本修改稿","剧本定稿":"中文完稿","双语稿确认":"双语稿","围读":"围读材料","制作交接":"制作交接","完成归档":"项目复盘"}
const CONTRACT_FIELDS: Array<{key:keyof ContractInfo;label:string;placeholder:string}> = [
  {key:"party_a",label:"甲方 / 采购方",placeholder:"合同主体"},{key:"party_b",label:"乙方 / 编剧方",placeholder:"合同主体"},{key:"amount",label:"合同金额",placeholder:"未约定可留空"},{key:"copyright_scope",label:"版权范围",placeholder:"改编权、摄制权、传播权等"},{key:"authorization_term",label:"授权期限",placeholder:"起止时间或期限"},{key:"territory",label:"授权地区",placeholder:"全球、北美等"},{key:"payment_terms",label:"付款条件（可选）",placeholder:"节点、比例、账户要求"},{key:"delivery_terms",label:"交稿条件（可选）",placeholder:"集数、版本、时间"},{key:"invoice_terms",label:"发票条件（可选）",placeholder:"无约定可留空"},{key:"effective_date",label:"生效日期",placeholder:"签署或生效时间"},
]

function hasFile(files:ProjectAsset[],categories:string[],statuses?:ProjectAsset["status"][]){return files.some((file)=>categories.includes(file.category)&&file.status!=="archived"&&(!statuses||statuses.includes(file.status)))}

function hasDeliveredMilestone(files:ProjectAsset[],milestone:string){
  return files.some((file)=>file.status==="delivered"&&file.stage===milestone)
}

function milestoneIndex(stage:string){
  const direct=MILESTONES.indexOf(stage as typeof MILESTONES[number]);if(direct>=0)return direct
  if(/合同|购买/.test(stage))return 0
  if(/立项|调研|Concept|大纲/.test(stage))return 1
  if(/分集|修改/.test(stage))return 2
  if(/定稿/.test(stage))return 3
  if(/翻译|本地化|双语/.test(stage))return 4
  if(/围读/.test(stage))return 5
  if(/制作|分镜|后期|验收/.test(stage))return 6
  if(/上架|复盘|归档/.test(stage))return 7
  return -1
}

export function ProjectWorkflowPanel({project,files,nodes,meetings,onUpdateFile,onExtractContract,onMilestone,onConfirmMilestone}:{project:Project;files:ProjectAsset[];nodes:ProjectTimelineItem[];meetings:Meeting[];onUpdateFile:(id:string,updates:Partial<Pick<ProjectAsset,"status"|"notes"|"stage"|"timeline_item_id"|"contract_info">>)=>Promise<ProjectAsset>;onExtractContract:(id:string)=>Promise<ProjectAsset>;onMilestone:(stage:string,category:string)=>void;onConfirmMilestone:(stage:string,completed:boolean)=>Promise<void>}){
  const contract=files.find((file)=>file.category==="剧本采购合同"&&file.status!=="archived")
  const [contractDraft,setContractDraft]=useState<ContractInfo>(contract?.contract_info||{})
  const [extracting,setExtracting]=useState(false);const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");const [editingContract,setEditingContract]=useState(!contract?.contract_info?.reviewed)
  const completed=useMemo(()=>new Set<string>([
    // The project stage means "currently working here". Only earlier stages
    // are implicitly complete; the current stage receives a check after its
    // linked material is explicitly marked as delivered.
    ...MILESTONES.slice(0,Math.max(0,milestoneIndex(project.stage))),
    ...MILESTONES.filter((milestone)=>hasDeliveredMilestone(files,milestone)),
    ...(contract?.contract_info?.reviewed||contract?.status==="delivered"?["拟购买/合同审批"]:[]),
    ...(hasFile(files,["剧本修改稿"],["final","delivered"])?["剧本修改"]:[]),
    ...(hasFile(files,["中文完稿","全本剧本"],["final","delivered"])?["剧本定稿"]:[]),
    ...(hasFile(files,["双语稿"],["final","delivered"])?["双语稿确认"]:[]),
    ...(hasFile(files,["制作交接","制作资料"],["delivered","final"])?["制作交接"]:[]),
    ...(["completed","archived"].includes(project.status)?["完成归档"]:[]),
  ]),[contract,files,project.stage,project.status])
  const nextMilestone=MILESTONES.find((item)=>!completed.has(item))
  const extract=async()=>{if(!contract)return;setExtracting(true);setMessage("");try{const updated=await onExtractContract(contract.id);setContractDraft(updated.contract_info||{});setMessage("合同字段已提取，请人工核对后确认。AI不会替你确认合同内容。") }catch(error){setMessage(error instanceof Error?error.message:"合同识别失败")}finally{setExtracting(false)}}
  const save=async(reviewed:boolean)=>{if(!contract)return;setSaving(true);setMessage("");try{await onUpdateFile(contract.id,{contract_info:{...contractDraft,reviewed}});setMessage(reviewed?"合同信息已人工确认。":"合同信息草稿已保存。") }catch(error){setMessage(error instanceof Error?error.message:"合同信息保存失败")}finally{setSaving(false)}}
  return <div className="space-y-4">
    <Card><CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="section-kicker">Project workflow</p><CardTitle className="mt-1 text-base">项目里程碑</CardTitle></div><div className="flex flex-wrap gap-2"><Badge variant="secondary">当前：{project.stage}</Badge>{nextMilestone&&<Badge variant="outline">下一节点：{nextMilestone}</Badge>}</div></div></CardHeader><CardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{MILESTONES.map((item,index)=>{const done=completed.has(item);const manual=files.some((file)=>file.category==="__里程碑确认"&&file.stage===item&&file.status==="delivered");return <div key={item} className={`rounded-xl border p-3 text-white transition ${done?"border-[#1c5a42] bg-[#174c39]":"border-[#3c725d] bg-[#245b46]"}`}><button type="button" onClick={()=>onMilestone(item,MILESTONE_CATEGORY[item])} className="w-full text-left"><div className="flex items-start gap-2">{done?<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#c9f45a]"/>:<Circle className="mt-0.5 h-4 w-4 shrink-0 text-white/60"/>}<div><p className="text-xs font-semibold">{index+1}. {item}</p><p className="mt-1 text-[10px] text-white/65">{done?"已完成":"点击记录或上传资料"}</p></div></div></button><button type="button" onClick={()=>void onConfirmMilestone(item,!manual)} className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[10px] font-semibold transition hover:bg-white/20">{manual?<><RotateCcw className="h-3 w-3"/>取消完成</>:<><CheckCircle2 className="h-3 w-3"/>确认完成</>}</button></div>})}</div><p className="mt-3 text-[11px] text-muted-foreground">可以单独确认里程碑完成，也可以上传资料并设为“已交付”。会议记录不会自动改变围读状态。</p></CardContent></Card>
    <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
      <Card><CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="text-base">合同与商务信息</CardTitle><p className="mt-1 text-[11px] text-muted-foreground">合同类型统一为剧本采购，可包含版权授权和编剧委托。</p></div>{contract&&<div className="flex gap-2"><Badge variant={contract.contract_info?.reviewed?"success":"secondary"}>{contract.contract_info?.reviewed?"已人工确认":"待人工确认"}</Badge>{contract.contract_info?.reviewed&&<Button size="sm" variant="ghost" onClick={()=>setEditingContract((value)=>!value)}>{editingContract?"收起编辑":"重新编辑"}</Button>}<Button size="sm" variant="outline" disabled={extracting} onClick={()=>void extract()}>{extracting?<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>:<ScanText className="mr-1 h-3.5 w-3.5"/>}提取合同字段</Button></div>}</div></CardHeader><CardContent>{!contract?<div className="rounded-xl border border-dashed p-5 text-center"><FileCheck2 className="mx-auto h-8 w-8 text-muted-foreground/30"/><p className="mt-3 text-sm font-semibold">尚未上传剧本采购合同</p><p className="mt-1 text-xs text-muted-foreground">点击“拟购买/合同审批”里程碑上传合同。</p></div>:contract.contract_info?.reviewed&&!editingContract?<details open className="rounded-xl border bg-muted/20 p-3"><summary className="cursor-pointer text-sm font-semibold">已确认合同信息</summary><div className="mt-3 grid gap-2 md:grid-cols-2">{CONTRACT_FIELDS.map((field)=><p key={field.key} className="text-xs"><span className="text-muted-foreground">{field.label}：</span>{String(contractDraft[field.key]||"未填写")}</p>)}</div></details>:<div className="space-y-3"><p className="text-xs text-muted-foreground">当前合同：{contract.file_name||contract.title} · V{contract.version}</p><div className="grid gap-3 md:grid-cols-2">{CONTRACT_FIELDS.map((field)=><label key={field.key}><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{field.label}</span><Input value={String(contractDraft[field.key]||"")} placeholder={field.placeholder} onChange={(event)=>setContractDraft({...contractDraft,[field.key]:event.target.value})}/></label>)}</div><label><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">歧义与待确认项</span><Textarea rows={3} value={(contractDraft.uncertainties||[]).join("\n")} placeholder="AI识别出的歧义，或需要向法务、编剧确认的问题" onChange={(event)=>setContractDraft({...contractDraft,uncertainties:event.target.value.split("\n").map((item)=>item.trim()).filter(Boolean)})}/></label><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" disabled={saving} onClick={()=>void save(false)}><Save className="mr-1 h-3.5 w-3.5"/>保存草稿</Button><Button size="sm" disabled={saving} onClick={()=>{void save(true);setEditingContract(false)}}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>人工确认</Button></div></div>}{message&&<p role="status" className="mt-3 rounded-lg bg-primary/8 px-3 py-2 text-xs text-primary">{message}</p>}</CardContent></Card>
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">交付与协作</CardTitle></CardHeader><CardContent className="space-y-2"><ActionLink href={`/localization?projectId=${project.id}`} icon={Languages} title="双语稿确认" text={hasFile(files,["双语稿"])?"已有双语稿记录":"进入项目本地化与双语审校"}/><ActionLink href="/meetings" icon={MessageSquareText} title="围读记录" text={`${meetings.filter((meeting)=>/围读/.test(meeting.meeting_type)).length} 次项目围读`}/><div className="rounded-xl border p-3"><PackageCheck className="h-4 w-4 text-primary"/><p className="mt-2 text-xs font-semibold">制作交接</p><p className="mt-1 text-[10px] text-muted-foreground">{hasFile(files,["制作交接","制作资料"])?"已有制作资料，请核对交付状态":"上传制作交接或制作资料后自动记录"}</p></div><div className="rounded-xl border p-3"><FileCheck2 className="h-4 w-4 text-primary"/><p className="mt-2 text-xs font-semibold">项目归档</p><p className="mt-1 text-[10px] text-muted-foreground">{project.status==="archived"?"项目已归档":`${nodes.length} 个排期节点 · ${files.filter((file)=>file.status!=="archived").length} 份使用中文件`}</p></div></CardContent></Card>
    </div>
  </div>
}

function ActionLink({href,icon:Icon,title,text}:{href:string;icon:typeof Languages;title:string;text:string}){return <Link href={href} className="block rounded-xl border p-3 transition hover:border-primary/40 hover:bg-primary/[.03]"><Icon className="h-4 w-4 text-primary"/><p className="mt-2 text-xs font-semibold">{title}</p><p className="mt-1 text-[10px] text-muted-foreground">{text}</p></Link>}
