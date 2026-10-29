"use client"

import { useState, useCallback, useEffect } from "react"
import { isWorkday } from "@/lib/utils"

export type DailyReport = {
  id: string
  user_id: string
  date: string
  content: string
  summary: string | null
  sent_to_lark: boolean
  status: string | null
  created_at: string
  updated_at: string
}

export type ReportFormData = {
  todayWork: string
  tomorrowPlan: string
  insight: string
  reflection: string
}

async function apiCall(path: string, options?: RequestInit) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
  const resp = await fetch(`${baseUrl}${path}`, options)
  const json = await resp.json()
  if (!resp.ok) throw new Error(json.error || "Request failed")
  return json
}

async function getUserId(): Promise<string> {
  // Get user ID from Supabase session
  const { createClient } = await import("@/lib/supabase/client")
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error("Not authenticated")
  return data.user.id
}

export function useReports() {
  const [reports, setReports] = useState<DailyReport[]>([])
  const [todayDraft, setTodayDraft] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      console.log("[useReports] fetching reports...")
      const json = await apiCall("/api/reports")
      console.log("[useReports] got reports:", json.reports?.length || 0, "items")
      setReports(json.reports || [])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "日报加载失败"
      console.error("[useReports] fetch error:", message)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTodayDraft = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const json = await apiCall(`/api/reports?date=${today}&status=draft`)
      setTodayDraft(json.reports?.[0] || null)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "草稿加载失败")
    }
  }, [])

  const saveDraft = useCallback(async (date: string, content: string) => {
    const userId = await getUserId()
    const json = await apiCall("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        date,
        content,
        summary: `${date} 日报`,
        status: "draft",
      }),
    })
    setTodayDraft(json.report)
    return json.report
  }, [])

  const finalizeReport = useCallback(async (date: string, content: string) => {
    const userId = await getUserId()

    const json = await apiCall("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        date,
        content,
        summary: `${date} 日报`,
        status: "final",
      }),
    })

    setTodayDraft(null)
    setReports((prev) => [json.report, ...prev])
    return json.report
  }, [])

  const markSentToLark = useCallback(async (id: string) => {
    const json = await apiCall("/api/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, sentToLark: true }),
    })
    setReports((current) => current.map((report) => report.id === id ? json.report : report))
    return json.report as DailyReport
  }, [])

  const deleteReport = useCallback(async (id: string) => {
    await apiCall(`/api/reports?id=${id}`, { method: "DELETE" })
    setReports((prev) => prev.filter((r) => r.id !== id))
    setTodayDraft((prev) => (prev?.id === id ? null : prev))
  }, [])

  useEffect(() => {
    // Initial remote report synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReports()
    fetchTodayDraft()
  }, [fetchReports, fetchTodayDraft])

  return {
    reports,
    todayDraft,
    loading,
    error,
    saveDraft,
    finalizeReport,
    deleteReport,
    markSentToLark,
    refetch: fetchReports,
  }
}

export function generateReportContent(data: ReportFormData): string {
  const today = new Date()
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`

  const lines = [
    `${dateStr} 日报`,
    "",
    "一、今日工作",
    data.todayWork
      .split("\n")
      .filter((l) => l.trim())
      .map((l, i) => `${i + 1}.${l.trim()}`)
      .join("\n") || "（待填写）",
    "",
    "二、明日工作",
    data.tomorrowPlan
      .split("\n")
      .filter((l) => l.trim())
      .map((l, i) => `${i + 1}.${l.trim()}`)
      .join("\n") || "（待填写）",
    "",
    "三、今日心得",
    data.insight.trim() || "（待填写）",
    "",
    "四、复盘反思",
    data.reflection.trim() || "（待填写）",
  ]

  return lines.join("\n")
}

export function parseReportContent(content: string): ReportFormData {
  const todayWorkMatch = content.match(/一、今日工作\n([\s\S]*?)(?:\n\n二、|\n二、)/)
  const tomorrowMatch = content.match(/二、明日工作\n([\s\S]*?)(?:\n\n三、|\n三、)/)
  const insightMatch = content.match(/三、今日心得\n([\s\S]*?)(?:\n\n四、|\n四、)/)
  const reflectionMatch = content.match(/四、复盘反思\n([\s\S]*)$/)

  return {
    todayWork: todayWorkMatch?.[1]?.replace(/^\d+\./gm, "").trim() || "",
    tomorrowPlan: tomorrowMatch?.[1]?.replace(/^\d+\./gm, "").trim() || "",
    insight: insightMatch?.[1]?.trim() || "",
    reflection: reflectionMatch?.[1]?.trim() || "",
  }
}

export function checkReportQuality(content: string): { pass: boolean; checks: { label: string; ok: boolean }[] } {
  const todayWork = content.match(/一、今日工作\n([\s\S]*?)(?:\n\n二、|\n二、)/)?.[1] || ""
  const tomorrowPlan = content.match(/二、明日工作\n([\s\S]*?)(?:\n\n三、|\n三、)/)?.[1] || ""
  const insight = content.match(/三、今日心得\n([\s\S]*?)(?:\n\n四、|\n四、)/)?.[1] || ""
  const reflection = content.match(/四、复盘反思\n([\s\S]*)$/)?.[1] || ""

  const checks = [
    { label: "包含四个完整标题", ok: ["一、今日工作", "二、明日工作", "三、今日心得", "四、复盘反思"].every((t) => content.includes(t)) },
    { label: "四项内容均已填写", ok: [todayWork, tomorrowPlan, insight, reflection].every((value) => value.trim() && !value.includes("（待填写）")) },
    { label: "标题包含日期", ok: /\d{4}年\d{1,2}月\d{1,2}日/.test(content) },
    { label: "总字数 ≤ 400 字", ok: content.replace(/\s/g, "").length <= 400 },
    { label: "无 Markdown 标记", ok: !/[#\-\*]/.test(content.replace(/[一二三四]、/g, "")) },
    { label: "无 AI 套路词", ok: !/首先|其次|此外|总的来说|综上所述/.test(content) },
    { label: "今日心得 2-4 句（自然段落）", ok: (() => {
      const sentences = insight.split(/[。！？]/).filter(Boolean)
      return sentences.length >= 2 && sentences.length <= 4
    })()},
    { label: "复盘反思含「问题」和「改进」标签", ok: reflection.includes("问题") && reflection.includes("改进") },
    { label: "无子标题（上午/下午等）", ok: !/上午|下午/.test(content) },
  ]

  return { pass: checks.every((c) => c.ok), checks }
}

export function isTodayWorkday(): boolean {
  return isWorkday(new Date())
}
