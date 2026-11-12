import { createHash } from "node:crypto"
import { z } from "zod"
import type { ScriptSource } from "./types"

export const MAX_UPLOADED_SOURCE_BYTES = 4 * 1024 * 1024
export const MAX_STORED_SOURCE_BYTES = 50 * 1024 * 1024
const SOURCE_EXTENSIONS = new Set(["docx", "doc", "pdf", "txt", "md"])
const sourceRequest = z.object({ projectFileId: z.string().uuid().optional(), contentFileId: z.string().uuid().optional() }).strict()
  .refine(value => Number(Boolean(value.projectFileId)) + Number(Boolean(value.contentFileId)) === 1)

type Access = { ownerId: string }
export type StoredProjectSource = { id: string; user_id: string; project_id: string; title: string; version: number; notes: unknown }
export type StoredContentSource = { id: string; user_id: string; content_id: string; file_name: string; storage_path: string; size_bytes: number; version: number }
export type SourceDependencies = {
  authenticate: () => Promise<{ user: { id: string } | null; response: Response | null }>
  access: (userId: string, module: "content" | "projects") => Promise<Access | null>
  projectFile: (id: string, ownerId: string) => Promise<StoredProjectSource | null>
  contentFile: (id: string, ownerId: string) => Promise<StoredContentSource | null>
  parentOwned: (kind: "projects" | "contents", id: string, ownerId: string) => Promise<boolean>
  storageSize: (path: string) => Promise<number>
  download: (path: string) => Promise<Blob>
  parseLocal: (bytes: Uint8Array, fileName: string) => Promise<ScriptSource>
  fromText: (text: string, fileName: string, format: string) => Promise<ScriptSource>
  extractPdf: (bytes: Uint8Array) => Promise<string>
  extractDoc: (bytes: Uint8Array) => Promise<string>
}

export class SourceRequestError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
function extensionOf(fileName: string) { return fileName.split(".").pop()?.toLowerCase() || "" }
function validateFile(fileName: string, size: number, limit: number) {
  if (!SOURCE_EXTENSIONS.has(extensionOf(fileName))) throw new SourceRequestError(400, "统计支持 DOCX、DOC、PDF、TXT、Markdown 原稿。")
  if (!Number.isSafeInteger(size) || size <= 0) throw new SourceRequestError(400, "原文件大小无效或文件为空，请重新上传。")
  if (size > limit) throw new SourceRequestError(413, limit === MAX_UPLOADED_SOURCE_BYTES
    ? "服务端临时上传最多 4MB；大 DOCX/TXT/MD 请使用本机解析，或选择项目已保存的原件。"
    : "已保存的原件最多支持 50MB，请按集拆分后重试。")
}

export async function readBoundedBytes(request: Pick<Request, "headers" | "body">, limit: number) {
  const length = request.headers.get("content-length")
  if (length && Number(length) > limit) {
    await request.body?.cancel()
    throw new SourceRequestError(413, "请求超过大小限制，请拆分文件或使用本机解析。")
  }
  if (!request.body) throw new SourceRequestError(400, "请求没有内容。")
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new SourceRequestError(413, "请求超过大小限制，请拆分文件或使用本机解析。")
      }
      parts.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let position = 0
  for (const part of parts) { bytes.set(part, position); position += part.byteLength }
  return bytes
}

