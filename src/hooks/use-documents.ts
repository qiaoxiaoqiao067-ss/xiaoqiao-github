"use client"

import { useState, useCallback, useEffect } from "react"

export type Document = {
  id: string
  user_id: string
  title: string
  content: string | null
  file_url: string | null
  file_type: string | null
  category: string | null
  tags: string[] | null
  standardized_title: string | null
  created_at: string
  updated_at: string
}

const BASE = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
const normalizeCategory=(value:string|null)=>({"日报":"日报周报","周报":"日报周报","制度文件":"合同制度","模板":"模板工具","技术文档":"其他"}[value||""]||value||"其他")

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDocuments = useCallback(async (q?: string, category?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q) params.set("q", q)
      if (category) params.set("category", category)
      const resp = await fetch(`${BASE}/api/documents?${params}`)
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error)
      setDocuments((data.documents || []).map((item:Document)=>({...item,category:normalizeCategory(item.category)})))
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "文件加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  const addDocument = useCallback(async (doc: {
    userId: string; title: string; content: string; category: string; tags: string[]
  }) => {
    const resp = await fetch(`${BASE}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error)
    setDocuments(prev => [data.document, ...prev])
    return data.document
  }, [])

  const updateDocument = useCallback(async (id: string, updates: Partial<Pick<Document, "title" | "content" | "category" | "tags" | "standardized_title">>) => {
    const resp = await fetch(`${BASE}/api/documents`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error)
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...data.document } : d))
    return data.document
  }, [])

  const deleteDocument = useCallback(async (id: string) => {
    const resp = await fetch(`${BASE}/api/documents?id=${id}`, { method: "DELETE" })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error)
    setDocuments(prev => prev.filter(d => d.id !== id))
  }, [])

  useEffect(() => {
    // Initial remote document synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDocuments()
  }, [fetchDocuments])

  return { documents, loading, error, addDocument, updateDocument, deleteDocument, fetchDocuments }
}

export const DOC_CATEGORIES = ["全部", "项目资料", "剧本与选题", "会议纪要", "市场与调研", "日报周报", "合同制度", "模板工具", "行业资料", "其他"]
export const CAT_EMOJI: Record<string, string> = {
  "全部": "📚", "项目资料":"🎬", "剧本与选题":"✍️", "会议纪要": "📋", "市场与调研":"📈", "日报周报": "📊", "合同制度": "⚖️", "模板工具": "📐", "行业资料":"🌍", "其他": "📁",
}
