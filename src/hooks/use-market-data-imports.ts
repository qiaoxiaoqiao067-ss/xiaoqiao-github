"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { getUserWithNetworkRetry } from "@/lib/supabase/get-user-with-retry"

export type MarketDataImport = {
  id: string; user_id: string; source_name: string; period_label: string | null; file_name: string
  row_count: number; columns: string[]; raw_rows: Record<string, unknown>[]; created_at: string; updated_at: string
}
export type MarketDataImportInput = Pick<MarketDataImport, "source_name" | "file_name" | "row_count" | "columns" | "raw_rows"> & Partial<Pick<MarketDataImport, "period_label">>

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function friendlyDataError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  if (/failed to fetch|network|load failed|timeout|temporarily|503/i.test(message)) {
    return "数据连接出现波动，已自动重试但仍未恢复。请稍后点击重新连接。"
  }
  if (/jwt|session|auth|permission denied|42501|401|403/i.test(message)) {
    return "登录状态或数据权限需要刷新，请重新登录后再试。"
  }
  return message || "市场数据读取失败"
}

export function useMarketDataImports() {
  const supabase = useMemo(() => createClient(), [])
  const [imports, setImports] = useState<MarketDataImport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    setLoading(true); setError(null)
    let lastError: unknown = null
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch("/api/market-data/imports", { cache: "no-store" })
          const payload = await response.json().catch(() => ({}))
          if (response.ok) {
            setImports((payload.imports || []) as MarketDataImport[])
            return
          }
          lastError = new Error(payload.error || "市场数据读取失败")
        } catch (caught) {
          lastError = caught
        }
        if (attempt < 2) await wait(300 * (attempt + 1))
      }
      setError(friendlyDataError(lastError))
    } finally {
      setLoading(false)
    }
  }, [supabase])
  const addImport = useCallback(async (input: MarketDataImportInput) => {
    let auth
    try {
      const result = await getUserWithNetworkRetry(supabase, 3)
      auth = result.data
    } catch (caught) {
      throw new Error(friendlyDataError(caught))
    }
    if (!auth.user) throw new Error("登录状态已失效，请重新登录后上传")
    const { data, error: insertError } = await supabase.from("market_data_imports").insert({ ...input, user_id: auth.user.id }).select().single()
    if (insertError) throw new Error(friendlyDataError(insertError))
    setImports((current) => [data as MarketDataImport, ...current]); return data as MarketDataImport
  }, [supabase])
  const deleteImport = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from("market_data_imports").delete().eq("id", id)
    if (deleteError) throw deleteError
    setImports((current) => current.filter((item) => item.id !== id))
  }, [supabase])
  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch()
  }, [refetch])
  return { imports, loading, error, addImport, deleteImport, refetch }
}
