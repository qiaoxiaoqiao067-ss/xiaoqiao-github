"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export type MarketDataImport = {
  id: string; user_id: string; source_name: string; period_label: string | null; file_name: string
  row_count: number; columns: string[]; raw_rows: Record<string, unknown>[]; created_at: string; updated_at: string
}
export type MarketDataImportInput = Pick<MarketDataImport, "source_name" | "file_name" | "row_count" | "columns" | "raw_rows"> & Partial<Pick<MarketDataImport, "period_label">>

export function useMarketDataImports() {
  const supabase = useMemo(() => createClient(), [])
  const [imports, setImports] = useState<MarketDataImport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: fetchError } = await supabase.from("market_data_imports").select("*").order("created_at", { ascending: false })
    if (fetchError) setError(fetchError.message); else setImports((data || []) as MarketDataImport[])
    setLoading(false)
  }, [supabase])
  const addImport = useCallback(async (input: MarketDataImportInput) => {
    const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error("请先登录")
    const { data, error: insertError } = await supabase.from("market_data_imports").insert({ ...input, user_id: auth.user.id }).select().single()
    if (insertError) throw insertError
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
