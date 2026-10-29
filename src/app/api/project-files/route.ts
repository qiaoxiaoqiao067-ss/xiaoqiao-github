import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { serviceClient } from "@/lib/supabase/service"
import { requireUser } from "@/lib/supabase/require-user"

const BUCKET = "content-files"
const MAX_BYTES = 50 * 1024 * 1024

export type ContractInfo = { party_a?:string; party_b?:string; amount?:string; copyright_scope?:string; authorization_term?:string; territory?:string; payment_terms?:string; delivery_terms?:string; invoice_terms?:string; effective_date?:string; uncertainties?:string[]; reviewed?:boolean }
type AssetMeta = { storage_path?:string; file_name?:string; mime_type?:string; file_size?:number; text_content?:string; stage?:string; timeline_item_id?:string|null; description?:string; contract_info?:ContractInfo; kind?:string }
function safeName(name:string){return name.normalize("NFKC").replace(/[\\/\0-\x1f\x7f]/g,"-").replace(/\s+/g," ").trim().slice(0,180)||"project-file"}
function decodeNotes(notes:unknown):AssetMeta{if(typeof notes!=="string"||!notes.trim())return{};try{const parsed=JSON.parse(notes);return parsed&&typeof parsed==="object"?parsed:{description:notes}}catch{return{description:notes}}}
function normalize(row:Record<string,unknown>){const meta=decodeNotes(row.notes);return{...row,...meta,notes:meta.description||(!meta.kind&&typeof row.notes==="string"?row.notes:null)}}
function missingTable(error:{code?:string;message?:string}|null){return Boolean(error&&(error.code==="42P01"||/does not exist|schema cache/i.test(error.message||"")))}

export async function GET(request:Request){
  const {user,response}=await requireUser();if(response)return response
  const projectId=new URL(request.url).searchParams.get("projectId")
  let query=serviceClient.from("project_files").select("*").eq("user_id",user.id).order("created_at",{ascending:false})
  if(projectId)query=query.eq("project_id",projectId)
  const {data,error}=await query
  if(error){if(missingTable(error))return NextResponse.json({files:[],setupRequired:true});return NextResponse.json({error:error.message},{status:500})}
  return NextResponse.json({files:(data||[]).map((row)=>normalize(row as Record<string,unknown>))})
}

export async function POST(request:Request){
  const {user,response}=await requireUser();if(response)return response
  const form=await request.formData();const file=form.get("file");const text=String(form.get("text")||"").trim();const textTitle=String(form.get("title")||"").trim();const projectId=String(form.get("projectId")||"");const category=String(form.get("category")||"其他附件").slice(0,100);const stage=String(form.get("stage")||"").slice(0,100);const timelineItemId=String(form.get("timelineItemId")||"")||null;const description=String(form.get("notes")||"").slice(0,5000);const requestedStatus=String(form.get("status")||"active");const status=["active","final","delivered","archived"].includes(requestedStatus)?requestedStatus:"active"
  if(!projectId||(!(file instanceof File)&&(!text||!textTitle)))return NextResponse.json({error:"请选择文件，或填写文字资料标题和正文"},{status:400})
  if(file instanceof File&&file.size>MAX_BYTES)return NextResponse.json({error:"单个文件不能超过 50MB"},{status:400})
  const {data:project}=await serviceClient.from("projects").select("id").eq("id",projectId).eq("user_id",user.id).maybeSingle();if(!project)return NextResponse.json({error:"项目不存在或无权访问"},{status:403})
  if(timelineItemId){const {data:node}=await serviceClient.from("project_timeline_items").select("id").eq("id",timelineItemId).eq("project_id",projectId).eq("user_id",user.id).maybeSingle();if(!node)return NextResponse.json({error:"关联节点不存在"},{status:400})}
  let fileName="";let storagePath="";if(file instanceof File){fileName=safeName(file.name);const ext=fileName.includes(".")?`.${fileName.split(".").pop()}`:"";storagePath=`${user.id}/projects/${projectId}/${randomUUID()}${ext}`;const {error:uploadError}=await serviceClient.storage.from(BUCKET).upload(storagePath,Buffer.from(await file.arrayBuffer()),{contentType:file.type||"application/octet-stream",upsert:false});if(uploadError)return NextResponse.json({error:uploadError.message},{status:500})}
  const {data:versions}=await serviceClient.from("project_files").select("version").eq("user_id",user.id).eq("project_id",projectId).eq("category",category).order("version",{ascending:false}).limit(1)
  const version=Number(versions?.[0]?.version||0)+1;const meta:AssetMeta=file instanceof File?{storage_path:storagePath,file_name:fileName,mime_type:file.type||"application/octet-stream",file_size:file.size,stage,timeline_item_id:timelineItemId,description,kind:"project_asset_v1"}:{text_content:text,stage,timeline_item_id:timelineItemId,description,kind:"project_text_v1"}
  const {data,error}=await serviceClient.from("project_files").insert({user_id:user.id,project_id:projectId,content_id:null,content_file_id:null,category,title:file instanceof File?fileName:textTitle.slice(0,300),version,status,notes:JSON.stringify(meta)}).select().single()
  if(error){if(storagePath)await serviceClient.storage.from(BUCKET).remove([storagePath]);return NextResponse.json({error:error.message,setupRequired:missingTable(error)},{status:500})}
  return NextResponse.json({file:normalize(data as Record<string,unknown>)},{status:201})
}

export async function PATCH(request:Request){
  const {user,response}=await requireUser();if(response)return response
  const body=await request.json() as {id?:string;status?:string;notes?:string;stage?:string;timeline_item_id?:string|null;contract_info?:ContractInfo}
  if(!body.id)return NextResponse.json({error:"缺少文件ID"},{status:400})
  const {data:current,error:readError}=await serviceClient.from("project_files").select("*").eq("id",body.id).eq("user_id",user.id).single();if(readError)return NextResponse.json({error:readError.message},{status:404})
  const meta={...decodeNotes(current.notes),...(body.notes!==undefined?{description:body.notes}:{}),...(body.stage!==undefined?{stage:body.stage}:{}),...(body.timeline_item_id!==undefined?{timeline_item_id:body.timeline_item_id}:{}),...(body.contract_info!==undefined?{contract_info:body.contract_info}:{}),kind:"project_asset_v1"}
  const updates:Record<string,unknown>={notes:JSON.stringify(meta),updated_at:new Date().toISOString()};if(body.status&&["active","final","delivered","archived"].includes(body.status))updates.status=body.status
  const {data,error}=await serviceClient.from("project_files").update(updates).eq("id",body.id).eq("user_id",user.id).select().single();if(error)return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({file:normalize(data as Record<string,unknown>)})
}

export async function DELETE(request:Request){
  const {user,response}=await requireUser();if(response)return response
  const id=new URL(request.url).searchParams.get("id");if(!id)return NextResponse.json({error:"缺少文件ID"},{status:400})
  const {data,error:readError}=await serviceClient.from("project_files").select("*").eq("id",id).eq("user_id",user.id).single();if(readError)return NextResponse.json({error:readError.message},{status:404})
  const meta=decodeNotes(data.notes);if(meta.storage_path)await serviceClient.storage.from(BUCKET).remove([meta.storage_path])
  const {error}=await serviceClient.from("project_files").delete().eq("id",id).eq("user_id",user.id);if(error)return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({success:true})
}
