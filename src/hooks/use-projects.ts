"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export const PROJECT_STAGES = ["拟购买/合同审批", "正式推进", "剧本修改", "剧本定稿", "双语稿确认", "围读", "制作交接", "完成归档"] as const
const LEGACY_PROJECT_STAGE_MAP: Record<string, (typeof PROJECT_STAGES)[number]> = {
  "拟购买": "拟购买/合同审批",
  "合同审批": "拟购买/合同审批",
  "立项选题": "正式推进",
  "开发立项": "正式推进",
  "分集与剧本": "剧本修改",
  "中文稿修改": "剧本修改",
  "剧本开发": "剧本修改",
  "本地化交付": "双语稿确认",
  "英语本地化": "双语稿确认",
  "双语稿": "双语稿确认",
  "已完成": "完成归档",
}
export type ProjectStatus = "active" | "deferred" | "paused" | "completed" | "archived"
export type Project = {
  id: string; user_id: string; content_id: string | null; linked_idea_id: string | null; title: string; market: string | null; genre: string | null
  project_no?: number | null
  stage: string; progress: number; status: ProjectStatus; next_action: string | null; due_date: string | null
  risk: string | null; notes: string | null; created_at: string; updated_at: string
}
export type ProjectInput = Pick<Project, "title"> & Partial<Pick<Project, "market" | "genre" | "stage" | "progress" | "status" | "next_action" | "due_date" | "risk" | "notes" | "content_id" | "linked_idea_id">>
const normalizeProject = (project: Project): Project => ({ ...project, stage: LEGACY_PROJECT_STAGE_MAP[project.stage] || project.stage })

export function useProjects() {
  const supabase = useMemo(() => createClient(), [])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProjects = useCallback(async () => {
    setLoading(true); setError(null)
    const response = await fetch("/api/projects", { cache: "no-store" })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) setError(payload.error || "项目读取失败")
    else setProjects(((payload.projects || []) as Project[]).map(normalizeProject))
    setLoading(false)
  }, [supabase])

  const addProject = useCallback(async (input: ProjectInput) => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error("请先登录")
    const nextNo=Math.max(0,...projects.map((item)=>Number(item.project_no||0)))+1
    const { data, error: insertError } = await supabase.from("projects").insert({ ...input, project_no:nextNo, user_id: auth.user.id }).select().single()
    if (insertError) throw insertError
    const project = normalizeProject(data as Project)
    setProjects((current) => [project, ...current])
    return project
  }, [projects,supabase])

  const updateProject = useCallback(async (id: string, updates: Partial<ProjectInput>) => {
    const { data, error: updateError } = await supabase.from("projects").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single()
    if (updateError) throw updateError
    const project = normalizeProject(data as Project)
    setProjects((current) => current.map((item) => item.id === id ? project : item))
    return project
  }, [supabase])

  const deleteProject = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from("projects").delete().eq("id", id)
    if (deleteError) throw deleteError
    setProjects((current) => current.filter((project) => project.id !== id))
  }, [supabase])

  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchProjects()
  }, [fetchProjects])

  return { projects, loading, error, addProject, updateProject, deleteProject, refetch: fetchProjects }
}
