import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { NextResponse } from "next/server"
import mammoth from "mammoth"
import { PDFParse } from "pdf-parse"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { runCodex } from "@/lib/ai/codex"

const allowed=new Set(["docx","pdf","txt","md"])
let workerReady=false
const extension=(name:string)=>name.split(".").pop()?.toLowerCase()||""
const safeName=(name:string)=>name.normalize("NFKD").replace(/[^\x00-\x7F]/g,"-").replace(/[^A-Za-z0-9._-]+/g,"-").slice(0,160)||"meeting"
async function extract(file:File,ext:string){if(ext==="txt"||ext==="md")return (await file.text()).trim();if(ext==="docx")return (await mammoth.extractRawText({buffer:Buffer.from(await file.arrayBuffer())})).value.trim();if(!workerReady){PDFParse.setWorker(join(process.cwd(),"node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"));workerReady=true}const parser=new PDFParse({data:new Uint8Array(await file.arrayBuffer())});try{return (await parser.getText()).text.trim()}finally{await parser.destroy()}}
function parseJson(value:string){const clean=value.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");return JSON.parse(clean.slice(clean.indexOf("{"),clean.lastIndexOf("}")+1)) as {summary?:string;decisions?:string}}

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const {user,response}=await requireUser();if(response)return response
    const {id}=await context.params
    const {data:meeting,error:meetingError}=await serviceClient.from("meetings").select("id,transcript,summary,decisions,meeting_date").eq("id",id).eq("user_id",user.id).maybeSingle()
    if(meetingError)throw meetingError;if(!meeting)return NextResponse.json({error:"会议记录不存在"},{status:404})
    const form=await request.formData();const file=form.get("file");if(!(file instanceof File))return NextResponse.json({error:"请选择会议纪要文件"},{status:400})
    const ext=extension(file.name);if(!allowed.has(ext))return NextResponse.json({error:"仅支持 DOCX、PDF、TXT、Markdown"},{status:400});if(file.size>30*1024*1024)return NextResponse.json({error:"文件不能超过30MB"},{status:400})
    const text=await extract(file,ext);if(!text)return NextResponse.json({error:"文件中没有可识别的文字"},{status:400})
    const path=`${user.id}/meetings/${id}/${randomUUID()}-${safeName(file.name)}`
    const {error:uploadError}=await serviceClient.storage.from("content-files").upload(path,Buffer.from(await file.arrayBuffer()),{contentType:file.type||"application/octet-stream"});if(uploadError)throw uploadError
    let draft:{summary?:string;decisions?:string}={summary:"",decisions:""};try{draft=parseJson(await runCodex(`只依据以下会议原文提取可核查的会议摘要与会议结论。不要生成后续行动，不要补写未出现的事实。摘要概括讨论重点；结论只写明确形成的决定，没有结论则返回空字符串。只输出JSON：{"summary":"","decisions":""}\n\n${text.slice(0,50000)}`,60000))}catch{}
    const now=new Date().toISOString()
    const savedSummary=draft.summary?.trim() || meeting.summary || null
    const savedDecisions=draft.decisions?.trim() || meeting.decisions || null
    const {error:updateError}=await serviceClient.from("meetings").update({meeting_file_name:file.name,meeting_storage_path:path,meeting_parse_status:"ready",meeting_uploaded_at:now,transcript:text,summary:savedSummary,decisions:savedDecisions,updated_at:now}).eq("id",id).eq("user_id",user.id)
    if(updateError)throw updateError
    return NextResponse.json({transcript:text,summary:savedSummary||"",decisions:savedDecisions||"",fileName:file.name,uploadedAt:now,archivedMonth:meeting.meeting_date?.slice(0,7)||now.slice(0,7)})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"会议文件处理失败"},{status:500})}
}
