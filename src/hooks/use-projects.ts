"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export const PROJECT_STAGES = ["立项选题", "市场调研与对标", "Concept与故事大纲", "分集与剧本", "剧本修改", "剧本定稿", "角色与场景设计", "分镜", "视频制作", "后期与验收", "上架与复盘"] as const
export type ProjectStatus = "active" | "deferred" | "paused" | "completed" | "archived"
export type Project = {
  id: string; user_id: string; content_id: string | null; title: string; market: string | null; genre: string | null
  stage: string; progress: number; status: ProjectStatus; next_action: string | null; due_date: string | null
  risk: string | null; notes: string | null; created_at: string; updated_at: string
}
export type ProjectInput = Pick<Project, "title"> & Partial<Pick<Project, "market" | "genre" | "stage" | "progress" | "status" | "next_action" | "due_date" | "risk" | "notes" | "content_id">>

export function useProjects() {
  const supabase = useMemo(() => createClient(), [])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProjects = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: fetchError } = await supabase.from("projects").select("*").order("updated_at", { ascending: false })
    if (fetchError) setError(fetchError.message)
    else setProjects((data || []) as Project[])
    setLoading(false)
  }, [supabase])

  const addProject = useCallback(async (input: ProjectInput) => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error("请先登录")
    const { data, error: insertError } = await supabase.from("projects").insert({ ...input, user_id: auth.user.id }).select().single()
    if (insertError) throw insertError
    setProjects((current) => [data as Project, ...current])
    return data as Project
  }, [supabase])

  const updateProject = useCallback(async (id: string, updates: Partial<ProjectInput>) => {
    const { data, error: updateError } = await supabase.from("projects").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single()
    if (updateError) throw updateError
    setProjects((current) => current.map((project) => project.id === id ? data as Project : project))
    return data as Project
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
