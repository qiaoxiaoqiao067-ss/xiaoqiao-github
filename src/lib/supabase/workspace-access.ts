import { serviceClient } from "@/lib/supabase/service"
import { resolveWorkspacePermission, type WorkspaceRole } from "@/lib/supabase/workspace-permission"

export const WORKSPACE_MODULES = ["content", "projects", "market_data", "discover"] as const
export type WorkspaceModule = (typeof WORKSPACE_MODULES)[number]
export type WorkspaceAction = "view" | "edit"

export type WorkspaceAccess = {
  workspaceId: string
  ownerId: string
  userId: string
  role: WorkspaceRole
  canView: boolean
  canEdit: boolean
}

/** UI visibility is a convenience; this is the shared-data authorization boundary. */
export async function getWorkspaceAccess(userId: string, moduleKey: WorkspaceModule): Promise<WorkspaceAccess | null> {
  const { data: owned, error: ownedError } = await serviceClient
    .from("workspaces")
    .select("id,owner_id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle()
  if (ownedError) throw ownedError
  if (owned) return { workspaceId: owned.id, ownerId: owned.owner_id, userId, role: "owner", canView: true, canEdit: true }

  const { data: membership, error: membershipError } = await serviceClient
    .from("workspace_members")
    .select("workspace_id,role,status")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) return null

  const { data: workspace, error: workspaceError } = await serviceClient
    .from("workspaces")
    .select("owner_id")
    .eq("id", membership.workspace_id)
    .limit(1)
    .maybeSingle()
  if (workspaceError) throw workspaceError
  if (!workspace) return null

  const { data: permission, error: permissionError } = await serviceClient
    .from("workspace_module_permissions")
    .select("can_view,can_edit")
    .eq("workspace_id", membership.workspace_id)
    .eq("user_id", userId)
    .eq("module_key", moduleKey)
    .limit(1)
    .maybeSingle()
  if (permissionError) throw permissionError

  const role = membership.role === "collaborator" ? "collaborator" : "viewer"
  const { canView, canEdit } = resolveWorkspacePermission(role, membership.status, permission)
  return { workspaceId: membership.workspace_id, ownerId: workspace.owner_id, userId, role, canView, canEdit }
}

export async function requireWorkspaceAccess(userId: string, moduleKey: WorkspaceModule, action: WorkspaceAction) {
  const access = await getWorkspaceAccess(userId, moduleKey)
  if (!access || (action === "view" ? !access.canView : !access.canEdit)) return null
  return access
}

/** Backward-compatible owner lookup for legacy content reads. */
export async function getWorkspaceDataOwnerId(userId: string) {
  const access = await getWorkspaceAccess(userId, "content")
  return access?.canView ? access.ownerId : null
}
