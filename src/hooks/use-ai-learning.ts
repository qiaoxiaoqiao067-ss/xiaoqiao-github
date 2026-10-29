"use client"

import { useState, useCallback, useEffect } from "react"

export type AILearning = {
  id: string
  user_id: string
  title: string
  content: string
  source: string | null
  source_url: string | null
  category: string
  difficulty: number
  date: string
  notes: string | null
  learned: boolean
  created_at: string
}

const BASE = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"

export function useAILearning() {
  const [learnings, setLearnings] = useState<AILearning[]>([])
  const [todayLearning, setTodayLearning] = useState<AILearning | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLearnings = useCallback(async (category?: string, difficulty?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (category) params.set("category", category)
      if (difficulty) params.set("difficulty", difficulty)
      const resp = await fetch(`${BASE}/api/ai-learning?${params}`)
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error)
      setLearnings(data.learnings || [])
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "学习内容加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  const generateToday = useCallback(async () => {
    setGenerating(true)
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("未登录")

      const resp = await fetch(`${BASE}/api/ai-learning`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.user.id }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error)
      setTodayLearning(data.learning)
      // Refresh list
      await fetchLearnings()
      return data.learning
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "学习内容生成失败")
    } finally {
      setGenerating(false)
    }
  }, [fetchLearnings])

  const updateLearning = useCallback(async (id: string, updates: { notes?: string; learned?: boolean }) => {
    const resp = await fetch(`${BASE}/api/ai-learning`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error)
    setLearnings(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l))
    if (todayLearning?.id === id) {
      setTodayLearning(prev => prev ? { ...prev, ...updates } : null)
    }
    return data.learning
  }, [todayLearning])

  // Load today's learning on mount
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    // Initial remote learning synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLearnings().then(() => {
      setLearnings(prev => {
        const todayItem = prev.find(l => l.date === today)
        if (todayItem) setTodayLearning(todayItem)
        return prev
      })
    })
  }, [fetchLearnings])

  return {
    learnings,
    todayLearning,
    loading,
    generating,
    error,
    generateToday,
    updateLearning,
    fetchLearnings,
  }
}
