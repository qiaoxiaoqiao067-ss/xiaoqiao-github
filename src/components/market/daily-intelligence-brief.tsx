"use client"

import { useEffect, useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { BookOpen, CalendarDays, CheckCircle2, Copy, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Report = { id: string; date: string; title: string; content: string; source: string; savedAt: string; conversationId?: string; shareUrl?: string }

function clean(content: string) {
  return content.replace(/(?:image_group|entity|genui|cite|url)[\s\S]*?/g, "").replace(/\\([+!])/g, "$1").replace(/\n{3,}/g, "\n\n").trim()
}
function coreConclusion(content: string) {
  const value = clean(content)
  const match = value.match(/(?:^|\n)##\s*(?:一[、.]\s*)?今日核心结论\s*\n([\s\S]*?)(?=\n##\s|$)/)
  return (match?.[1] || value.split(/\n##\s/)[0]).trim()
}
function Inline({ value }: { value: string }) {
  const pieces = value.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").split("\n")
  return <>{pieces.map((line, index) => <p key={index} className={index ? "mt-2" : ""}>{line}</p>)}</>
}
function ReportBody({ content }: { content: string }) {
  return <div className="text-base leading-7 text-[#29483b]">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mb-5 mt-2 text-2xl font-bold leading-tight text-[#173f31]">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-3 mt-8 border-t border-[#e1eadb] pt-6 text-xl font-bold leading-tight text-[#173f31]">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 mt-6 text-lg font-semibold text-[#24533f]">{children}</h3>,
        p: ({ children }) => <p className="my-3 whitespace-pre-wrap">{children}</p>,
        ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-6">{children}</ul>,
        ol: ({ children }) => <ol className="my-4 list-decimal space-y-2 pl-6">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        blockquote: ({ children }) => <blockquote className="my-5 border-l-4 border-[#9dba80] bg-[#f4f8ee] px-5 py-3 text-[#365347]">{children}</blockquote>,
        hr: () => <hr className="my-8 border-[#dce7d4]"/>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium text-[#286b50] underline decoration-[#9dba80] underline-offset-2">{children}</a>,
        // 日报图片来源不固定，保留原始Markdown URL，避免Next Image域名白名单改写原文资源。
        // eslint-disable-next-line @next/next/no-img-element
        img: ({ src, alt }) => <img src={src || ""} alt={alt || "日报图表"} className="my-5 h-auto max-h-[680px] w-full rounded-xl border border-[#dce7d4] bg-[#f6f8f3] object-contain" loading="lazy"/>,
        table: ({ children }) => <div className="my-5 overflow-x-auto rounded-xl border border-[#cfdcc6]"><table className="w-full min-w-[620px] border-collapse text-left text-sm">{children}</table></div>,
        thead: ({ children }) => <thead className="bg-[#edf4e6] text-[#29483b]">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-[#dce7d4] bg-white">{children}</tbody>,
        tr: ({ children }) => <tr className="divide-x divide-[#dce7d4]">{children}</tr>,
        th: ({ children }) => <th className="px-4 py-3 font-semibold align-top">{children}</th>,
        td: ({ children }) => <td className="px-4 py-3 align-top">{children}</td>,
        code: ({ children }) => <code className="rounded bg-[#eef3e9] px-1.5 py-0.5 text-[0.9em]">{children}</code>,
        pre: ({ children }) => <pre className="my-5 overflow-x-auto rounded-xl bg-[#173f31] p-4 text-sm leading-6 text-white">{children}</pre>,
      }}
    >{clean(content)}</ReactMarkdown>
  </div>
}

export function DailyIntelligenceBrief() {
  const [reports, setReports] = useState<Report[]>([]), [selectedId, setSelectedId] = useState(""), [query, setQuery] = useState(""), [open, setOpen] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("")
  useEffect(() => { void fetch("/api/market-data/intelligence-reports", { cache: "no-store" }).then(async response => { const result = await response.json() as { reports?: Report[]; error?: string }; if (!response.ok) throw new Error(result.error || "日报读取失败"); setReports(result.reports || []); setSelectedId(result.reports?.[0]?.id || "") }).catch(caught => setError(caught instanceof Error ? caught.message : "日报读取失败")).finally(() => setLoading(false)) }, [])
  const filtered = useMemo(() => { const keyword = query.trim().toLowerCase(); return keyword ? reports.filter(report => `${report.date} ${report.title} ${report.content}`.toLowerCase().includes(keyword)) : reports }, [query, reports])
  const selected = reports.find(report => report.id === selectedId) || filtered[0], latest = reports[0]
  const show = (id?: string) => { setSelectedId(id || latest?.id || ""); setOpen(true) }
  return <>
    <section className="overflow-hidden rounded-2xl border border-[#c9d9bd] bg-white shadow-[0_16px_40px_rgba(23,63,49,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e1eadb] bg-[#f4f8ee] px-5 py-4"><div><div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-[#315f4a]"/><h2 className="text-lg font-semibold text-[#173f31]">今日海外AI真人短剧日报</h2><Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>ChatGPT原文</Badge></div><p className="mt-1 text-sm text-[#60766a]">来源：海外AI真人短剧日报对话 · 不计入ADX月榜统计</p></div>{latest && <span className="inline-flex items-center gap-1.5 text-sm text-[#456052]"><CalendarDays className="h-4 w-4"/>{latest.date}</span>}</div>
      {loading ? <p className="p-6 text-sm text-muted-foreground">正在读取今日日报…</p> : error ? <p className="p-6 text-sm text-red-600">{error}</p> : !latest ? <p className="p-6 text-sm text-muted-foreground">暂无已同步日报。</p> : <div className="p-5"><p className="mb-3 text-sm font-semibold text-[#315f4a]">今日核心结论</p><div className="max-w-4xl text-base leading-7 text-[#29483b]"><Inline value={coreConclusion(latest.content)}/></div><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => show(latest.id)} className="bg-[#173f31] text-white hover:bg-[#24513f]">阅读完整日报</Button><Button variant="outline" onClick={() => show()}>查看历史日报 · {reports.length}期</Button></div></div>}
    </section>
    {open && <div className="fixed inset-0 z-50 bg-black/35" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setOpen(false) }}><section role="dialog" aria-modal="true" aria-label="完整海外AI真人短剧日报" className="absolute inset-y-0 right-0 flex w-full max-w-5xl flex-col bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-lg font-semibold text-[#173f31]">完整日报</h2><p className="text-sm text-[#60766a]">原文归档 · 按实际日报日期排序</p></div><Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="关闭完整日报"><X className="h-5 w-5"/></Button></div><div className="grid min-h-0 flex-1 lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="border-b bg-[#f8faf6] p-3 lg:border-b-0 lg:border-r"><div className="relative mb-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#7b8d83]"/><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索日报" className="pl-9"/></div><div className="max-h-[calc(100vh-150px)] space-y-1 overflow-y-auto">{filtered.map(report => <button key={report.id} onClick={() => setSelectedId(report.id)} className={`w-full rounded-xl px-3 py-3 text-left ${selected?.id === report.id ? "bg-[#eaf4d9] text-[#173f31]" : "hover:bg-white"}`}><span className="block text-sm font-semibold">{report.date}</span><span className="mt-1 block truncate text-sm text-[#60766a]">{report.title}</span></button>)}</div></aside><article className="min-w-0 overflow-y-auto p-5 md:p-8"><div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm text-[#708077]"><span>{selected?.source} · 同步于 {selected ? new Date(selected.savedAt).toLocaleString("zh-CN") : ""}</span><Button size="sm" variant="outline" onClick={() => selected && navigator.clipboard.writeText(clean(selected.content))}><Copy className="mr-1.5 h-4 w-4"/>复制正文</Button></div>{selected && <ReportBody content={selected.content}/>}</article></div></section></div>}
  </>
}
