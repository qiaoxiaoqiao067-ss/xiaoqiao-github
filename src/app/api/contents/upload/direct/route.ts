import { NextResponse } from "next/server"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"
import { extractScript, SCRIPT_EXTENSIONS } from "@/lib/content/extract-script"

export const runtime = "nodejs"
export const maxDuration = 300

const MAX_FILE_SIZE = 50 * 1024 * 1024
const ALLOWED_EXTENSIONS = SCRIPT_EXTENSIONS

function extensionOf(name: string) { return name.split(".").pop()?.toLowerCase() || "" }
function titleFromFile(name: string) { return name.replace(/\.[^.]+$/, "").trim().slice(0, 200) || "未命名剧本" }
function safeFileName(name: string) {
  const ascii = name.normalize("NFKD").replace(/[^\x00-\x7F]/g, "-")
  return ascii.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 160) || "script"
}
function scriptKey(name: string) {
  return titleFromFile(name).normalize("NFKC").toLocaleLowerCase("zh-CN")
    .replace(/(?:[\s._-]*(?:v(?:ersion)?\s*\d+|第?\s*\d+\s*版|修订稿|修改稿|终稿|最终版))$/i, "")
    .replace(/[\s_\-–—·・【】《》“”'"\[\]{}]/g, "").trim()
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "大文件上传失败" }
function validUploadId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
}
function explicitLogline(text: string) {
  const match = text.replace(/\r/g, "").match(/(?:一句话(?:梗概|钩子|高概念)|高概念|故事简介|剧情梗概)\s*[：:]\s*([^\n]{8,240})/i)
  return match?.[1]?.trim().replace(/\s+/g, " ").slice(0, 160) || ""
}
const extract = extractScript

export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const access = await requireWorkspaceAccess(user.id, "content", "edit")
    if (!access) return NextResponse.json({ error: "没有责编审稿编辑权限" }, { status: 403 })
    const ownerId = access.ownerId
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action || "")
    const fileName = typeof body.fileName === "string" ? body.fileName : ""
    const fileSize = Number(body.fileSize)
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "application/octet-stream"
    const extension = extensionOf(fileName)
    if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) return NextResponse.json({ error: "文件必须小于 50MB" }, { status: 400 })
    if (!ALLOWED_EXTENSIONS.has(extension)) return NextResponse.json({ error: "支持 PDF（含扫描件）、DOC/DOCX、TXT、Markdown、PNG/JPG/WebP" }, { status: 400 })
    if (!validUploadId(body.uploadId)) return NextResponse.json({ error: "上传任务标识无效，请重新选择文件" }, { status: 400 })
    const uploadId = body.uploadId

    if (action === "init") {
      const safeType = ["submission", "development", "benchmark", "original"].includes(String(body.contentType)) ? String(body.contentType) : "submission"
      let contentId = typeof body.contentId === "string" ? body.contentId : ""
      let matchedExisting = false
      if (contentId) {
        const { data } = await serviceClient.from("contents").select("id").eq("id", contentId).eq("user_id", ownerId).maybeSingle()
        if (!data) return NextResponse.json({ error: "内容项目不存在" }, { status: 404 })
      } else {
        const { data: candidates, error } = await serviceClient.from("contents").select("id,title").eq("user_id", ownerId).eq("content_type", safeType).order("updated_at", { ascending: false }).limit(1000)
        if (error) throw error
        const existing = (candidates || []).find((candidate) => scriptKey(candidate.title) === scriptKey(fileName))
        if (existing) { contentId = existing.id; matchedExisting = true }
        else {
          const { data, error: createError } = await serviceClient.from("contents").insert({ user_id: ownerId, title: titleFromFile(fileName), content_type: safeType, status: "parsing" }).select("id").single()
          if (createError) throw createError
          contentId = data.id
        }
      }
      const storagePath = `${ownerId}/${contentId}/${uploadId}-${safeFileName(fileName)}`
      const { data: completed } = await serviceClient.from("content_files").select("id").eq("user_id", ownerId).eq("content_id", contentId).eq("storage_path", storagePath).maybeSingle()
      if (completed) return NextResponse.json({ completed: true, contentId, matchedExisting })
      const { data: signed, error: signedError } = await serviceClient.storage.from("content-files").createSignedUploadUrl(storagePath, { upsert: true })
      if (signedError) throw signedError
      return NextResponse.json({ completed: false, contentId, storagePath, token: signed.token, matchedExisting })
    }

    if (action === "finalize") {
      const contentId = typeof body.contentId === "string" ? body.contentId : ""
      const storagePath = typeof body.storagePath === "string" ? body.storagePath : ""
      const expectedPath = `${ownerId}/${contentId}/${uploadId}-${safeFileName(fileName)}`
      if (!contentId || storagePath !== expectedPath) return NextResponse.json({ error: "上传路径校验失败" }, { status: 400 })
      const { data: content } = await serviceClient.from("contents").select("id").eq("id", contentId).eq("user_id", ownerId).maybeSingle()
      if (!content) return NextResponse.json({ error: "内容项目不存在" }, { status: 404 })
      const { data: completed } = await serviceClient.from("content_files").select("*").eq("user_id", ownerId).eq("content_id", contentId).eq("storage_path", storagePath).maybeSingle()
      if (completed) return NextResponse.json({ contentId, file: completed, resumed: true, updatedVersion: Boolean(body.matchedExisting) })
      const { data: blob, error: downloadError } = await serviceClient.storage.from("content-files").download(storagePath)
      if (downloadError || !blob) throw downloadError || new Error("无法读取已上传文件")
      const buffer = Buffer.from(await blob.arrayBuffer())
      if (buffer.length !== fileSize) throw new Error("文件上传不完整，请点击继续上传")
      const parsed = await extract(buffer, extension)
      const { data: latest } = await serviceClient.from("content_files").select("version").eq("content_id", contentId).eq("user_id", ownerId).order("version", { ascending: false }).limit(1).maybeSingle()
      const { data: record, error: recordError } = await serviceClient.from("content_files").insert({ content_id: contentId, user_id: ownerId, file_name: fileName, storage_path: storagePath, mime_type: mimeType, size_bytes: fileSize, version: (latest?.version || 0) + 1, extracted_text: parsed.text, parse_status: parsed.status, parse_error: parsed.error, is_primary: true }).select().single()
      if (recordError) throw recordError
      const logline = parsed.text ? explicitLogline(parsed.text) : ""
      const { error: updateError } = await serviceClient.from("contents").update({ status: parsed.status === "ready" ? "ready" : "pending", ...(logline ? { logline } : {}), updated_at: new Date().toISOString() }).eq("id", contentId).eq("user_id", ownerId)
      if (updateError) throw updateError
      return NextResponse.json({ contentId, file: record, updatedVersion: Boolean(body.matchedExisting) }, { status: 201 })
    }
    return NextResponse.json({ error: "未知上传操作" }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
