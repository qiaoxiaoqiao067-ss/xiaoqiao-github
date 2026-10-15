"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type ContentItem = {
  id: string
  title: string
  content_type: "submission" | "development" | "benchmark" | "original"
  status: "pending" | "parsing" | "ready" | "reviewing" | "reviewed" | "developing" | "archived"
  source: string | null
  market: string | null
  language: string | null
  genre: string | null
  logline: string | null
  priority: number
  tags: string[] | null
  created_at: string
  updated_at: string
  content_files: Array<{ id: string; file_name: string; version: number; parse_status: string }>
  content_reviews: Array<{
    id: string
    reviewer_type: string
    status: string
    score: number | null
    is_final: boolean
    created_at?: string
    result?: { verdict?: string; notes?: string; summary?: string; one_line_hook?: string } | null
  }>
}

type NewContent = {
  title: string
  contentType?: ContentItem["content_type"]
  source?: string
  market?: string
  genre?: string
  logline?: string
  priority?: number
  tags?: string[]
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...options })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Request failed")
  return data
}

export function useContents() {
  const [contents, setContents] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchingRef = useRef(false)

  const fetchContents = useCallback(async (q?: string, status?: string, options?: { silent?: boolean }) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    const silent = Boolean(options?.silent)
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const params = new URLSearchParams()
      if (q) params.set("q", q)
      if (status) params.set("status", status)
      // Include a request nonce as an additional guard for browsers that keep
      // a stale local response despite `cache: no-store` during development.
      params.set("_sync", String(Date.now()))
      let data: { contents?: ContentItem[] } | null = null
      let lastError: unknown
      // The local Supabase connection can briefly reset while the proxy
      // reconnects. Retry a read before presenting an empty workbench.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          data = await request(`/api/contents?${params}`) as { contents?: ContentItem[] }
          break
        } catch (caught) {
          lastError = caught
          if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)))
        }
      }
      if (!data) throw lastError || new Error("内容加载失败")
      setContents(data.contents || [])
    } catch (caught: unknown) {
      if (!silent) setError(caught instanceof Error ? caught.message : "加载失败")
    } finally {
      fetchingRef.current = false
      if (!silent) setLoading(false)
    }
  }, [])

  const addContent = useCallback(async (input: NewContent) => {
    const data = await request("/api/contents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    setContents((current) => [{ ...data.content, content_files: [], content_reviews: [] }, ...current])
    return data.content as ContentItem
  }, [])

  const uploadScripts = useCallback(async (
    files: File[],
    contentType: ContentItem["content_type"] = "submission",
    onProgress?: (completed: number, total: number) => void,
  ) => {
    const results: Array<{ fileName: string; success: boolean; error?: string; updatedVersion?: boolean }> = []
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const form = new FormData()
      form.set("file", file)
      form.set("contentType", contentType)
      try {
        const data = await request("/api/contents/upload", { method: "POST", body: form })
        results.push({ fileName: file.name, success: true, updatedVersion: Boolean(data.updatedVersion) })
      } catch (caught: unknown) {
        results.push({ fileName: file.name, success: false, error: caught instanceof Error ? caught.message : "上传失败" })
      }
      onProgress?.(index + 1, files.length)
    }
    await fetchContents()
    return results
  }, [fetchContents])

  const deleteContent = useCallback(async (id: string) => {
    await request(`/api/contents?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    setContents((current) => current.filter((item) => item.id !== id))
  }, [])

  const setContentStatus = useCallback(async (id: string, status: ContentItem["status"]) => {
    const data = await request("/api/contents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }) as { content: ContentItem }
    setContents((current) => current.map((item) => item.id === id ? { ...item, ...data.content } : item))
    return data.content
  }, [])

  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchContents()
  }, [fetchContents])

  return { contents, loading, error, fetchContents, addContent, uploadScripts, deleteContent, setContentStatus }
}
