import { randomUUID } from "crypto"
import { join } from "node:path"
import { NextResponse } from "next/server"
import mammoth from "mammoth"
import { PDFParse } from "pdf-parse"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { runCodex } from "@/lib/ai/codex"

const MAX_FILE_SIZE = 50 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(["docx", "pdf", "txt", "md"])
let pdfWorkerConfigured = false

function configurePdfWorker() {
  if (pdfWorkerConfigured) return
  // Next's development bundler relocates the PDF parser module. Give pdf.js an
  // explicit node_modules worker path so server-side PDF extraction does not
  // look for a non-existent worker inside `.next/server/chunks`.
  PDFParse.setWorker(join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"))
  pdfWorkerConfigured = true
}

function getExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() || ""
}

function safeFileName(name: string) {
  // Storage object keys use a conservative ASCII subset; keep the original
  // filename in content_files.file_name for display and downloads.
  const asciiName = name.normalize("NFKD").replace(/[^\x00-\x7F]/g, "-")
  return asciiName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 160) || "script"
}

function titleFromFile(name: string) {
  return name.replace(/\.[^.]+$/, "").trim().slice(0, 200) || "未命名剧本"
}

/**
 * A filename is the only reliable signal during quick batch uploads. Keep
 * episode numbers intact, but ignore cosmetic separators and common draft
 * suffixes such as V2 / 第2版 so a revised file lands on the same screenplay.
 */
function scriptKey(name: string) {
  return titleFromFile(name)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/(?:[\s._-]*(?:v(?:ersion)?\s*\d+|第?\s*\d+\s*版|修订稿|修改稿|终稿|最终版))$/i, "")
    .replace(/[\s_\-–—·・【】《》“”'"\[\]{}]/g, "")
    .trim()
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null) {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const message = typeof candidate.message === "string" ? candidate.message : "Upload failed"
    const details = typeof candidate.details === "string" ? `（${candidate.details}）` : ""
    const hint = typeof candidate.hint === "string" ? ` 提示：${candidate.hint}` : ""
    const code = typeof candidate.code === "string" ? ` [${candidate.code}]` : ""
    return `${message}${code}${details}${hint}`
  }
  return "Upload failed"
}

async function extractText(file: File, extension: string) {
  if (extension === "txt" || extension === "md") {
    return { text: await file.text(), status: "ready" as const, error: null }
  }
  if (extension === "docx") {
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await mammoth.extractRawText({ buffer })
      return { text: result.value.trim(), status: "ready" as const, error: null }
    } catch (error: unknown) {
      return { text: null, status: "failed" as const, error: errorMessage(error) }
    }
  }
  if (extension === "pdf") {
    configurePdfWorker()
    const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) })
    try {
      const result = await parser.getText()
      const text = result.text.trim()
      if (!text) return { text: null, status: "failed" as const, error: "PDF 未包含可提取文字，可能是扫描件" }
      return { text, status: "ready" as const, error: null }
    } catch (error: unknown) {
      return { text: null, status: "failed" as const, error: errorMessage(error) }
    } finally {
      await parser.destroy()
    }
  }
  return { text: null, status: "pending" as const, error: null }
}

function explicitLogline(text:string){
  const normalized=text.replace(/\r/g,"")
  const match=normalized.match(/(?:一句话(?:梗概|钩子|高概念)|高概念|故事简介|剧情梗概)\s*[：:]\s*([^\n]{8,240})/i)
  return match?.[1]?.trim().replace(/\s+/g," ").slice(0,160)||""
}

async function inferLogline(text:string){
  const explicit=explicitLogline(text);if(explicit)return explicit
  try{
    const result=await runCodex(`只依据下面剧本文本提炼一句客观、可核查的剧情梗概。中文不超过80个字，英文不超过160个字符；写清主角、核心处境和主要冲突，不添加原文没有的信息。只返回梗概正文。\n\n${text.slice(0,50000)}`,45000)
    return result.replace(/^['“”\s]+|['“”\s]+$/g,"").replace(/\s+/g," ").slice(0,160)
  }catch{return ""}
}

