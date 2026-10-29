import { join } from "node:path"
import { NextResponse } from "next/server"
import mammoth from "mammoth"
import { PDFParse } from "pdf-parse"
import { serviceClient } from "@/lib/supabase/service"
import { requireUser } from "@/lib/supabase/require-user"
import { runCodex } from "@/lib/ai/codex"

const BUCKET = "content-files"
let pdfWorkerConfigured = false

type ContractInfo = { party_a?:string; party_b?:string; amount?:string; copyright_scope?:string; authorization_term?:string; territory?:string; payment_terms?:string; delivery_terms?:string; invoice_terms?:string; effective_date?:string; uncertainties?:string[]; reviewed?:boolean }
type AssetMeta = { storage_path?:string; file_name?:string; mime_type?:string; file_size?:number; stage?:string; timeline_item_id?:string|null; description?:string; contract_info?:ContractInfo; kind?:string }

function decodeMeta(notes:unknown):AssetMeta { if(typeof notes!=="string")return{};try{const parsed=JSON.parse(notes);return parsed&&typeof parsed==="object"?parsed:{}}catch{return{description:notes}} }
function errorMessage(error:unknown){return error instanceof Error?error.message:"合同识别失败"}
function extension(name:string){return name.split(".").pop()?.toLowerCase()||""}
function parseJson(raw:string){const fenced=raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]||raw;const start=fenced.indexOf("{");const end=fenced.lastIndexOf("}");if(start<0||end<=start)throw new Error("AI 未返回可解析的合同字段");return JSON.parse(fenced.slice(start,end+1)) as ContractInfo}

async function extractText(buffer:Buffer,name:string){const ext=extension(name);if(ext==="txt"||ext==="md")return buffer.toString("utf8");if(ext==="docx")return (await mammoth.extractRawText({buffer})).value.trim();if(ext==="pdf"){if(!pdfWorkerConfigured){PDFParse.setWorker(join(process.cwd(),"node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"));pdfWorkerConfigured=true}const parser=new PDFParse({data:new Uint8Array(buffer)});try{return (await parser.getText()).text.trim()}finally{await parser.destroy()}}throw new Error("合同识别仅支持 DOCX、PDF、TXT、Markdown")}

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {user,response}=await requireUser();if(response)return response
    const {id}=await params
    const {data:asset,error}=await serviceClient.from("project_files").select("*").eq("id",id).eq("user_id",user.id).single()
    if(error||!asset)return NextResponse.json({error:"合同文件不存在"},{status:404})
    const meta=decodeMeta(asset.notes);if(!meta.storage_path)return NextResponse.json({error:"该记录没有可读取的合同文件"},{status:400})
    const {data:file,error:downloadError}=await serviceClient.storage.from(BUCKET).download(meta.storage_path)
    if(downloadError||!file)return NextResponse.json({error:downloadError?.message||"合同文件下载失败"},{status:500})
    const text=await extractText(Buffer.from(await file.arrayBuffer()),meta.file_name||String(asset.title||"contract"))
    if(!text.trim())return NextResponse.json({error:"合同没有可提取文字，扫描件请先完成 OCR"},{status:400})
    const raw=await runCodex(`你是剧本采购合同信息提取助手。只依据合同原文提取字段，不得猜测；缺失字段返回空字符串，歧义或矛盾写入 uncertainties。合同类型统一视为“剧本采购”，其中可能同时包含版权授权和编剧委托。付款、发票、交稿都是可选信息，不要把它们推断为强制流程。只返回 JSON 对象，不要 Markdown。字段：party_a, party_b, amount, copyright_scope, authorization_term, territory, payment_terms, delivery_terms, invoice_terms, effective_date, uncertainties。\n\n合同原文：\n${text.slice(0,60000)}`,90000)
    const contractInfo={...parseJson(raw),reviewed:false}
    const nextMeta={...meta,contract_info:contractInfo,kind:"project_asset_v1"}
    const {data:updated,error:updateError}=await serviceClient.from("project_files").update({notes:JSON.stringify(nextMeta),updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",user.id).select().single()
    if(updateError)return NextResponse.json({error:updateError.message},{status:500})
    return NextResponse.json({file:{...updated,...nextMeta,notes:nextMeta.description||null}})
  }catch(error:unknown){return NextResponse.json({error:errorMessage(error)},{status:500})}
}
