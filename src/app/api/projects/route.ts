import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"

export const dynamic = "force-dynamic"

const projectSchema = z.object({
  title: z.string().trim().min(1).max(300), market: z.string().max(100).nullable().optional(), genre: z.string().max(100).nullable().optional(),
  stage: z.string().max(100).optional(), progress: z.number().int().min(0).max(100).optional(), status: z.enum(["active","deferred","paused","completed","archived"]).optional(),
  next_action: z.string().max(3000).nullable().optional(), due_date: z.string().max(30).nullable().optional(), risk: z.string().max(3000).nullable().optional(), notes: z.string().max(20000).nullable().optional(),
  content_id: z.string().uuid().nullable().optional(), linked_idea_id: z.string().uuid().nullable().optional(),
})

export async function GET() {
  const { user, response } = await requireUser()
  if (response) return response
  const access = await requireWorkspaceAccess(user.id, "projects", "view")
  if (!access) return NextResponse.json({ error: "没有项目推进查看权限" }, { status: 403 })
  const { data, error } = await serviceClient.from("projects").select("*").eq("user_id", access.ownerId).order("updated_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ projects: data || [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(); if (response) return response
  const access = await requireWorkspaceAccess(user.id, "projects", "edit"); if (!access) return NextResponse.json({ error: "没有项目推进编辑权限" }, { status: 403 })
  const parsed = projectSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "项目数据不完整" }, { status: 400 })
  const { data: latest } = await serviceClient.from("projects").select("project_no").eq("user_id", access.ownerId).order("project_no", { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await serviceClient.from("projects").insert({ ...parsed.data, user_id: access.ownerId, project_no: Number(latest?.project_no || 0) + 1 }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ project: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireUser(); if (response) return response
  const access = await requireWorkspaceAccess(user.id, "projects", "edit"); if (!access) return NextResponse.json({ error: "没有项目推进编辑权限" }, { status: 403 })
  const body = await request.json().catch(() => null); const id = z.string().uuid().safeParse(body?.id); const parsed = projectSchema.partial().safeParse(body)
  if (!id.success || !parsed.success) return NextResponse.json({ error: "项目数据无效" }, { status: 400 })
  const { id: _ignored, ...updates } = body as Record<string, unknown>; void _ignored
  const safe = projectSchema.partial().parse(updates)
  const { data, error } = await serviceClient.from("projects").update({ ...safe, updated_at: new Date().toISOString() }).eq("id", id.data).eq("user_id", access.ownerId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ project: data })
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireUser(); if (response) return response
  const access = await requireWorkspaceAccess(user.id, "projects", "edit"); if (!access) return NextResponse.json({ error: "没有项目推进编辑权限" }, { status: 403 })
  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get("id")); if (!id.success) return NextResponse.json({ error: "项目编号无效" }, { status: 400 })
  const { error } = await serviceClient.from("projects").delete().eq("id", id.data).eq("user_id", access.ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ success: true })
}
