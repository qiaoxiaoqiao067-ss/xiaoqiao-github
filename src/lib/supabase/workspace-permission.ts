export type WorkspaceRole = "owner" | "collaborator" | "viewer"

export function resolveWorkspacePermission(
  role: WorkspaceRole,
  status: string,
  permission: { can_view?: boolean | null; can_edit?: boolean | null } | null,
) {
  if (role === "owner") return { canView: true, canEdit: true }
  if (status !== "active") return { canView: false, canEdit: false }
  const canView = Boolean(permission?.can_view)
  return { canView, canEdit: canView && role === "collaborator" && Boolean(permission?.can_edit) }
}
