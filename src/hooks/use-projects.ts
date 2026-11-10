"use client"

import { useCallback, useEffect, useState } from "react"

export { PROJECT_STAGES } from "@/lib/projects/stages"
import { normalizeProjectWorkflow } from "@/lib/projects/stages"
export type ProjectStatus = "active" | "deferred" | "paused" | "completed" | "archived"
export type Project = {
  id: string; user_id: string; content_id: string | null; linked_idea_id: string | null; title: string; market: string | null; genre: string | null
  project_no?: number | null
  stage: string; progress: number; status: ProjectStatus; next_action: string | null; due_date: string | null
  risk: string | null; notes: string | null; created_at: string; updated_at: string
}
export type ProjectInput = Pick<Project, "title"> & Partial<Pick<Project, "market" | "genre" | "stage" | "progress" | "status" | "next_action" | "due_date" | "risk" | "notes" | "content_id" | "linked_idea_id">>
const normalizeProject = (project: Project): Project => normalizeProjectWorkflow(project)

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
