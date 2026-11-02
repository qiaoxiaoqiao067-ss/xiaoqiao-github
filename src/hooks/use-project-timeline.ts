"use client"

import { useCallback, useEffect, useState } from "react"

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
  const [items, setItems] = useState<ProjectTimelineItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => { setLoading(true); setError(null); const response = await fetch("/api/project-timeline", { cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (!response.ok) setError(payload.error || "排期读取失败"); else setItems((payload.items || []) as ProjectTimelineItem[]); setLoading(false) }, [])
  const addItem = useCallback(async (input: TimelineInput) => { const response=await fetch("/api/project-timeline",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"排期创建失败");const item=payload.items[0] as ProjectTimelineItem;setItems((current)=>[...current,item]);return item }, [])
  const addMany = useCallback(async (inputs: TimelineInput[]) => { if(!inputs.length)return[];const response=await fetch("/api/project-timeline",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(inputs)});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"排期导入失败");const added=(payload.items||[]) as ProjectTimelineItem[];setItems((current)=>[...current,...added]);return added }, [])
  const updateItem = useCallback(async (id:string, updates:Partial<TimelineInput>) => { const response=await fetch("/api/project-timeline",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...updates})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"排期更新失败");const item=payload.item as ProjectTimelineItem;setItems((current)=>current.map((currentItem)=>currentItem.id===id?item:currentItem));return item },[])
  const deleteItem = useCallback(async (id:string) => { const response=await fetch(`/api/project-timeline?id=${encodeURIComponent(id)}`,{method:"DELETE"});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"排期删除失败");setItems((current)=>current.filter((item)=>item.id!==id)) },[])
  const clearAll = useCallback(async () => { const response = await fetch("/api/project-timeline", { method: "DELETE" }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "旧排期清理失败"); setItems([]); return Number(payload.deleted || 0) }, [])
  useEffect(() => { // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch()
  }, [refetch])
  return { items, loading, error, addItem, addMany, updateItem, deleteItem, clearAll, refetch }
}
