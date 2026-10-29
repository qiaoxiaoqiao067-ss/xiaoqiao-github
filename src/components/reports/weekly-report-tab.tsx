"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle, ClipboardCopy, FileText, History, Loader2, RefreshCw, Save, Send, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { WEEKLY_PAGE_KEYS, WEEKLY_PAGE_META, emptyWeeklySections, parseWeeklySections, serializeWeeklySections, type WeeklyPageKey, type WeeklySections } from "@/lib/reports/weekly"

type SourceEntry = { source: string; date: string; text: string; kind: "fact" | "plan" | "risk" }
type CoverageItem = { source: string; count: number; available: boolean }
type WeeklyHistory = { id: string; week_start: string; week_end: string; content: string; exported: boolean }

export function WeeklyReportTab() {
  const [weekStart, setWeekStart] = useState(getMonday())
  const weekEnd = getFriday(weekStart)
  const [entries, setEntries] = useState<SourceEntry[]>([])
  const [coverage, setCoverage] = useState<CoverageItem[]>([])
  const [dailyCount, setDailyCount] = useState(0)
  const [manualNotes, setManualNotes] = useState("")
  const [sections, setSections] = useState<WeeklySections>(emptyWeeklySections)
  const [loadingSources, setLoadingSources] = useState(false)
  const [generatingPage, setGeneratingPage] = useState<WeeklyPageKey | "all" | null>(null)
  const [saving, setSaving] = useState<"draft" | "final" | null>(null)
  const [message, setMessage] = useState("")
  const [history, setHistory] = useState<WeeklyHistory[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [finalizedContent, setFinalizedContent] = useState("")

  const content = useMemo(() => serializeWeeklySections(sections), [sections])
  const hasContent = WEEKLY_PAGE_KEYS.some((key) => sections[key].trim())
  const isFinalized = Boolean(finalizedContent && finalizedContent === content)
  const missingSources = coverage.filter((item) => item.available && item.count === 0)
  const unavailableSources = coverage.filter((item) => !item.available)
  const factCount = entries.filter((item) => item.kind === "fact").length
  const planCount = entries.filter((item) => item.kind === "plan").length
  const riskCount = entries.filter((item) => item.kind === "risk").length

  useEffect(() => { void loadHistory() }, [])

  async function loadHistory() {
    try {
      const response = await fetch("/api/weekly-report")
      const data = await response.json()
      if (response.ok) setHistory(data.reports || [])
    } catch {}
  }

  async function loadSources() {
    setLoadingSources(true)
    setMessage("")
    try {
      const response = await fetch(`/api/weekly-report?start=${weekStart}&end=${weekEnd}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "汇总失败")
      setEntries(data.entries || [])
      setCoverage(data.coverage || [])
      setDailyCount(data.reports?.length || 0)
      const total = data.entries?.length || 0
      setMessage(total ? `已汇总 ${total} 条工作台记录，其中 ${data.reports?.length || 0} 篇定稿日报` : "本周暂无可汇总记录，请在下方手动补充")
    } catch (error) {
      setMessage(`汇总失败：${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setLoadingSources(false)
    }
  }

  async function generate(targetPage?: WeeklyPageKey) {
    if (!entries.length && !manualNotes.trim()) {
      setMessage("请先汇总工作台记录，或填写手动补充信息")
      return
    }
    if (hasContent) {
      const label = targetPage ? WEEKLY_PAGE_META[targetPage].page : "全部页面"
      if (!window.confirm(`重新生成${label}会覆盖对应的人工修改，是否继续？`)) return
    }
    setGeneratingPage(targetPage || "all")
    setMessage("")
    try {
      const response = await fetch("/api/weekly-report", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, weekEnd, entries, manualNotes, targetPage }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "生成失败")
      let generatedSections = data.sections as WeeklySections
      let missingPages = (data.missingPages || []) as WeeklyPageKey[]
      if (!targetPage && missingPages.length) {
        const recovered = await Promise.all(missingPages.map(async (key) => {
          const retry = await fetch("/api/weekly-report", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weekStart, weekEnd, entries, manualNotes, targetPage: key }),
          })
          const retryData = await retry.json()
          return { key, value: retry.ok ? retryData.sections?.[key] || "" : "" }
        }))
        generatedSections = { ...generatedSections }
        recovered.forEach(({ key, value }) => { if (value) generatedSections[key] = value })
        missingPages = WEEKLY_PAGE_KEYS.filter((key) => !generatedSections[key])
      }
      setSections((current) => targetPage ? { ...current, [targetPage]: generatedSections[targetPage] } : generatedSections)
      setFinalizedContent("")
      const missing = missingPages.map((key) => WEEKLY_PAGE_META[key].page)
      setMessage(missing.length ? `已保留有效文案；${missing.join("、")}未生成，请单独点击该页“重写”` : targetPage ? `${WEEKLY_PAGE_META[targetPage].page} 已重新生成，请审核` : "PPT正文文案已生成，请逐页审核")
    } catch (error) {
      setMessage(`生成失败：${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setGeneratingPage(null)
    }
  }

  async function save(status: "draft" | "final") {
    if (!hasContent) return
    if (status === "final" && WEEKLY_PAGE_KEYS.some((key) => !sections[key].trim())) {
      setMessage("四个正文页均填写完成后才能定稿")
      return
    }
    setSaving(status)
    setMessage("")
    try {
      const response = await fetch("/api/weekly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, weekEnd, content, summary: `${weekStart} - ${weekEnd} 周报`, status }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "保存失败")
      if (status === "final") setFinalizedContent(content)
      setMessage(status === "final" ? "周报已定稿，可复制或同步飞书" : "周报草稿已保存")
      await loadHistory()
    } catch (error) {
      setMessage(`保存失败：${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setSaving(null)
    }
  }

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text)
    setMessage(`${label}已复制`)
  }

  async function syncToLark() {
    if (!isFinalized) return
    try {
      const webhook = process.env.NEXT_PUBLIC_LARK_WEBHOOK_URL
      if (!webhook) {
        await navigator.clipboard.writeText(content)
        setMessage("未配置飞书 Webhook，已复制定稿文案")
        return
      }
      const response = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msg_type: "text", content: { text: content } }) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setMessage("定稿周报已同步飞书")
    } catch (error) {
      setMessage(`同步失败：${error instanceof Error ? error.message : "未知错误"}`)
    }
  }

  function loadHistoryItem(item: WeeklyHistory) {
    setWeekStart(item.week_start)
    setSections(parseWeeklySections(item.content))
    setFinalizedContent(item.exported ? item.content : "")
    setMessage(item.exported ? "已加载定稿周报" : "已加载周报草稿")
    setShowHistory(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />按PPT模板生成周报文案</CardTitle>
          <CardDescription>汇总工作台真实记录，仅生成模板 P4、P7、P8、P9 正文，不生成或修改PPT文件。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">周区间</span>
            <Input type="date" value={weekStart} onChange={(event) => { setWeekStart(event.target.value); setEntries([]); setCoverage([]) }} className="w-40" />
            <span className="text-sm text-muted-foreground">至 {weekEnd}</span>
            <Button variant="outline" onClick={loadSources} disabled={loadingSources}>
              {loadingSources ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}从工作台汇总
            </Button>
            <Button onClick={() => generate()} disabled={Boolean(generatingPage) || (!entries.length && !manualNotes.trim())}>
              {generatingPage === "all" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}生成PPT正文
            </Button>
          </div>

          {coverage.length > 0 && (
            <div className="rounded-xl border bg-muted/25 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">数据覆盖</span>
                <Badge variant="secondary">事实 {factCount}</Badge><Badge variant="secondary">计划 {planCount}</Badge><Badge variant="secondary">风险 {riskCount}</Badge><Badge variant="outline">定稿日报 {dailyCount}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {coverage.map((item) => <Badge key={item.source} variant={item.available && item.count > 0 ? "success" : "outline"}>{item.source} {item.available ? item.count : "不可用"}</Badge>)}
              </div>
              {(missingSources.length > 0 || unavailableSources.length > 0) && <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />无记录的来源会自动省略；不可用来源不会参与生成。可在下方补充本周遗漏信息。</p>}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">手动补充（可选）</label>
            <Textarea value={manualNotes} onChange={(event) => setManualNotes(event.target.value)} rows={4} placeholder="补充未录入工作台的完成事项、问题或下周计划。请明确写出事实/计划，AI不会自行补全。" />
          </div>

          {message && <div className={`rounded-lg p-3 text-sm ${/失败|不能|不可用/.test(message) ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700"}`}>{message}</div>}
        </CardContent>
      </Card>

      {hasContent && <div className="grid gap-5 lg:grid-cols-2">
        {WEEKLY_PAGE_KEYS.map((key) => {
          const meta = WEEKLY_PAGE_META[key]
          return <Card key={key} className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div><div className="mb-1 text-xs font-semibold tracking-[0.18em] text-primary">{meta.page}</div><CardTitle className="text-base">{meta.title}</CardTitle><CardDescription className="mt-1">{meta.hint}</CardDescription></div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => copy(sections[key], `${meta.page}文案`)}><ClipboardCopy className="mr-1 h-3.5 w-3.5" />复制</Button>
                  <Button variant="ghost" size="sm" onClick={() => generate(key)} disabled={Boolean(generatingPage)}>{generatingPage === key ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}重写</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4"><Textarea value={sections[key]} onChange={(event) => { setSections((current) => ({ ...current, [key]: event.target.value })); setFinalizedContent("") }} rows={key === "p4" || key === "p8" ? 10 : 8} className="resize-y font-mono text-sm leading-relaxed" /></CardContent>
          </Card>
        })}
      </div>}

      {hasContent && <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={() => copy(content, "全部正文")}><ClipboardCopy className="mr-1 h-4 w-4" />复制全部正文</Button>
        <Button variant="outline" onClick={() => save("draft")} disabled={Boolean(saving)}>{saving === "draft" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}保存草稿</Button>
        <Button onClick={() => save("final")} disabled={Boolean(saving)}>{saving === "final" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />}{isFinalized ? "已定稿" : "确认定稿"}</Button>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={syncToLark} disabled={!isFinalized}><Send className="mr-1 h-4 w-4" />同步飞书</Button>
      </div>}

      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setShowHistory((value) => !value)}><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" />周报历史 ({history.length})</CardTitle></CardHeader>
        {showHistory && <CardContent className="space-y-2">{history.length ? history.map((item) => <button key={item.id} onClick={() => loadHistoryItem(item)} className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/30"><span className="text-sm font-medium">{item.week_start} 至 {item.week_end}</span><Badge variant={item.exported ? "success" : "warning"}>{item.exported ? "已定稿" : "草稿"}</Badge></button>) : <p className="py-4 text-center text-sm text-muted-foreground">暂无周报记录</p>}</CardContent>}
      </Card>
    </div>
  )
}

function getMonday(date = new Date()) {
  const value = new Date(date)
  const day = value.getDay()
  value.setDate(value.getDate() - day + (day === 0 ? -6 : 1))
  return formatLocalDate(value)
}

function getFriday(monday: string) {
  const value = new Date(`${monday}T00:00:00`)
  value.setDate(value.getDate() + 4)
  return formatLocalDate(value)
}

function formatLocalDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
