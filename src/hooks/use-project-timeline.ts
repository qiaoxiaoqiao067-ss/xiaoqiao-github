"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { announceTimelineChange, subscribeTimelineChanges } from "@/lib/projects/timeline-sync"

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
  const [items, setItems] = useState<ProjectTimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source] = useState(() => `timeline-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const requestVersion = useRef(0)
  const refetch = useCallback(async (options?: { background?: boolean }) => {
    const version = ++requestVersion.current
    if (!options?.background) setLoading(true)
    try {
      const response = await fetch("/api/project-timeline", { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "排期读取失败")
      if (version === requestVersion.current) { setItems((payload.items || []) as ProjectTimelineItem[]); setError(null) }
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : "排期读取失败")
    } finally { if (version === requestVersion.current) setLoading(false) }
  }, [])
  const changed = useCallback(() => {
    // A read begun before this write must not overwrite the saved record.
    requestVersion.current++
    setLoading(false); setError(null)
    announceTimelineChange(source)
  }, [source])
  const addMany = useCallback(async (inputs: TimelineInput[]) => {
    if (!inputs.length) return []
    const response = await fetch("/api/project-timeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inputs) })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || "排期导入失败")
    const added = (payload.items || []) as ProjectTimelineItem[]
    setItems((current) => [...current, ...added]); changed()
    return added
  }, [changed])
  const addItem = useCallback(async (input: TimelineInput) => (await addMany([input]))[0], [addMany])
  const updateItem = useCallback(async (id: string, updates: Partial<TimelineInput>) => {
    const response = await fetch("/api/project-timeline", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }) })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || "排期更新失败")
    const item = payload.item as ProjectTimelineItem
    setItems((current) => current.map((record) => record.id === id ? item : record)); changed()
    return item
  }, [changed])
  const deleteItem = useCallback(async (id: string) => {
    const response = await fetch(`/api/project-timeline?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || "排期删除失败")
    setItems((current) => current.filter((item) => item.id !== id)); changed()
  }, [changed])
  const clearAll = useCallback(async () => {
    const response = await fetch("/api/project-timeline", { method: "DELETE" })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || "旧排期清理失败")
    setItems([]); changed()
    return Number(payload.deleted || 0)
  }, [changed])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch()
    return subscribeTimelineChanges(source, () => { void refetch({ background: true }) })
  }, [refetch, source])
  return { items, loading, error, addItem, addMany, updateItem, deleteItem, clearAll, refetch }
}
