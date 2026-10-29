import { NextResponse } from "next/server"
import { z } from "zod"
import { serviceClient } from "@/lib/supabase/service"
import { requireUser } from "@/lib/supabase/require-user"

const entitySchema = z.enum(["job", "file"])
const jobSchema = z.object({
  title:z.string().trim().min(1).max(200), project_id:z.string().uuid().nullable().optional(), content_id:z.string().uuid().nullable().optional(), source_file_id:z.string().uuid().nullable().optional(),
  source_language:z.string().trim().min(1).max(50), target_language:z.string().trim().min(1).max(50), target_market:z.string().trim().max(100).nullable().optional(),
  mode:z.enum(["quick","standard","refined"]), status:z.enum(["pending","translating","draft_ready","reviewing","awaiting_confirmation","delivered","archived","failed"]).default("pending"),
  progress:z.number().int().min(0).max(100).default(0), glossary:z.string().max(20000).nullable().optional(), style_notes:z.string().max(20000).nullable().optional(), output_options:z.array(z.string().max(100)).max(12).default([]), due_date:z.string().max(20).nullable().optional(), error:z.string().max(2000).nullable().optional(),
})
const fileSchema = z.object({
  project_id:z.string().uuid(), content_id:z.string().uuid().nullable().optional(), content_file_id:z.string().uuid().nullable().optional(), category:z.string().trim().min(1).max(100), title:z.string().trim().min(1).max(300), version:z.number().int().min(1).max(999).default(1), status:z.enum(["active","final","delivered","archived"]).default("active"), notes:z.string().max(5000).nullable().optional(),
})
const jobUpdateSchema = z.object({status:z.enum(["pending","translating","draft_ready","reviewing","awaiting_confirmation","delivered","archived","failed"]).optional(),progress:z.number().int().min(0).max(100).optional(),error:z.string().max(2000).nullable().optional()}).refine((value)=>Object.keys(value).length>0)
const fileUpdateSchema = z.object({status:z.enum(["active","final","delivered","archived"]).optional(),notes:z.string().max(5000).nullable().optional()}).refine((value)=>Object.keys(value).length>0)
type Entity = z.infer<typeof entitySchema>
const categoryFor = (entity:Entity) => entity === "job" ? "本地化任务" : "项目文件档案"
function missingTable(error:{code?:string;message?:string}|null){return Boolean(error && (error.code === "42P01" || /does not exist|schema cache/i.test(error.message||"")))}
function parseDocument(row:Record<string,unknown>){let payload:Record<string,unknown>={};try{payload=JSON.parse(String(row.content||"{}"))}catch{}return {...payload,id:row.id,user_id:row.user_id,title:row.title,created_at:row.created_at,updated_at:row.updated_at}}
async function owned(table:"projects"|"contents"|"content_files",id:string|undefined|null,userId:string){if(!id)return true;const {data}=await serviceClient.from(table).select("id").eq("id",id).eq("user_id",userId).maybeSingle();return Boolean(data)}

export async function GET(){
  const {user,response}=await requireUser();if(response)return response
  const [jobs,files]=await Promise.all([serviceClient.from("localization_jobs").select("*").eq("user_id",user.id).order("updated_at",{ascending:false}),serviceClient.from("project_files").select("*").eq("user_id",user.id).order("created_at",{ascending:false})])
  if(!jobs.error&&!files.error)return NextResponse.json({jobs:jobs.data||[],files:files.data||[],storage:"dedicated"})
  if(!missingTable(jobs.error)&&!missingTable(files.error))return NextResponse.json({error:jobs.error?.message||files.error?.message||"加载失败"},{status:500})
  const {data,error}=await serviceClient.from("documents").select("*").eq("user_id",user.id).in("category",[categoryFor("job"),categoryFor("file")]).order("updated_at",{ascending:false})
  if(error)return NextResponse.json({error:error.message},{status:500})
  const rows=(data||[]).map((row)=>({category:row.category,value:parseDocument(row as Record<string,unknown>)}))
  return NextResponse.json({jobs:rows.filter((row)=>row.category===categoryFor("job")).map((row)=>row.value),files:rows.filter((row)=>row.category===categoryFor("file")).map((row)=>row.value),storage:"documents"})
}

