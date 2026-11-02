"use client"

import { useCallback, useEffect, useState } from "react"

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
  }, [])

  const addProject = useCallback(async (input: ProjectInput) => {
    const response = await fetch("/api/projects", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(input) }); const payload=await response.json(); if(!response.ok) throw new Error(payload.error||"项目创建失败")
    const project = normalizeProject(payload.project as Project)
    setProjects((current) => [project, ...current])
    return project
  }, [])

  const updateProject = useCallback(async (id: string, updates: Partial<ProjectInput>) => {
    const response=await fetch("/api/projects",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...updates})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"项目更新失败")
    const project = normalizeProject(payload.project as Project)
    setProjects((current) => current.map((item) => item.id === id ? project : item))
    return project
  }, [])

  const deleteProject = useCallback(async (id: string) => {
    const response=await fetch(`/api/projects?id=${encodeURIComponent(id)}`,{method:"DELETE"});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"项目删除失败")
    setProjects((current) => current.filter((project) => project.id !== id))
  }, [])

  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchProjects()
  }, [fetchProjects])

  return { projects, loading, error, addProject, updateProject, deleteProject, refetch: fetchProjects }
}
