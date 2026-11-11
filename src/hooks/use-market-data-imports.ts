"use client"

import { useCallback, useEffect, useState } from "react"
import { loadImportPages } from "@/lib/market/load-import-pages"

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
            const complete = await loadImportPages((payload.imports || []) as MarketDataImport[], async (id,offset) => {
              const pageResponse=await fetch(`/api/market-data/imports?id=${encodeURIComponent(id)}&offset=${offset}`,{cache:"no-store",signal:AbortSignal.timeout(45000)})
              const page=await pageResponse.json().catch(()=>null)
              if(!pageResponse.ok || !page || !Array.isArray(page.rows)) throw new Error(page?.error||`榜单分批读取失败（HTTP ${pageResponse.status}），请重试。`)
              return page
            })
            setImports(complete)
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
  }, [])
  const addImport = useCallback(async (input: MarketDataImportInput) => {
    const response=await fetch("/api/market-data/imports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(friendlyDataError(payload.error||"市场数据写入失败"));setImports((current)=>[payload.import as MarketDataImport,...current]);return payload.import as MarketDataImport
  }, [])
  const deleteImport = useCallback(async (id: string) => {
    const response=await fetch(`/api/market-data/imports?id=${encodeURIComponent(id)}`,{method:"DELETE"});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"市场数据删除失败")
    setImports((current) => current.filter((item) => item.id !== id))
  }, [])
  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch()
  }, [refetch])
  return { imports, loading, error, addImport, deleteImport, refetch }
}
