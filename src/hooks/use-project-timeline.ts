"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export const TIMELINE_TRACKS = ["内容部", "制作部", "发行/运营", "其他"] as const
export const TIMELINE_STATUSES = ["planned", "active", "completed", "delayed", "paused"] as const
export type TimelineStatus = (typeof TIMELINE_STATUSES)[number]
export type ProjectTimelineItem = { id:string; user_id:string; project_id:string; track:string; title:string; start_date:string; end_date:string; status:TimelineStatus; content:string|null; notes:string|null; created_at:string; updated_at:string }
export type TimelineInput = Pick<ProjectTimelineItem, "project_id"|"track"|"title"|"start_date"|"end_date"> & Partial<Pick<ProjectTimelineItem, "status"|"content"|"notes">>

export function useProjectTimeline() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<ProjectTimelineItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => { setLoading(true); setError(null); const { data, error: fetchError } = await supabase.from("project_timeline_items").select("*").order("start_date", { ascending:true }); if (fetchError) setError(fetchError.message); else setItems((data || []) as ProjectTimelineItem[]); setLoading(false) }, [supabase])
  const addItem = useCallback(async (input: TimelineInput) => { const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error("请先登录"); const { data, error: insertError } = await supabase.from("project_timeline_items").insert({ ...input, user_id:auth.user.id, status:input.status || "planned", notes:input.notes || null }).select().single(); if (insertError) throw insertError; setItems((current) => [...current, data as ProjectTimelineItem]); return data as ProjectTimelineItem }, [supabase])
  const addMany = useCallback(async (inputs: TimelineInput[]) => { if (!inputs.length) return []; const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error("请先登录"); const { data, error: insertError } = await supabase.from("project_timeline_items").insert(inputs.map((input) => ({ ...input, user_id:auth.user.id, status:input.status || "planned", notes:input.notes || null }))).select(); if (insertError) throw insertError; setItems((current) => [...current, ...((data || []) as ProjectTimelineItem[])]); return data || [] }, [supabase])
  const updateItem = useCallback(async (id:string, updates:Partial<TimelineInput>) => { const { data, error:updateError } = await supabase.from("project_timeline_items").update({ ...updates, updated_at:new Date().toISOString() }).eq("id",id).select().single(); if(updateError) throw updateError; setItems((current)=>current.map((item)=>item.id===id?data as ProjectTimelineItem:item)); return data as ProjectTimelineItem },[supabase])
  const deleteItem = useCallback(async (id:string) => { const { error:deleteError } = await supabase.from("project_timeline_items").delete().eq("id",id); if(deleteError) throw deleteError; setItems((current)=>current.filter((item)=>item.id!==id)) },[supabase])
  useEffect(() => { // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch()
  }, [refetch])
  return { items, loading, error, addItem, addMany, updateItem, deleteItem, refetch }
}