export async function POST(request:Request){
  const {user,response}=await requireUser();if(response)return response
  const raw=await request.json() as {entity?:unknown;data?:unknown};const entityResult=entitySchema.safeParse(raw.entity);if(!entityResult.success)return NextResponse.json({error:"Invalid entity"},{status:400})
  const entity=entityResult.data;const parsed=(entity==="job"?jobSchema:fileSchema).safeParse(raw.data);if(!parsed.success)return NextResponse.json({error:"Invalid localization data",details:parsed.error.flatten()},{status:400})
  const input=parsed.data
  const projectId="project_id" in input?input.project_id:null;const contentId="content_id" in input?input.content_id:null;const sourceFileId="source_file_id" in input?input.source_file_id:("content_file_id" in input?input.content_file_id:null)
  if(!await owned("projects",projectId,user.id)||!await owned("contents",contentId,user.id)||!await owned("content_files",sourceFileId,user.id))return NextResponse.json({error:"关联的项目或文件不存在"},{status:403})
  const table=entity==="job"?"localization_jobs":"project_files";const {data,error}=await serviceClient.from(table).insert({...input,user_id:user.id}).select().single()
  if(!error)return NextResponse.json({item:data,storage:"dedicated"},{status:201})
  if(!missingTable(error))return NextResponse.json({error:error.message},{status:500})
  const {data:document,error:documentError}=await serviceClient.from("documents").insert({user_id:user.id,title:input.title,content:JSON.stringify(input),category:categoryFor(entity),file_type:"json",tags:[entity==="job"?"localization":"project-archive"]}).select().single()
  if(documentError)return NextResponse.json({error:documentError.message},{status:500})
  return NextResponse.json({item:parseDocument(document as Record<string,unknown>),storage:"documents"},{status:201})
}

export async function PATCH(request:Request){
  const {user,response}=await requireUser();if(response)return response
  const raw=await request.json() as {entity?:unknown;id?:unknown;updates?:unknown};const entityResult=entitySchema.safeParse(raw.entity);const idResult=z.string().uuid().safeParse(raw.id);if(!entityResult.success||!idResult.success)return NextResponse.json({error:"Invalid request"},{status:400})
  const entity=entityResult.data;const parsed=(entity==="job"?jobUpdateSchema:fileUpdateSchema).safeParse(raw.updates);if(!parsed.success)return NextResponse.json({error:"Invalid updates"},{status:400})
  const table=entity==="job"?"localization_jobs":"project_files";const updated_at=new Date().toISOString();const {data,error}=await serviceClient.from(table).update({...parsed.data,updated_at}).eq("id",idResult.data).eq("user_id",user.id).select().single()
  if(!error)return NextResponse.json({item:data,storage:"dedicated"})
  if(!missingTable(error))return NextResponse.json({error:error.message},{status:500})
  const {data:existing,error:readError}=await serviceClient.from("documents").select("*").eq("id",idResult.data).eq("user_id",user.id).eq("category",categoryFor(entity)).single();if(readError)return NextResponse.json({error:readError.message},{status:500})
  const current=parseDocument(existing as Record<string,unknown>);const next={...current,...parsed.data};delete next.id;delete next.user_id;delete next.created_at;delete next.updated_at
  const {data:document,error:documentError}=await serviceClient.from("documents").update({content:JSON.stringify(next),updated_at}).eq("id",idResult.data).eq("user_id",user.id).select().single();if(documentError)return NextResponse.json({error:documentError.message},{status:500})
  return NextResponse.json({item:parseDocument(document as Record<string,unknown>),storage:"documents"})
}

export async function DELETE(request:Request){
  const {user,response}=await requireUser();if(response)return response
  const url=new URL(request.url);const entityResult=entitySchema.safeParse(url.searchParams.get("entity"));const idResult=z.string().uuid().safeParse(url.searchParams.get("id"));if(!entityResult.success||!idResult.success)return NextResponse.json({error:"Invalid request"},{status:400})
  const entity=entityResult.data;const table=entity==="job"?"localization_jobs":"project_files"
  const {error}=await serviceClient.from(table).delete().eq("id",idResult.data).eq("user_id",user.id)
  if(!error)return NextResponse.json({ok:true,storage:"dedicated"})
  if(!missingTable(error))return NextResponse.json({error:error.message},{status:500})
  const {error:documentError}=await serviceClient.from("documents").delete().eq("id",idResult.data).eq("user_id",user.id).eq("category",categoryFor(entity))
  if(documentError)return NextResponse.json({error:documentError.message},{status:500})
  return NextResponse.json({ok:true,storage:"documents"})
}
