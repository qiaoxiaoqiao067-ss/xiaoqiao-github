"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Check, ChevronDown, ClipboardCopy, Download, FileCheck2, FileText, FolderOpen, History, Loader2, Save, Search, Upload, AlertCircle } from "lucide-react"
import { PageHero } from "@/components/layout/page-hero"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useProjects } from "@/hooks/use-projects"
import { useProjectFiles } from "@/hooks/use-project-files"
import { analyzeScript } from "@/lib/statistics/engine"
import { parseLocalScript } from "@/lib/statistics/extract"
import type { ClassifiedLine, ScriptSource, StatisticsOptions } from "@/lib/statistics/types"
import { basisLabel, canConfirmSourceReview, downloadText, KIND_LABEL, needsStatisticsReview, quotationText, scopeLabel, selectedLines, statisticsCsv, statisticsReport } from "./report"

type Override = NonNullable<StatisticsOptions["overrides"]>[string]
type HistoricalJob = { id: string; title: string; target_language?: string; target_market?: string; status?: string; project_id?: string }
const SELECT_STYLE = "h-10 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
const HISTORY_STATUS: Record<string, string> = { pending: "待外部翻译", translating: "翻译中", draft_ready: "待验收", reviewing: "待验收", awaiting_confirmation: "待确认", delivered: "已交付", archived: "已归档", failed: "历史失败记录" }

