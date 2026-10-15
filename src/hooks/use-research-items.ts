"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export const RESEARCH_TYPES = ["市场趋势", "爆款对标", "题材机会", "竞品平台", "制作可行性", "其他"] as const
export const RESEARCH_STATUSES = ["待调研", "调研中", "待结论", "已完成", "暂缓"] as const

export type ResearchItem = {
  id: string; user_id: string; title: string; research_type: string; status: string; question: string | null
  target_market: string | null; source_urls: string[]; evidence: string | null; conclusion: string | null
  next_action: string | null; due_date: string | null; linked_idea_id: string | null; linked_project_id: string | null
  created_at: string; updated_at: string
}

export type ResearchInput = Partial<Omit<ResearchItem, "id" | "user_id" | "created_at" | "updated_at">> & { title: string }

export function useResearchItems() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<ResearchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchItems = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: fetchError } = await supabase.from("research_items").select("*").order("updated_at", { ascending: false })
    if (fetchError) setError(fetchError.message); else setItems((data || []) as ResearchItem[])
    setLoading(false)
  }, [supabase])
  const addItem = useCallback(async (input: ResearchInput) => {
    const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error("请先登录")
    const { data, error: insertError } = await supabase.from("research_items").insert({ ...input, user_id: auth.user.id }).select().single()
    if (insertError) throw insertError; setItems((current) => [data as ResearchItem, ...current]); return data as ResearchItem
  }, [supabase])
  const updateItem = useCallback(async (id: string, updates: Partial<ResearchInput>) => {
    const { data, error: updateError } = await supabase.from("research_items").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single()
    if (updateError) throw updateError; setItems((current) => current.map((item) => item.id === id ? data as ResearchItem : item)); return data as ResearchItem
  }, [supabase])
  const deleteItem = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from("research_items").delete().eq("id", id)
    if (deleteError) throw deleteError; setItems((current) => current.filter((item) => item.id !== id))
  }, [supabase])
  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchItems()
  }, [fetchItems])
  return { items, loading, error, addItem, updateItem, deleteItem, refetch: fetchItems }
}
