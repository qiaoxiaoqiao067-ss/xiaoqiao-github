import { WorkspacePermissionsProvider } from "@/components/permissions/workspace-permissions"
export const dynamic = "force-dynamic"

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <WorkspacePermissionsProvider>{children}</WorkspacePermissionsProvider>
}
