import { NextResponse } from "next/server"
import { z } from "zod"
import { serviceClient } from "@/lib/supabase/service"
import { requireUser } from "@/lib/supabase/require-user"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"
import { localizationHistoryRows, retiredLocalizationResponse } from "@/lib/statistics/localization-history"

function missingTable(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "42P01" || /does not exist|schema cache/i.test(error.message || "")))
}
function parseDocument(row: Record<string, unknown>) {
  let payload: Record<string, unknown> = {}
  try { const parsed = JSON.parse(String(row.content || "{}")); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed } catch { /* Keep an unreadable old record visible by its stored title. */ }
  return { ...payload, id: row.id, user_id: row.user_id, title: row.title, created_at: row.created_at, updated_at: row.updated_at }
}

/** Historical records remain accessible; generation and mutation are retired. */
export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const access = await requireWorkspaceAccess(user.id, "projects", "view")
    if (!access) return NextResponse.json({ error: "没有项目推进查看权限。" }, { status: 403 })
    const requestedProject = new URL(request.url).searchParams.get("projectId") || undefined
    if (requestedProject && !z.string().uuid().safeParse(requestedProject).success) return NextResponse.json({ error: "项目标识无效。" }, { status: 400 })
    const { data: projects, error: projectError } = await serviceClient.from("projects").select("id").eq("user_id", access.ownerId)
    if (projectError) throw projectError
    const projectIds = new Set<string>((projects || []).map(row => row.id))
    if (requestedProject && !projectIds.has(requestedProject)) return NextResponse.json({ error: "项目不存在或无权访问。" }, { status: 404 })
    const [jobs, files, documents] = await Promise.all([
      serviceClient.from("localization_jobs").select("*").eq("user_id", access.ownerId).order("updated_at", { ascending: false }),
      serviceClient.from("project_files").select("*").eq("user_id", access.ownerId).order("created_at", { ascending: false }),
      serviceClient.from("documents").select("*").eq("user_id", access.ownerId).in("category", ["本地化任务", "项目文件档案"]).order("updated_at", { ascending: false }),
    ])
    for (const result of [jobs, files, documents]) if (result.error && !missingTable(result.error)) throw result.error
    const legacyJobs = (documents.data || []).filter(row => row.category === "本地化任务").map(row => parseDocument(row))
    const legacyFiles = (documents.data || []).filter(row => row.category === "项目文件档案").map(row => parseDocument(row))
    const allJobs = localizationHistoryRows([...(jobs.data || []), ...legacyJobs], access.ownerId, projectIds, "job", requestedProject)
    const allFiles = localizationHistoryRows([...(files.data || []), ...legacyFiles], access.ownerId, projectIds, "file", requestedProject)
    return NextResponse.json({ jobs: allJobs, files: allFiles, readOnly: true, storage: "historical" }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "历史本地化记录暂时无法读取，请稍后重试。" }, { status: 500 })
  }
}

// No auth/database/AI operations occur for retired write methods.
export async function POST() { return retiredLocalizationResponse() }
export async function PATCH() { return retiredLocalizationResponse() }
export async function DELETE() { return retiredLocalizationResponse() }
