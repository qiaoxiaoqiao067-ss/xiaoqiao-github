"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

// The database keeps the legacy "制作部" value for compatibility.  The UI
// exposes the two production modes separately and stores the selected mode in
// the item's notes until the database migration is applied.
export const TIMELINE_TRACKS = ["内容部", "制作部（自制）", "制作部（承制）", "制作部（待确认）", "发行/运营", "其他"] as const
export const TIMELINE_STATUSES = ["planned", "active", "completed", "delayed", "paused"] as const
export type TimelineStatus = (typeof TIMELINE_STATUSES)[number]
export type ProjectTimelineItem = { id:string; user_id:string; project_id:string; track:string; title:string; start_date:string; end_date:string; status:TimelineStatus; content:string|null; notes:string|null; created_at:string; updated_at:string }
export type TimelineInput = Pick<ProjectTimelineItem, "project_id"|"track"|"title"|"start_date"|"end_date"> & Partial<Pick<ProjectTimelineItem, "status"|"content"|"notes">>

export type TimelineDisplayTrack = (typeof TIMELINE_TRACKS)[number]

export function displayTimelineTrack(item: Pick<ProjectTimelineItem, "track"|"notes">): TimelineDisplayTrack {
  const source = `${item.track} ${item.notes || ""}`
  if (item.track === "内容部") return "内容部"
  if (/承制/.test(source)) return "制作部（承制）"
  if (/自制/.test(source)) return "制作部（自制）"
  if (item.track === "制作部") return "制作部（待确认）"
  if ((TIMELINE_TRACKS as readonly string[]).includes(item.track)) return item.track as TimelineDisplayTrack
  return "其他"
}

export function storageTimelineTrack(track: string): string {
  return track.startsWith("制作部") ? "制作部" : track
}

export function withProductionMode(notes: string | undefined, track: string): string | undefined {
  if (!track.startsWith("制作部")) return notes?.trim() || undefined
  const mode = track.includes("承制") ? "承制" : track.includes("自制") ? "自制" : "待确认"
  const clean = (notes || "").replace(/^制作方式[:：][^|]*\|?\s*/i, "").trim()
  return `制作方式：${mode}${clean ? ` | ${clean}` : ""}`
}

export function useProjectTimeline() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<ProjectTimelineItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => { setLoading(true); setError(null); const response = await fetch("/api/project-timeline", { cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (!response.ok) setError(payload.error || "排期读取失败"); else setItems((payload.items || []) as ProjectTimelineItem[]); setLoading(false) }, [supabase])
  const addItem = useCallback(async (input: TimelineInput) => { const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error("请先登录"); const { data, error: insertError } = await supabase.from("project_timeline_items").insert({ ...input, user_id:auth.user.id, status:input.status || "planned", notes:input.notes || null }).select().single(); if (insertError) throw insertError; setItems((current) => [...current, data as ProjectTimelineItem]); return data as ProjectTimelineItem }, [supabase])
  const addMany = useCallback(async (inputs: TimelineInput[]) => { if (!inputs.length) return []; const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error("请先登录"); const { data, error: insertError } = await supabase.from("project_timeline_items").insert(inputs.map((input) => ({ ...input, user_id:auth.user.id, status:input.status || "planned", notes:input.notes || null }))).select(); if (insertError) throw insertError; setItems((current) => [...current, ...((data || []) as ProjectTimelineItem[])]); return data || [] }, [supabase])
  const updateItem = useCallback(async (id:string, updates:Partial<TimelineInput>) => { const { data, error:updateError } = await supabase.from("project_timeline_items").update({ ...updates, updated_at:new Date().toISOString() }).eq("id",id).select().single(); if(updateError) throw updateError; setItems((current)=>current.map((item)=>item.id===id?data as ProjectTimelineItem:item)); return data as ProjectTimelineItem },[supabase])
  const deleteItem = useCallback(async (id:string) => { const { error:deleteError } = await supabase.from("project_timeline_items").delete().eq("id",id); if(deleteError) throw deleteError; setItems((current)=>current.filter((item)=>item.id!==id)) },[supabase])
  const clearAll = useCallback(async () => { const response = await fetch("/api/project-timeline", { method: "DELETE" }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "旧排期清理失败"); setItems([]); return Number(payload.deleted || 0) }, [])
  useEffect(() => { // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch()
  }, [refetch])
  return { items, loading, error, addItem, addMany, updateItem, deleteItem, clearAll, refetch }
}