export async function POST(request: Request) {
  let createdContentId: string | null = null
  let storagePath: string | null = null

  try {
    const { user, response } = await requireUser()
    if (response) return response

    const form = await request.formData()
    const file = form.get("file")
    const requestedContentId = form.get("contentId")
    const contentType = form.get("contentType")
    const requestedUploadId = form.get("uploadId")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择剧本文件" }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "文件必须小于 50MB" }, { status: 400 })
    }

    const extension = getExtension(file.name)
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: "仅支持 DOCX、PDF、TXT、Markdown" }, { status: 400 })
    }
    const uploadId = typeof requestedUploadId === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requestedUploadId)
      ? requestedUploadId
      : null

    const safeType = ["submission", "development", "benchmark", "original"].includes(String(contentType))
      ? String(contentType)
      : "submission"
    let contentId = typeof requestedContentId === "string" ? requestedContentId : ""
    let matchedExisting = false
    if (contentId) {
      const { data, error } = await serviceClient
        .from("contents")
        .select("id")
        .eq("id", contentId)
        .eq("user_id", user.id)
        .single()
      if (error || !data) return NextResponse.json({ error: "内容项目不存在" }, { status: 404 })
    } else {
      const incomingKey = scriptKey(file.name)
      const { data: candidates, error: duplicateLookupError } = await serviceClient
        .from("contents")
        .select("id,title")
        .eq("user_id", user.id)
        .eq("content_type", safeType)
        .order("updated_at", { ascending: false })
        .limit(1000)
      if (duplicateLookupError) throw duplicateLookupError

      const existing = (candidates || []).find((candidate) => scriptKey(candidate.title) === incomingKey)
      if (existing) {
        contentId = existing.id
        matchedExisting = true
      } else {
        const { data, error } = await serviceClient
          .from("contents")
          .insert({ user_id: user.id, title: titleFromFile(file.name), content_type: safeType, status: "parsing" })
          .select("id")
          .single()
        if (error) throw error
        contentId = data.id
        createdContentId = data.id
      }
    }

    if (uploadId) {
      const { data: completedUpload, error: completedUploadError } = await serviceClient
        .from("content_files")
        .select("*")
        .eq("user_id", user.id)
        .eq("content_id", contentId)
        .like("storage_path", `%/${uploadId}-%`)
        .maybeSingle()
      if (completedUploadError) throw completedUploadError
      if (completedUpload) {
        return NextResponse.json({ contentId, file: completedUpload, created: false, updatedVersion: true, resumed: true })
      }
    }

    const { data: latestFile, error: versionError } = await serviceClient
      .from("content_files")
      .select("version")
      .eq("content_id", contentId)
      .eq("user_id", user.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (versionError) throw versionError
    const version = (latestFile?.version || 0) + 1

    storagePath = `${user.id}/${contentId}/${uploadId || randomUUID()}-${safeFileName(file.name)}`
    const bytes = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await serviceClient.storage
      .from("content-files")
      .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false })
    if (uploadError) throw uploadError

    const extracted = await extractText(file, extension)
    const { data: fileRecord, error: recordError } = await serviceClient
      .from("content_files")
      .insert({
        content_id: contentId,
        user_id: user.id,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        size_bytes: file.size,
        version,
        extracted_text: extracted.text,
        parse_status: extracted.status,
        parse_error: extracted.error,
        is_primary: true,
      })
      .select()
      .single()
    if (recordError) throw recordError

    const contentStatus = extracted.status === "ready" ? "ready" : extracted.status === "failed" ? "pending" : "parsing"
    const logline=extracted.text?await inferLogline(extracted.text):""
    const { error: statusError } = await serviceClient
      .from("contents")
      .update({ status: contentStatus, ...(logline?{logline}:{}), updated_at: new Date().toISOString() })
      .eq("id", contentId)
      .eq("user_id", user.id)
    if (statusError) throw statusError

    return NextResponse.json({ contentId, file: fileRecord, created: Boolean(createdContentId), updatedVersion: matchedExisting }, { status: 201 })
  } catch (error: unknown) {
    if (storagePath) await serviceClient.storage.from("content-files").remove([storagePath])
    if (createdContentId) await serviceClient.from("contents").delete().eq("id", createdContentId)
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
