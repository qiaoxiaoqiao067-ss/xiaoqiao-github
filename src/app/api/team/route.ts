import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"

const MODULES = ["content", "projects", "market_data", "discover"] as const
const moduleLabel: Record<(typeof MODULES)[number], string> = { content: "责编审稿", projects: "项目推进", market_data: "市场数据看板", discover: "选题情报" }
const inviteSchema = z.object({ email: z.string().trim().email(), role: z.enum(["collaborator", "viewer"]).default("collaborator"), modules: z.array(z.enum(MODULES)).min(1).max(4) })

async function ownerWorkspace(userId: string) {
  const { data, error } = await serviceClient.from("workspaces").select("id,name,owner_id").eq("owner_id", userId).maybeSingle()
  if (error) throw error
  return data
}

async function memberWorkspace(userId: string) {
  const { data: membership, error: membershipError } = await serviceClient
    .from("workspace_members")
    .select("workspace_id,role,status")
    .eq("user_id", userId)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) return null
  const { data: workspace, error: workspaceError } = await serviceClient
    .from("workspaces")
    .select("id,name,owner_id")
    .eq("id", membership.workspace_id)
    .maybeSingle()
  if (workspaceError) throw workspaceError
  return workspace ? { workspace, membership } : null
}

export async function GET() {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const owned = await ownerWorkspace(user.id)
    const access = owned ? { workspace: owned, membership: { role: "owner", status: "active" } } : await memberWorkspace(user.id)
    if (!access) return NextResponse.json({ configured: true, role: "none", status: "pending", modules: [] })
    const { workspace, membership } = access
    const { data: members, error: membersError } = await serviceClient.from("workspace_members").select("user_id,role,status,invited_email,created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: true })
    if (membersError) throw membersError
    const userIds = (members || []).map((member) => member.user_id)
    const { data: profiles } = await serviceClient.from("users").select("id,email,name").in("id", userIds)
    const { data: permissions, error: permissionError } = await serviceClient.from("workspace_module_permissions").select("user_id,module_key,can_view,can_edit").eq("workspace_id", workspace.id)
    if (permissionError) throw permissionError
    const active = membership.status === "active"
    return NextResponse.json({ configured: true, workspace, role: membership.role, status: membership.status, modules: MODULES.map((key) => ({ key, label: moduleLabel[key], canView: active && (membership.role === "owner" || Boolean((permissions || []).find((item) => item.user_id === user.id && item.module_key === key)?.can_view)), canEdit: active && membership.role === "owner" })), members: (members || []).map((member) => ({ ...member, profile: (profiles || []).find((profile) => profile.id === member.user_id) || null, permissions: (permissions || []).filter((permission) => permission.user_id === member.user_id) })) })
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : String(error || "团队权限读取失败")
    return NextResponse.json({ error: `团队权限读取失败：${detail}` }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const workspace = await ownerWorkspace(user.id)
    if (!workspace) return NextResponse.json({ error: "请先运行 supabase/team_access_mvp.sql" }, { status: 424 })
    const parsed = inviteSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "请输入有效邮箱并至少选择一个模块" }, { status: 400 })
    const email = parsed.data.email.toLowerCase()
    // 先查找已注册账号。已注册成员不再重复发邀请邮件，直接授予工作台权限。
    const { data: existing, error: listError } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listError) throw listError
    let invitedUserId = existing.users.find((candidate) => candidate.email?.toLowerCase() === email)?.id
    let inviteSent = false

    if (!invitedUserId) {
      return NextResponse.json({ error: "该邮箱尚未注册。请让对方先在工作台注册，注册后你再回来点击“授权访问”。" }, { status: 400 })
    }
    if (!invitedUserId) return NextResponse.json({ error: "邀请已发送，但暂时无法取得成员账号，请稍后刷新" }, { status: 202 })
    // 只有管理员在后台点“授权”后才可进入；团队成员统一只读。
    const { error: memberError } = await serviceClient.from("workspace_members").upsert({ workspace_id: workspace.id, user_id: invitedUserId, role: "viewer", status: "active", invited_email: email, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,user_id" })
    if (memberError) throw memberError
    await serviceClient.from("workspace_module_permissions").delete().eq("workspace_id", workspace.id).eq("user_id", invitedUserId)
    const { error: permissionError } = await serviceClient.from("workspace_module_permissions").insert(parsed.data.modules.map((module_key) => ({ workspace_id: workspace.id, user_id: invitedUserId, module_key, can_view: true, can_edit: false })))
    if (permissionError) throw permissionError
    return NextResponse.json({ ok: true, email, inviteSent, modules: parsed.data.modules.map((key) => moduleLabel[key]) })
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : String(error || "邀请成员失败")
    return NextResponse.json({ error: `邀请成员失败：${detail}` }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const workspace = await ownerWorkspace(user.id)
    if (!workspace) return NextResponse.json({ error: "只有团队所有者可以移除成员" }, { status: 403 })
    const body = await request.json().catch(() => null)
    const userId = typeof body?.user_id === "string" ? body.user_id : ""
    if (!userId) return NextResponse.json({ error: "缺少成员账号" }, { status: 400 })
    if (userId === user.id) return NextResponse.json({ error: "不能移除团队所有者" }, { status: 400 })
    const { error: permissionError } = await serviceClient.from("workspace_module_permissions").delete().eq("workspace_id", workspace.id).eq("user_id", userId)
    if (permissionError) throw permissionError
    const { error: memberError } = await serviceClient.from("workspace_members").delete().eq("workspace_id", workspace.id).eq("user_id", userId)
    if (memberError) throw memberError
    return NextResponse.json({ ok: true, user_id: userId })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || "移除成员失败")
    return NextResponse.json({ error: `移除成员失败：${detail}` }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const workspace = await ownerWorkspace(user.id)
    if (!workspace) return NextResponse.json({ error: "只有团队所有者可以修改成员状态" }, { status: 403 })
    const body = await request.json().catch(() => null)
    const userId = typeof body?.user_id === "string" ? body.user_id : ""
    const status = body?.status === "active" || body?.status === "suspended" ? body.status : ""
    if (!userId || !status) return NextResponse.json({ error: "缺少成员或状态" }, { status: 400 })
    if (userId === user.id) return NextResponse.json({ error: "不能关闭团队所有者" }, { status: 400 })
    const { error } = await serviceClient.from("workspace_members").update({ status, updated_at: new Date().toISOString() }).eq("workspace_id", workspace.id).eq("user_id", userId)
    if (error) throw error
    return NextResponse.json({ ok: true, user_id: userId, status })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || "更新成员状态失败")
    return NextResponse.json({ error: `更新成员状态失败：${detail}` }, { status: 500 })
  }
}
