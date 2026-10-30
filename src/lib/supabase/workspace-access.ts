import { serviceClient } from "@/lib/supabase/service"

/** Returns the data owner's id for the current user's active workspace access. */
export async function getWorkspaceDataOwnerId(userId: string) {
  const { data: owned, error: ownedError } = await serviceClient
    .from("workspaces")
    .select("owner_id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle()
  if (ownedError) throw ownedError
  if (owned?.owner_id) return owned.owner_id

  const { data: membership, error: membershipError } = await serviceClient
    .from("workspace_members")
    .select("workspace_id,status")
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
  return workspace?.owner_id || null
}
