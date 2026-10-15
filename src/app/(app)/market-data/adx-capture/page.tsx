"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useMarketDataImports } from "@/hooks/use-market-data-imports"

type CapturePayload = {
  title?: string
  url?: string
  capturedAt?: string
  pageText?: string
  inputs?: string[]
  columns?: string[]
  rows?: Record<string, unknown>[]
}

function captureType(payload: CapturePayload) {
  const context = `${payload.title || ""} ${payload.url || ""} ${payload.pageText || ""}`
  if (/素材筛选|creative|material/i.test(context)) return "ADX登录页:热门素材"
  if (/TikTok短剧热播榜/i.test(context)) return "ADX登录页:TikTok热播榜"
  if (/短剧平台榜/i.test(context)) return "ADX登录页:短剧平台榜"
  return "ADX登录页:短剧排行榜"
}

function capturePeriod(payload: CapturePayload) {
  const values = [...(payload.inputs || []), payload.pageText || ""]
  for (const value of values) {
    const fullDate = value.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/)
    if (fullDate) return `${fullDate[1]}年${Number(fullDate[2])}月${Number(fullDate[3])}日`
  }
  const captured = payload.capturedAt ? new Date(payload.capturedAt) : new Date()
  return `${captured.getFullYear()}年${captured.getMonth() + 1}月${captured.getDate()}日`
}

export default function ADXCapturePage() {
  const router = useRouter()
  const { addImport } = useMarketDataImports()
  const started = useRef(false)
  const [state, setState] = useState<"working" | "done" | "error">("working")
  const [message, setMessage] = useState("正在整理ADX页面数据…")

  useEffect(() => {
    if (started.current) return
    started.current = true
    const run = async () => {
      try {
        const raw = decodeURIComponent(window.location.hash.slice(1))
        if (!raw) throw new Error("没有收到ADX页面数据，请回到ADX页面重新点击采集书签。")
        const payload = JSON.parse(raw) as CapturePayload
        const rows = Array.isArray(payload.rows) ? payload.rows : []
        if (!rows.length) throw new Error("ADX当前页面没有识别到表格行，请确认榜单已经加载完成。")
        const period = capturePeriod(payload)
        await addImport({
          source_name: captureType(payload),
          period_label: period,
          file_name: `${captureType(payload).replace("ADX登录页:", "")}-${period}.html-capture`,
          row_count: rows.length,
          columns: Array.isArray(payload.columns) ? payload.columns : Object.keys(rows[0] || {}),
          raw_rows: rows,
        })
        history.replaceState(null, "", "/market-data/adx-capture")
        localStorage.setItem("market-data-captured-period", period)
        setState("done")
        setMessage(`已采集 ${rows.length} 条数据，正在返回市场总结。`)
        window.setTimeout(() => router.replace("/market-data"), 900)
      } catch (error) {
        setState("error")
        setMessage(error instanceof Error ? error.message : "ADX页面采集失败")
      }
    }
    void run()
  }, [addImport, router])

  return <AppLayout><div className="mx-auto flex min-h-[65vh] max-w-xl items-center"><Card className="w-full border-[#d7e4c8]"><CardContent className="flex flex-col items-center px-8 py-14 text-center">{state === "working" ? <Loader2 className="h-10 w-10 animate-spin text-[#315f4a]" /> : state === "done" ? <CheckCircle2 className="h-10 w-10 text-emerald-600" /> : <XCircle className="h-10 w-10 text-red-500" />}<h1 className="mt-5 text-xl font-semibold text-[#173f31]">{state === "working" ? "正在同步ADX" : state === "done" ? "同步完成" : "同步未完成"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>{state === "error" && <Button className="mt-6" variant="outline" onClick={() => router.replace("/market-data")}>返回市场数据看板</Button>}</CardContent></Card></div></AppLayout>
}
