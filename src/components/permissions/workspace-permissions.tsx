"use client"

import { createContext, useContext, useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type SelectHTMLAttributes } from "react"
import { createClient } from "@/lib/supabase/client"

export type ModuleKey = "content" | "projects" | "market_data" | "discover"
export type TeamPermissions = { configured?: boolean; role?: string; status?: string; modules?: { key: string; canView: boolean; canEdit: boolean }[] } | null
export const WorkspacePermissionsContext = createContext<TeamPermissions>(null)
export function mayEdit(team: TeamPermissions, module: ModuleKey) {
  if (!team?.configured || team.status !== "active") return false
  if (team.role === "owner") return true
  return team.role === "collaborator" && !!team.modules?.some(m => m.key === module && m.canView && m.canEdit)
}
export function WorkspacePermissionsProvider({ children }: { children: ReactNode }) {
  const [team, setTeam] = useState<TeamPermissions>(null)
  useEffect(() => {
    let disposed = false
    let controller: AbortController | undefined
    async function load(reset = false) {
      controller?.abort()
      const request = new AbortController()
      controller = request
      if (reset) setTeam(null)
      try {
        const response = await fetch("/api/team", { cache: "no-store", signal: request.signal })
        const data = response.ok ? await response.json() : null
        if (!disposed && !request.signal.aborted) setTeam(data)
      } catch { if (!disposed && !request.signal.aborted) setTeam(null) }
    }
    const refresh = () => { void load() }
    const visibility = () => { if (document.visibilityState === "visible") refresh() }
    void load()
    const { data: { subscription } } = createClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { controller?.abort(); setTeam(null) }
      if (event === "SIGNED_IN") void load(true)
    })
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", visibility)
    const timer = window.setInterval(refresh, 60000)
    return () => { disposed = true; controller?.abort(); subscription.unsubscribe(); clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visibility) }
  }, [])
  return <WorkspacePermissionsContext.Provider value={team}>{children}</WorkspacePermissionsContext.Provider>
}
export function useModuleEdit(module: ModuleKey) { return mayEdit(useContext(WorkspacePermissionsContext), module) }
export function useIsWorkspaceOwner() { const team = useContext(WorkspacePermissionsContext); return team?.role === "owner" && team.status === "active" }
export function EditOnly({ module, children }: { module: ModuleKey | ModuleKey[]; children: ReactNode }) {
  const team = useContext(WorkspacePermissionsContext)
  return (Array.isArray(module) ? module : [module]).every(key => mayEdit(team, key)) ? <>{children}</> : null
}
export function OwnerOnly({ children }: { children: ReactNode }) { return useIsWorkspaceOwner() ? <>{children}</> : null }
/** Readable schedule content stays visible, but cannot open an editor. */
export function ReadableAction({ module, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { module: ModuleKey }) {
  const canEdit = useModuleEdit(module)
  return canEdit ? <button {...props}>{children}</button> : <div className={props.className}>{children}</div>
}
/** Read-only members see the saved value instead of a mutation dropdown. */
export function EditableSelect({ module, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { module: ModuleKey }) {
  const canEdit = useModuleEdit(module)
  return canEdit ? <select {...props}>{children}</select> : <span className="text-xs font-medium text-muted-foreground">{String(props.value ?? "")}</span>
}
