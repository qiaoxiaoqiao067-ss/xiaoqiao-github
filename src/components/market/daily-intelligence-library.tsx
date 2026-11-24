"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpen, CheckCircle2, Copy, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Report = { id: string; date: string; title: string; content: string; source: string; savedAt: string }

function cleanReport(content: string) {
  return content
    .replace(/(?:image_group|entity|genui|cite|url)[\s\S]*?/g, "")
    .replace(/\\([+!])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function ReportBody({ content }: { content: string }) {
  const blocks = cleanReport(content).split(/\n\n+/)
  return <div className="space-y-4 text-sm leading-7 text-[#29483b]">
    {blocks.map((block, index) => {
      const line = block.trim()
      if (/^# /.test(line)) return <h1 key={index} className="text-2xl font-bold text-[#173f31]">{line.replace(/^# /, "")}</h1>
      if (/^## /.test(line)) return <h2 key={index} className="border-t border-[#e1eadb] pt-5 text-lg font-bold text-[#173f31]">{line.replace(/^## /, "")}</h2>
      if (/^### /.test(line)) return <h3 key={index} className="text-base font-semibold text-[#24533f]">{line.replace(/^### /, "")}</h3>
      if (line.startsWith("|")) return <pre key={index} className="overflow-x-auto rounded-xl bg-[#f3f7ef] p-4 text-xs leading-6">{line.replace(/\*\*/g, "")}</pre>
      if (/^(?:[-*]|\d+\.) /.test(line)) return <div key={index} className="rounded-xl bg-[#f7f9f4] px-4 py-3 whitespace-pre-wrap">{line.replace(/\*\*/g, "")}</div>
      return <p key={index} className="whitespace-pre-wrap">{line.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")}</p>
    })}
  </div>
}

export function DailyIntelligenceLibrary() {
  const [reports, setReports] = useState<Report[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    void fetch("/api/market-data/intelligence-reports", { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as { reports?: Report[]; error?: string }
        if (!response.ok) throw new Error(result.error || "日报读取失败")
        setReports(result.reports || [])
        setSelectedId(result.reports?.[0]?.id || "")
      })
      .catch(caught => setError(caught instanceof Error ? caught.message : "日报读取失败"))
      .finally(() => setLoading(false))
  }, [])
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return keyword ? reports.filter(report => `${report.date} ${report.title} ${report.content}`.toLowerCase().includes(keyword)) : reports
  }, [query, reports])
  const selected = reports.find(report => report.id === selectedId) || filtered[0]
  const copy = async () => { if (selected) await navigator.clipboard.writeText(cleanReport(selected.content)) }

  return <section className="overflow-hidden rounded-2xl border border-[#cfddc5] bg-white shadow-[0_14px_35px_rgba(23,63,49,0.06)]">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e1eadb] bg-[#f6f9f1] px-5 py-4">
      <div><div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-[#315f4a]"/><h2 className="font-semibold text-[#173f31]">海外AI真人短剧日报</h2><Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>已保存</Badge></div><p className="mt-1 text-xs text-[#60766a]">日报是外部情报与判断层，不计入ADX月榜统计；共保存 {reports.length} 期。</p></div>
      <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#7b8d83]"/><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索日期、平台、题材或作品" className="pl-9"/></div>
    </div>
    {loading ? <p className="p-8 text-sm text-muted-foreground">正在读取日报…</p> : error ? <p className="p-8 text-sm text-red-600">{error}</p> : reports.length === 0 ? <p className="p-8 text-sm text-muted-foreground">暂无已保存日报。</p> : <div className="grid min-h-[520px] lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="border-b border-[#e1eadb] bg-[#fafbf8] p-3 lg:border-b-0 lg:border-r"><div className="max-h-[520px] space-y-2 overflow-y-auto">{filtered.map(report => <button key={report.id} type="button" onClick={() => setSelectedId(report.id)} className={`w-full rounded-xl border px-3 py-3 text-left transition ${selected?.id === report.id ? "border-[#9fbd75] bg-[#eef6dd]" : "border-transparent hover:border-[#dce7d3] hover:bg-white"}`}><span className="block text-xs font-semibold text-[#315f4a]">{report.date}</span><span className="mt-1 block text-sm leading-5 text-[#29483b]">{report.title.replace(/海外\s*AI\s*真人短剧日报[｜|]?/i, "") || "海外AI真人短剧日报"}</span></button>)}</div></aside>
      <article className="min-w-0 p-5 md:p-8"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-[#708077]">{selected?.source} · 保存于 {selected ? new Date(selected.savedAt).toLocaleString("zh-CN") : ""}</p></div><Button size="sm" variant="outline" onClick={() => void copy()}><Copy className="mr-1.5 h-4 w-4"/>复制正文</Button></div>{selected && <ReportBody content={selected.content}/>}</article>
    </div>}
  </section>
}
