import { requireUser } from "@/lib/supabase/require-user"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"
import { serviceClient } from "@/lib/supabase/service"
import { extractPdfText } from "@/lib/pdf/extract-text"
import { extractScript } from "@/lib/content/extract-script"
import { parseLocalScript, sourceFromText } from "@/lib/statistics/extract"
import { handleScriptSource, MAX_STORED_SOURCE_BYTES, readBoundedBytes, SourceRequestError } from "@/lib/statistics/server-source"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  return handleScriptSource(request, {
    authenticate: requireUser,
    access: (userId, module) => requireWorkspaceAccess(userId, module, "view"),
    projectFile: async (id, ownerId) => {
      const { data, error } = await serviceClient.from("project_files").select("id,user_id,project_id,title,version,notes").eq("id", id).eq("user_id", ownerId).maybeSingle()
      if (error) throw error
      return data
    },
    contentFile: async (id, ownerId) => {
      const { data, error } = await serviceClient.from("content_files").select("id,user_id,content_id,file_name,storage_path,size_bytes,version").eq("id", id).eq("user_id", ownerId).maybeSingle()
      if (error) throw error
      return data
    },
    parentOwned: async (kind, id, ownerId) => {
      const { data, error } = await serviceClient.from(kind).select("id").eq("id", id).eq("user_id", ownerId).maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
    storageSize: async path => {
      const { data, error } = await serviceClient.storage.from("content-files").info(path)
      if (error || !data) throw new SourceRequestError(404, "原文件不存在或暂时无法读取，请重新上传原稿。")
      return Number(data.size)
    },
    download: async path => {
      const { data, error } = await serviceClient.storage.from("content-files").createSignedUrl(path, 60)
      if (error || !data) throw new SourceRequestError(502, "原文件下载失败，请稍后重试。")
      const response = await fetch(data.signedUrl, { cache: "no-store", signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new SourceRequestError(502, "原文件下载失败，请稍后重试。")
      // Cap the byte stream as well as Storage metadata, including an object
      // replaced between the info check and download. No partial text is used.
      const bytes = await readBoundedBytes(response, MAX_STORED_SOURCE_BYTES)
      return new Blob([bytes])
    },
    parseLocal: parseLocalScript,
    fromText: sourceFromText,
    extractPdf: extractPdfText,
    extractDoc: async bytes => {
      const parsed = await extractScript(Buffer.from(bytes), "doc")
      if (!parsed.text || parsed.status !== "ready") throw new Error(parsed.error || "旧版DOC未识别到有效正文。")
      return parsed.text
    },
  })
}
