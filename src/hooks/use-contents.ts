"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"

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
  archived_at?: string | null
  content_files: Array<{ id: string; file_name: string; version: number; parse_status: string; created_at?: string }>
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

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...options })
  const data = await response.json()
  if (!response.ok) throw new RequestError(data.error || "Request failed", response.status)
  return data
}

async function refreshUploadSession(force = false) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const expiring = !session?.expires_at || session.expires_at * 1000 - Date.now() < 3 * 60 * 1000
    if (!force && session && !expiring) return true
    const { data, error } = await supabase.auth.refreshSession()
    return !error && Boolean(data.session)
  } catch { return false }
}

export function useContents() {
  const [contents, setContents] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequestRef = useRef(0)

  const fetchContents = useCallback(async (q?: string, status?: string, options?: { silent?: boolean }) => {
    // Upload completion, search and background review polling may refresh at
    // the same time. Let them run concurrently, but only let the newest request
    // update the list so an older response cannot overwrite newly uploaded data.
    const requestId = latestRequestRef.current + 1
    latestRequestRef.current = requestId
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
      if (requestId === latestRequestRef.current) setContents(data.contents || [])
    } catch (caught: unknown) {
      if (!silent && requestId === latestRequestRef.current) setError(caught instanceof Error ? caught.message : "加载失败")
    } finally {
      if (!silent && requestId === latestRequestRef.current) setLoading(false)
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
    onProgress?: (completed: number, total: number, result: { fileName: string; success: boolean; error?: string; updatedVersion?: boolean; authExpired?: boolean }) => void,
    uploadIds?: string[],
  ) => {
    const results: Array<{ fileName: string; success: boolean; error?: string; updatedVersion?: boolean; authExpired?: boolean }> = []
    if (!await refreshUploadSession()) {
      return files.map((file) => ({ fileName: file.name, success: false, error: "登录已失效，文件已保存在待续传队列", authExpired: true }))
    }
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const form = new FormData()
      form.set("file", file)
      form.set("contentType", contentType)
      if (uploadIds?.[index]) form.set("uploadId", uploadIds[index])
      try {
        let data
        try {
          data = await request("/api/contents/upload", { method: "POST", body: form })
        } catch (caught) {
          if (!(caught instanceof RequestError) || caught.status !== 401 || !await refreshUploadSession(true)) throw caught
          data = await request("/api/contents/upload", { method: "POST", body: form })
        }
        const result = { fileName: file.name, success: true, updatedVersion: Boolean(data.updatedVersion) }
        results.push(result)
        onProgress?.(index + 1, files.length, result)
      } catch (caught: unknown) {
        const authExpired = caught instanceof RequestError && caught.status === 401
        const result = { fileName: file.name, success: false, error: authExpired ? "登录已失效，文件已保存在待续传队列" : caught instanceof Error ? caught.message : "上传失败", authExpired }
        results.push(result)
        onProgress?.(index + 1, files.length, result)
        if (authExpired) {
          for (let rest = index + 1; rest < files.length; rest += 1) {
            results.push({ fileName: files[rest].name, success: false, error: "等待重新登录后继续上传", authExpired: true })
          }
          break
        }
      }
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

  const updateContent = useCallback(async (id: string, updates: Partial<Omit<NewContent, "contentType">> & { contentType?: ContentItem["content_type"]; status?: ContentItem["status"] }) => {
    const data = await request("/api/contents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    }) as { content: ContentItem }
    setContents((current) => current.map((item) => item.id === id ? { ...item, ...data.content } : item))
    return data.content
  }, [])

  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchContents()
  }, [fetchContents])

  return { contents, loading, error, fetchContents, addContent, uploadScripts, deleteContent, setContentStatus, updateContent }
}