export function StatisticsWorkspace() {
  const query = useSearchParams()
  const [projectId, setProjectId] = useState(query.get("projectId") || "")
  const queryFileId = query.get("fileId") || ""
  const queryKind = query.get("fileKind") === "content" ? "content" : "project"
  const [entryMode, setEntryMode] = useState<"upload" | "existing">(queryFileId ? "existing" : "upload")
  const [existingFile, setExistingFile] = useState(queryFileId ? `${queryKind}:${queryFileId}` : "")
  const { projects, loading: projectsLoading, error: projectsError } = useProjects()
  const { files, loading: filesLoading, error: filesError, addText } = useProjectFiles(projectId || undefined)
  const project = projects.find((item) => item.id === projectId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<ScriptSource | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [startEpisode, setStartEpisode] = useState("")
  const [endEpisode, setEndEpisode] = useState("")
  const [basis, setBasis] = useState<"dialogue" | "full">("dialogue")
  const [includeVoiceover, setIncludeVoiceover] = useState(true)
  const [includeScreenText, setIncludeScreenText] = useState(false)
  const [minRate, setMinRate] = useState("120")
  const [maxRate, setMaxRate] = useState("150")
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [contentOverrides, setContentOverrides] = useState<Record<string, string>>({})
  const [bodyStartLineId, setBodyStartLineId] = useState("")
  const [bodySearch, setBodySearch] = useState("")
  const [reviewedExtraction, setReviewedExtraction] = useState(false)
  const [reviewFilter, setReviewFilter] = useState("review")
  const [lineSearch, setLineSearch] = useState("")
  const [reviewPage, setReviewPage] = useState(0)
  const [history, setHistory] = useState<HistoricalJob[]>([])
  const [historyState, setHistoryState] = useState<"idle" | "loading" | "loaded" | "failed">("idle")
  const [historyError, setHistoryError] = useState("")

  const rateError = !minRate.trim() || !maxRate.trim() || !Number.isFinite(Number(minRate)) || !Number.isFinite(Number(maxRate)) || Number(minRate) <= 0 || Number(maxRate) < Number(minRate) || Number(maxRate) > 100000
    ? "请填写有效单价：最低价大于 0，最高价不低于最低价，且不超过 100,000 元／千字。" : ""
  const rangeError = startEpisode && endEpisode && Number(startEpisode) > Number(endEpisode) ? "起始集不能晚于结束集。" : ""
  const options = useMemo<StatisticsOptions>(() => ({
    startEpisode: startEpisode ? Number(startEpisode) : undefined, endEpisode: endEpisode ? Number(endEpisode) : undefined,
    basis, includeVoiceover, includeScreenText: basis === "dialogue" && includeScreenText,
    minRate: rateError ? 120 : Number(minRate), maxRate: rateError ? 150 : Number(maxRate),
    overrides, contentOverrides, bodyStartLineId: bodyStartLineId || undefined,
  }), [startEpisode, endEpisode, basis, includeVoiceover, includeScreenText, minRate, maxRate, rateError, overrides, contentOverrides, bodyStartLineId])
  const baseline = useMemo(() => source ? analyzeScript(source, {}) : null, [source])
  const result = useMemo(() => source ? analyzeScript({ ...source, requiresReview: Boolean(source.requiresReview && !(reviewedExtraction && canConfirmSourceReview(source))) }, options) : null, [source, options, reviewedExtraction])
  const scopeLines = useMemo(() => result ? selectedLines(result, options) : [], [result, options])
  const pendingLines = scopeLines.filter((line) => (line.kind === "unknown" || line.uncertain) && !overrides[line.id])
  const needsReview = Boolean(source && result && needsStatisticsReview(source, result, options, reviewedExtraction))
  const canExport = Boolean(source && result && !rangeError && !rateError && !busy)
  const warnings = [...new Set([...(source?.warnings || []), ...(result?.warnings || [])])]
  const sourceFiles = files.filter((file) => (!projectId || file.project_id === projectId) && file.status !== "archived" && file.category !== "字数统计报告" && file.category !== "__里程碑确认" && (file.text_content || (file.storage_path && /\.(?:docx?|pdf|txt|md)$/i.test(file.file_name || file.title))))
  const queryFileInList = sourceFiles.some((file) => `project:${file.id}` === existingFile)
  const bodyChoices = useMemo(() => {
    if (!source) return []
    const matches = source.lines.filter((line) => line.text.trim() && (!bodySearch || line.text.toLowerCase().includes(bodySearch.toLowerCase())))
    const visible = matches.slice(0, 200)
    const selected = source.lines.find((line) => line.id === bodyStartLineId)
    return selected && !visible.some((line) => line.id === selected.id) ? [selected, ...visible] : visible
  }, [source, bodySearch, bodyStartLineId])
  const reviewLines = scopeLines.filter((line) => {
    const modified = Boolean(overrides[line.id]) || Object.hasOwn(contentOverrides, line.id)
    const matchesKind = reviewFilter === "all" || (reviewFilter === "review" ? line.kind === "unknown" || line.uncertain || modified : line.kind === reviewFilter)
    return matchesKind && (!lineSearch || line.text.toLowerCase().includes(lineSearch.toLowerCase()))
  })
  const pageCount = Math.max(1, Math.ceil(reviewLines.length / 40))
  const currentPage = Math.min(reviewPage, pageCount - 1)
  const visibleLines = reviewLines.slice(currentPage * 40, currentPage * 40 + 40)

  function acceptSource(next: ScriptSource) {
    setSource(next); setStartEpisode(""); setEndEpisode(""); setOverrides({}); setContentOverrides({})
    setBodyStartLineId(""); setBodySearch(""); setReviewedExtraction(false); setReviewPage(0); setLineSearch(""); setMessage("")
    if (next.projectId) setProjectId(next.projectId)
  }

  async function readResponse(response: Response) {
    const data = await response.json().catch(() => ({})) as { source?: ScriptSource; error?: string }
    if (!response.ok || !data.source) throw new Error(data.error || `文件解析未完成（${response.status}），请重新尝试。`)
    return data.source
  }

  async function readFile(file?: File) {
    if (!file || busy) return
    setBusy(true); setError(""); setMessage(""); setSource(null)
    try {
      const extension = file.name.split(".").pop()?.toLowerCase()
      if (!["docx", "txt", "md", "pdf", "doc"].includes(extension || "")) throw new Error("请选择 DOCX、TXT、Markdown、PDF 或 DOC 剧本。")
      if (file.size === 0) throw new Error("这个文件是空的，请选择含正文的剧本。")
      if (["docx", "txt", "md"].includes(extension || "")) {
        // These formats stay in the browser; no script upload or AI job is created.
        acceptSource(await parseLocalScript(new Uint8Array(await file.arrayBuffer()), file.name))
      } else {
        if (file.size > 4 * 1024 * 1024) throw new Error("PDF 和旧版 DOC 目前限 4MB。请将原稿另存为 DOCX 或 TXT 后再统计。")
        const form = new FormData(); form.set("file", file)
        acceptSource(await readResponse(await fetch("/api/script-statistics", { method: "POST", body: form })))
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "文件读取失败，请重新选择。") }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = "" }
  }

  async function readExisting() {
    if (!existingFile || busy) return
    setBusy(true); setError(""); setMessage(""); setSource(null)
    try {
      const separator = existingFile.indexOf(":")
      const kind = existingFile.slice(0, separator), id = existingFile.slice(separator + 1)
      acceptSource(await readResponse(await fetch("/api/script-statistics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "content" ? { contentFileId: id } : { projectFileId: id }) })))
    } catch (caught) { setError(caught instanceof Error ? caught.message : "版本读取失败。") }
    finally { setBusy(false) }
  }

  function changeOverride(id: string, value: string) {
    setOverrides((current) => { const next = { ...current }; if (value) next[id] = value as Override; else delete next[id]; return next })
    setMessage("")
  }

  function changeContent(id: string, value: string | null) {
    setContentOverrides((current) => { const next = { ...current }; if (value !== null) next[id] = value; else delete next[id]; return next })
    setMessage("")
  }

  async function copyQuote() {
    if (!source || !result || !canExport) return
    try { await navigator.clipboard.writeText(quotationText(source, result, options, needsReview)); setMessage("报价文字已复制，可以直接发给合作方。") }
    catch { setError("未能复制。可以下载统计报告后复制其中的报价。") }
  }

  async function saveReport() {
    if (!source || !result || !project || !canExport || saving) return
    setSaving(true); setError(""); setMessage("")
    try {
      const asset = await addText({ projectId: project.id, category: "字数统计报告", title: `${source.fileName} · ${scopeLabel(options)}字数统计`, text: statisticsReport(source, result, options, project, reviewedExtraction),
        stage: project.stage, status: "active", notes: `${basisLabel(options)} ${result.totals.quoteCharacters} 字 · ¥${result.totals.minCost.toFixed(2)}—${result.totals.maxCost.toFixed(2)}${needsReview ? " · 待复核" : ""}` })
      setMessage(`已保存至《${project.title}》的项目资料库，统计报告 V${asset.version}。`)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "报告保存失败，请重新尝试。") }
    finally { setSaving(false) }
  }

  async function loadHistory() {
    if (historyState === "loading" || historyState === "loaded") return
    setHistoryState("loading"); setHistoryError("")
    try {
      const response = await fetch("/api/localization", { cache: "no-store" })
      const data = await response.json().catch(() => ({})) as { jobs?: HistoricalJob[]; error?: string }
      if (!response.ok) throw new Error(data.error || "历史记录暂时无法读取。")
      setHistory(Array.isArray(data.jobs) ? data.jobs : []); setHistoryState("loaded")
    } catch (caught) { setHistoryError(caught instanceof Error ? caught.message : "历史记录读取失败。"); setHistoryState("failed") }
  }

  return <div className="space-y-5">
    <PageHero compact eyebrow="SCRIPT COUNTER" title="本地化字数统计" description="上传剧本，核对中文台词，估算外部本地化预算。" action={<Button asChild variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link href={projectId ? `/projects/${projectId}` : "/"}><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />{projectId ? "返回项目" : "返回首页"}</Link></Button>} />
    <Card className="overflow-hidden border-[#c8d8c2]">
      <CardHeader className="gap-3 border-b bg-[#f5f9f1] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div><CardTitle className="text-base text-[#173f31]">选择要统计的剧本</CardTitle><p className="mt-1 text-xs text-muted-foreground">可以独立使用，也可以选择项目中的某个文件版本。</p></div>
        <div className="flex w-fit rounded-full border bg-background p-1" aria-label="文件来源"><button type="button" onClick={() => setEntryMode("upload")} aria-pressed={entryMode === "upload"} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${entryMode === "upload" ? "bg-[#173f31] text-white" : "text-muted-foreground"}`}>上传文件</button><button type="button" onClick={() => setEntryMode("existing")} aria-pressed={entryMode === "existing"} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${entryMode === "existing" ? "bg-[#173f31] text-white" : "text-muted-foreground"}`}>已有版本</button></div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <Field label="关联项目（可选）"><select aria-label="关联项目（可选）" value={projectId} onChange={(event) => { setProjectId(event.target.value); setExistingFile(""); setMessage("") }} className={SELECT_STYLE} disabled={projectsLoading || saving}><option value="">不关联，直接统计文件</option>{projects.filter((item) => item.status !== "archived" || item.id === projectId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        {projectsError && <p className="text-xs text-amber-800">项目列表暂时不可用：{projectsError}。仍可直接统计上传的文件。</p>}
        {entryMode === "upload" ? <><input ref={inputRef} type="file" accept=".docx,.txt,.md,.pdf,.doc" className="hidden" onChange={(event) => void readFile(event.target.files?.[0])} /><button type="button" disabled={busy} onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!busy) void readFile(event.dataTransfer.files[0]) }} className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#b4cbae] bg-[#f9fbf6] px-4 py-7 text-center transition hover:border-primary hover:bg-[#f1f7eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60">
          {busy ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <Upload className="h-7 w-7 text-primary" />}<span className="mt-3 text-sm font-semibold text-[#173f31]">{busy ? "正在读取并统计…" : "点击选择剧本，或拖到这里"}</span><span className="mt-1 text-xs text-muted-foreground">DOCX、TXT、Markdown 可直接在浏览器中统计</span><span className="mt-1 text-[11px] text-muted-foreground">PDF、旧版 DOC 限 4MB，识别后请核对原文</span>
        </button></> : <div className="space-y-2"><div className="flex flex-col gap-2 sm:flex-row"><label className="min-w-0 flex-1"><span className="sr-only">选择已有文件版本</span><select value={existingFile} onChange={(event) => setExistingFile(event.target.value)} className={SELECT_STYLE} disabled={filesLoading || busy}><option value="">选择已有文件版本</option>{existingFile && !queryFileInList && <option value={existingFile}>{existingFile.startsWith("content:") ? "稿件详情中选择的版本" : "项目详情中选择的版本"}（{existingFile.split(":")[1]?.slice(0, 8)}）</option>}{sourceFiles.map((file) => <option key={file.id} value={`project:${file.id}`}>{projectId ? "" : `${projects.find((item) => item.id === file.project_id)?.title || "项目文件"} · `}{file.file_name || file.title} · V{file.version}</option>)}</select></label><Button onClick={() => void readExisting()} disabled={!existingFile || busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}统计此版本</Button></div>{filesError && <p className="text-xs text-amber-800">{filesError}</p>}<p className="text-[11px] text-muted-foreground">也可以从稿件详情的文件版本进入统计，读取原件后保留来源版本。</p></div>}
      </CardContent>
    </Card>
    {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">{error}</span></div>}
    {message && <p role="status" className="flex gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary"><Check className="mt-0.5 h-4 w-4 shrink-0" />{message}</p>}

    {source && result ? <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{source.fileName}</p><p className="mt-1 text-[11px] text-muted-foreground">{source.sourceVersion ? `原件 V${source.sourceVersion} · ` : ""}{baseline?.episodeNumbers.length ? `识别到 ${baseline.episodeNumbers.length} 集` : "未识别到明确分集，按正文统计"} · {source.format.toUpperCase()}</p></div><Badge variant={needsReview ? "outline" : "secondary"}>{needsReview ? "结果待复核" : "已生成统计"}</Badge></div>
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">统计范围与口径</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="起始集"><select aria-label="起始集" value={startEpisode} className={SELECT_STYLE} onChange={(event) => { setStartEpisode(event.target.value); setReviewPage(0); setMessage("") }}><option value="">从正文开始</option>{baseline?.episodeNumbers.map((episode) => <option key={episode} value={episode}>第 {episode} 集</option>)}</select></Field><Field label="结束集"><select aria-label="结束集" value={endEpisode} className={SELECT_STYLE} onChange={(event) => { setEndEpisode(event.target.value); setReviewPage(0); setMessage("") }}><option value="">到正文结束</option>{baseline?.episodeNumbers.map((episode) => <option key={episode} value={episode}>第 {episode} 集</option>)}</select></Field></div>
        {rangeError && <p role="alert" className="text-xs text-red-700">{rangeError}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeVoiceover} onChange={(event) => { setIncludeVoiceover(event.target.checked); setMessage("") }} className="h-4 w-4 accent-[#173f31]" />计入 VO／OS／旁白</label><label className={`flex items-center gap-2 text-sm ${basis === "full" ? "text-muted-foreground" : ""}`}><input type="checkbox" checked={includeScreenText} disabled={basis === "full"} onChange={(event) => { setIncludeScreenText(event.target.checked); setMessage("") }} className="h-4 w-4 accent-[#173f31]" />把短信、字幕等画面字加入台词报价</label></div>
        <p className="text-xs leading-6 text-muted-foreground">只计中文汉字，不计英文、阿拉伯数字、标点和空白。台词排除人物标签及括号表演提示；全本统计包含正文中的场景、人物和动作说明。</p>
        <details className="rounded-xl border bg-muted/15 px-3 py-2"><summary className="cursor-pointer text-xs font-semibold text-primary">正文起点不对？手动修正</summary><div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">简介、大纲和人物小传应放在正文之前。请选择完整剧本开始的那一行，选中后会重新计算。</p><Input value={bodySearch} onChange={(event) => setBodySearch(event.target.value)} placeholder="搜索正文第一行，例如：第1集" aria-label="搜索正文起点" /><select className={SELECT_STYLE} value={bodyStartLineId} onChange={(event) => { setBodyStartLineId(event.target.value); setReviewPage(0); setMessage("") }} aria-label="正文起始行"><option value="">使用自动识别的正文起点</option>{bodyChoices.map((line) => <option key={line.id} value={line.id}>第{line.paragraph}段 · {line.text.slice(0, 100)}</option>)}</select><p className="text-[11px] text-muted-foreground">每次最多显示 200 行，可用关键词定位。这个选择不会修改原文件。</p></div></details>
      </CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-3"><CountCard title="全本中文" value={result.totals.full} description="当前选段中的全部正文" /><CountCard title="发声台词" value={result.totals.dialogue} description={includeVoiceover ? "含 VO／OS／旁白" : "不含 VO／OS／旁白"} emphasis /><CountCard title="画面文字" value={result.totals.screen} description="短信、字幕、屏幕和纸上文字" /></div>
      <Card className="overflow-hidden border-[#b4cbae]"><CardHeader className="border-b bg-[#edf5e6] pb-4"><CardTitle className="text-base text-[#173f31]">外部本地化报价预估</CardTitle><p className="text-xs text-[#5e7158]">{scopeLabel(options)} · 根据所选文字范围计算</p></CardHeader><CardContent className="space-y-4 pt-4">
        <fieldset><legend className="mb-2 text-xs font-semibold text-muted-foreground">按哪部分报价</legend><div className="grid gap-2 sm:grid-cols-2"><BasisChoice value="dialogue" checked={basis === "dialogue"} onChange={setBasis} title="按台词报价" description={includeScreenText ? "发声台词＋画面文字" : "默认仅计发声台词"} /><BasisChoice value="full" checked={basis === "full"} onChange={setBasis} title="按全本报价" description="含场景、人物、动作和画面文字" /></div></fieldset>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="最低单价（元／千字）"><Input aria-label="最低单价（元／千字）" type="number" min="0.01" step="0.01" value={minRate} onChange={(event) => { setMinRate(event.target.value); setMessage("") }} /></Field><Field label="最高单价（元／千字）"><Input aria-label="最高单价（元／千字）" type="number" min="0.01" step="0.01" value={maxRate} onChange={(event) => { setMaxRate(event.target.value); setMessage("") }} /></Field></div>
        {rateError && <p role="alert" className="text-xs text-red-700">{rateError}</p>}
        <div className="rounded-2xl bg-[#173f31] p-5 text-white"><p className="text-xs text-white/70">{basisLabel(options)} · {result.totals.quoteCharacters.toLocaleString("zh-CN")} 字{needsReview ? " · 待复核" : ""}</p><p className="mt-2 break-words text-2xl font-semibold tracking-tight text-[#d2f77b] sm:text-3xl">{rateError || rangeError ? "请先修正统计选项" : `¥${money(result.totals.minCost)} — ¥${money(result.totals.maxCost)}`}</p><p className="mt-2 text-[11px] text-white/65">字数 ÷ 1,000 × 单价。不足千字按实际字数折算。</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void copyQuote()} disabled={!canExport}><ClipboardCopy className="mr-1.5 h-4 w-4" />复制报价文字</Button><Button variant="outline" disabled={!canExport} onClick={() => downloadText(`${source.fileName}-逐行字数.csv`, statisticsCsv(result, options), "text/csv;charset=utf-8")}><Download className="mr-1.5 h-4 w-4" />导出 CSV 明细</Button><Button variant="outline" disabled={!canExport} onClick={() => downloadText(`${source.fileName}-统计报告.md`, statisticsReport(source, result, options, project, reviewedExtraction), "text/markdown;charset=utf-8")}><FileText className="mr-1.5 h-4 w-4" />下载统计报告</Button></div>
      </CardContent></Card>
      {(warnings.length > 0 || source.requiresReview) && <div className="rounded-xl border border-amber-200 bg-amber-50/65 p-4 text-amber-950"><p className="flex items-center gap-2 text-sm font-semibold"><AlertCircle className="h-4 w-4" />请核对这些内容</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-6">{warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}{source.requiresReview && <li>{canConfirmSourceReview(source) ? "识别可能出现断行或顺序变化，请结合原件检查正文起点和台词分类。" : "文件存在无法完整读取的内容，请另存为可读取的 DOCX 或 TXT 后重新统计。"}</li>}</ul>{source.requiresReview && canConfirmSourceReview(source) && <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={reviewedExtraction} onChange={(event) => setReviewedExtraction(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#173f31]" />我已对照原文件，核对识别文字和正文范围</label>}</div>}
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">逐行核对 <span className="ml-1 text-sm font-normal text-muted-foreground">{pendingLines.length ? `${pendingLines.length} 行待确认` : "可查看或修正识别分类"}</span></CardTitle><p className="text-xs leading-6 text-muted-foreground">可以指定分类，也能展开“计数正文”，去掉误连的人名或恢复真实的内心独白。修改后立即重新统计，原文保持可见。</p></CardHeader><CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row"><select value={reviewFilter} className={`${SELECT_STYLE} sm:w-52`} aria-label="筛选识别分类" onChange={(event) => { setReviewFilter(event.target.value); setReviewPage(0) }}><option value="review">待确认与人工修正</option><option value="dialogue">发声台词</option><option value="screen">画面文字</option><option value="action">动作说明</option><option value="all">全部正文行</option></select><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={lineSearch} className="pl-9" onChange={(event) => { setLineSearch(event.target.value); setReviewPage(0) }} placeholder="搜索原文" aria-label="搜索逐行原文" /></div></div>
        {visibleLines.length ? <div className="divide-y overflow-hidden rounded-xl border">{visibleLines.map((line) => <ReviewLine key={line.id} line={line} override={overrides[line.id]} contentOverride={contentOverrides[line.id]} onChange={(value) => changeOverride(line.id, value)} onContent={(value) => changeContent(line.id, value)} />)}</div> : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{reviewFilter === "review" ? "当前选段没有待确认行。仍可切换分类，抽查台词和画面文字。" : "没有符合条件的行。"}</p>}
        {reviewLines.length > 40 && <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>共 {reviewLines.length} 行 · 第 {currentPage + 1}/{pageCount} 页</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setReviewPage(currentPage - 1)}>上一页</Button><Button size="sm" variant="outline" disabled={currentPage >= pageCount - 1} onClick={() => setReviewPage(currentPage + 1)}>下一页</Button></div></div>}
      </CardContent></Card>
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">按集明细</CardTitle></CardHeader><CardContent>{result.episodes.length ? <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-xs"><thead className="bg-muted/35 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">集数</th><th className="px-4 py-3 text-right font-medium">全本中文</th><th className="px-4 py-3 text-right font-medium">发声台词</th><th className="px-4 py-3 text-right font-medium">画面文字</th></tr></thead><tbody className="divide-y">{result.episodes.map((episode) => <tr key={episode.episode}><td className="whitespace-nowrap px-4 py-2.5">第 {episode.episode} 集</td><td className="px-4 py-2.5 text-right tabular-nums">{episode.full.toLocaleString("zh-CN")}</td><td className="px-4 py-2.5 text-right font-semibold tabular-nums text-primary">{episode.dialogue.toLocaleString("zh-CN")}</td><td className="px-4 py-2.5 text-right tabular-nums">{episode.screen.toLocaleString("zh-CN")}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">没有识别到明确集号。上方结果按正文统计，可在“逐行核对”查看内容。</p>}</CardContent></Card>
      <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">把这次统计留在项目里</p><p className="mt-1 text-xs leading-6 text-muted-foreground">{project ? `保存到《${project.title}》的“字数统计报告”，保留来源版本、计数选项和报价。` : "在上方选择关联项目后，就可以保存统计报告。"}</p></div><Button disabled={!project || !canExport || saving} onClick={() => void saveReport()}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}保存统计报告</Button></CardContent></Card>
    </> : !busy && <div className="rounded-2xl border border-dashed bg-card px-5 py-10 text-center"><FileCheck2 className="mx-auto h-9 w-9 text-primary/40" /><p className="mt-3 text-sm font-semibold text-[#173f31]">先选择一份剧本</p><p className="mx-auto mt-2 max-w-md text-xs leading-6 text-muted-foreground">这里会分别展示全本中文、发声台词和画面字，并按 120—150 元／千字给出报价区间。</p></div>}
    <details className="rounded-xl border bg-card px-4 py-3" onToggle={(event) => { if (event.currentTarget.open) void loadHistory() }}><summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-muted-foreground"><History className="h-4 w-4" />历史本地化交付记录 <span className="font-normal">只读</span><ChevronDown className="ml-auto h-3.5 w-3.5" /></summary><div className="mt-3">{historyState === "loading" ? <p className="text-xs text-muted-foreground">正在读取历史记录…</p> : historyState === "failed" ? <div><p className="text-xs text-red-700">{historyError}</p><Button className="mt-2" size="sm" variant="outline" onClick={() => void loadHistory()}>重新加载</Button></div> : <HistoryList jobs={history.filter((job) => !projectId || job.project_id === projectId)} />}</div></details>
  </div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>
}

function CountCard({ title, value, description, emphasis = false }: { title: string; value: number; description: string; emphasis?: boolean }) {
  return <Card className={emphasis ? "border-[#b3cfa5] bg-[#f1f7eb]" : ""}><CardContent className="p-4"><p className="text-xs font-semibold text-muted-foreground">{title}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-[#173f31]">{value.toLocaleString("zh-CN")}<span className="ml-1 text-xs font-normal text-muted-foreground">字</span></p><p className="mt-2 text-[11px] text-muted-foreground">{description}</p></CardContent></Card>
}

function BasisChoice({ value, checked, onChange, title, description }: { value: "full" | "dialogue"; checked: boolean; onChange: (value: "full" | "dialogue") => void; title: string; description: string }) {
  return <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${checked ? "border-[#81a96c] bg-[#f1f7eb]" : ""}`}><input type="radio" name="quotation-basis" checked={checked} onChange={() => onChange(value)} className="mt-1 accent-[#173f31]" /><span><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-[11px] text-muted-foreground">{description}</span></span></label>
}

function ReviewLine({ line, override, contentOverride, onChange, onContent }: { line: ClassifiedLine; override?: Override; contentOverride?: string; onChange: (value: string) => void; onContent: (value: string | null) => void }) {
  return <div className="grid gap-3 bg-card p-3 sm:grid-cols-[minmax(0,1fr)_145px]"><div className="min-w-0"><div className="mb-1.5 flex flex-wrap items-center gap-2"><span className="text-[10px] text-muted-foreground">{line.episode !== null ? `第${line.episode}集 · ` : ""}第{line.paragraph}段 · 行{line.line}</span><Badge variant="outline" className="text-[9px]">{KIND_LABEL[line.kind]}</Badge><span className="text-[10px] font-semibold text-primary">{line.count} 字</span>{(override || contentOverride !== undefined) && <span className="text-[10px] text-primary">已人工修正</span>}</div><p className="whitespace-pre-wrap break-words text-xs leading-6">{line.text}</p>{line.reason && <p className="mt-1 text-[10px] leading-5 text-muted-foreground">{line.reason}</p>}<details className="mt-2 rounded-lg border border-dashed px-2.5 py-2"><summary className="cursor-pointer text-[11px] font-semibold text-primary">查看或修正计数正文</summary><label className="mt-2 block"><span className="mb-1 block text-[10px] text-muted-foreground">只填写真正需要计数的文字；人物名和表演提示不要放进来。</span><Textarea value={contentOverride ?? line.content} onChange={(event) => onContent(event.target.value)} rows={3} className="text-xs" aria-label={`第${line.paragraph}段行${line.line}计数正文`} /></label>{contentOverride !== undefined && <Button variant="ghost" size="sm" className="mt-1 h-7 text-[10px]" onClick={() => onContent(null)}>恢复自动提取的正文</Button>}</details></div><label className="self-start"><span className="sr-only">第{line.paragraph}段行{line.line}的分类</span><select value={override || ""} onChange={(event) => onChange(event.target.value)} className={`${SELECT_STYLE} h-9 text-xs`}><option value="">按自动识别</option><option value="dialogue">确认为台词</option><option value="screen">确认为画面字</option><option value="action">确认为动作</option><option value="excluded">排除这一行</option></select></label></div>
}

function HistoryList({ jobs }: { jobs: HistoricalJob[] }) {
  if (!jobs.length) return <p className="py-3 text-xs text-muted-foreground">没有相应的历史交付记录。</p>
  return <div className="divide-y">{jobs.map((job) => <div key={job.id} className="flex flex-wrap items-center gap-2 py-2"><FolderOpen className="h-3.5 w-3.5 text-muted-foreground" /><span className="min-w-0 flex-1 break-words text-xs">{job.title}</span><span className="text-[10px] text-muted-foreground">{job.target_language || "语言未记录"}{job.target_market ? ` · ${job.target_market}` : ""}</span><Badge variant="outline" className="text-[9px]">{HISTORY_STATUS[job.status || ""] || "历史记录"}</Badge></div>)}</div>
}

function money(value: number) { return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