function projectMeta(notes: unknown): Record<string, unknown> {
  if (typeof notes !== "string") return {}
  try { const value = JSON.parse(notes); return value && typeof value === "object" && !Array.isArray(value) ? value : {} } catch { return {} }
}
function validPath(path: string, prefix: string) {
  return path.startsWith(prefix) && path.length > prefix.length && !/[\\\0?#%]/.test(path)
    && !path.split("/").some(segment => !segment || segment === "." || segment === "..")
}

async function parseBytes(bytes: Uint8Array, name: string, deps: SourceDependencies) {
  try {
    const extension = extensionOf(name)
    let source: ScriptSource
    if (extension === "pdf" || extension === "doc") {
      if (extension === "pdf" && Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") throw new Error("文件扩展名是 PDF，但原件格式不匹配。")
      const text = extension === "pdf" ? await deps.extractPdf(bytes) : await deps.extractDoc(bytes)
      if (!text.trim()) throw new Error("未识别到有效正文，请上传可阅读的原件。")
      source = await deps.fromText(text, name, extension)
      source.requiresReview = true
      source.warnings = [...source.warnings, extension === "pdf"
        ? "PDF 的版面、分页或 OCR 可能造成漏字、错字或角色换行混合；请逐页对照原件并复核台词，当前结果不能直接作为精确报价。"
        : "旧版 DOC 提取可能丢失换行或批注/修订边界；请核对完整集数、正文与台词，当前结果不能直接作为精确报价。"]
    } else source = await deps.parseLocal(bytes, name)
    return { ...source, sourceHash: createHash("sha256").update(bytes).digest("hex") }
  } catch (error) {
    if (error instanceof SourceRequestError) throw error
    throw new SourceRequestError(422, error instanceof Error ? error.message : "原件解析失败，请检查文件。")
  }
}

async function storedBytes(path: string, name: string, recordedSize: number, deps: SourceDependencies) {
  validateFile(name, recordedSize, MAX_STORED_SOURCE_BYTES)
  // Check the storage object's actual size before downloading, then compare
  // the returned object and byte buffer to the recorded immutable version.
  const actualSize = await deps.storageSize(path)
  validateFile(name, actualSize, MAX_STORED_SOURCE_BYTES)
  if (actualSize !== recordedSize) throw new SourceRequestError(409, "原件大小与版本记录不一致，请重新上传原件后再统计。")
  const blob = await deps.download(path)
  if (blob.size !== recordedSize) throw new SourceRequestError(409, "原件下载不完整或文件已改变，请重试。")
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.byteLength !== recordedSize) throw new SourceRequestError(409, "原件下载不完整，请重试。")
  return parseBytes(bytes, name, deps)
}

/** All paths are read-only. No submission, AI review, upload or DB write occurs. */
export async function handleScriptSource(request: Request, deps: SourceDependencies) {
  try {
    const auth = await deps.authenticate()
    if (auth.response) return auth.response
    if (!auth.user) return json({ error: "Unauthorized" }, 401)
    const userId = auth.user.id
    const contentType = request.headers.get("content-type") || ""
    if (contentType.toLowerCase().startsWith("multipart/form-data")) {
      const projectAccess = await deps.access(userId, "projects")
      const contentAccess = projectAccess ? null : await deps.access(userId, "content")
      if (!projectAccess && !contentAccess) return json({ error: "需要项目推进或责编审稿的查看权限。" }, 403)
      const bytes = await readBoundedBytes(request, MAX_UPLOADED_SOURCE_BYTES + 128 * 1024)
      let form: FormData
      try { form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData() } catch { throw new SourceRequestError(400, "上传表单无效，请重新选择文件。") }
      const file = form.get("file")
      if (!(file instanceof File) || form.getAll("file").length !== 1) throw new SourceRequestError(400, "请选择一份原稿文件。")
      validateFile(file.name, file.size, MAX_UPLOADED_SOURCE_BYTES)
      return json({ source: await parseBytes(new Uint8Array(await file.arrayBuffer()), file.name, deps) })
    }
    if (!contentType.toLowerCase().startsWith("application/json")) throw new SourceRequestError(415, "请上传原稿文件，或选择一个已保存的文件。")
    let value: unknown
    try { value = JSON.parse(new TextDecoder().decode(await readBoundedBytes(request, 8192))) } catch (error) {
      if (error instanceof SourceRequestError) throw error
      throw new SourceRequestError(400, "请求内容不是有效 JSON。")
    }
    const parsed = sourceRequest.safeParse(value)
    if (!parsed.success) throw new SourceRequestError(400, "请提供且只提供一个有效的 projectFileId 或 contentFileId。")
    if (parsed.data.projectFileId) {
      const access = await deps.access(userId, "projects")
      if (!access) return json({ error: "没有项目推进查看权限。" }, 403)
      const row = await deps.projectFile(parsed.data.projectFileId, access.ownerId)
      if (!row || row.user_id !== access.ownerId || !await deps.parentOwned("projects", row.project_id, access.ownerId)) return json({ error: "项目文件不存在或无权访问。" }, 404)
      const meta = projectMeta(row.notes)
      const name = typeof meta.file_name === "string" ? meta.file_name : row.title
      let source: ScriptSource
      if (typeof meta.storage_path === "string" && meta.storage_path) {
        if (!validPath(meta.storage_path, `${access.ownerId}/projects/${row.project_id}/`)) return json({ error: "项目原件路径与所属项目不一致，请重新上传。" }, 409)
        source = await storedBytes(meta.storage_path, name, Number(meta.file_size), deps)
      } else if (typeof meta.text_content === "string" && meta.text_content.trim()) {
        const bytes = Buffer.byteLength(meta.text_content, "utf8")
        if (bytes > MAX_STORED_SOURCE_BYTES) throw new SourceRequestError(413, "文字资料超过50MB，请按集拆分。")
        source = await deps.fromText(meta.text_content, row.title, "project-text")
        source.warnings = [...source.warnings, "本次使用项目文字资料正文；请确认资料是完整剧本，并核对正文起点、集数和说明文字。"]
      } else return json({ error: "该历史记录没有可读取的原件或文字正文，请重新上传原稿。" }, 400)
      return json({ source: { ...source, fileId: row.id, fileKind: "project", projectId: row.project_id, sourceVersion: row.version } })
    }
    const access = await deps.access(userId, "content")
    if (!access) return json({ error: "没有责编审稿查看权限。" }, 403)
    const row = await deps.contentFile(parsed.data.contentFileId!, access.ownerId)
    if (!row || row.user_id !== access.ownerId || !await deps.parentOwned("contents", row.content_id, access.ownerId)) return json({ error: "收稿文件不存在或无权访问。" }, 404)
    if (!validPath(row.storage_path, `${access.ownerId}/${row.content_id}/`)) return json({ error: "收稿原件路径与所属内容不一致，请重新上传。" }, 409)
    const source = await storedBytes(row.storage_path, row.file_name, Number(row.size_bytes), deps)
    return json({ source: { ...source, fileId: row.id, fileKind: "content", sourceVersion: row.version } })
  } catch (error) {
    return error instanceof SourceRequestError ? json({ error: error.message }, error.status) : json({ error: "读取原稿失败，请稍后重试。" }, 500)
  }
}
