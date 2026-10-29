"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { AppLayout } from "@/components/layout/app-layout"
import { useProjects } from "@/hooks/use-projects"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, CheckCircle2, Copy, Download, FileSignature, FileText, FolderKanban, Loader2, PenLine, Sparkles, Trash2, Upload } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { DeleteContentDialog } from "@/components/content/delete-content-dialog"

type ReviewResult = {
  error?: string
  workflow?: { stage?: string; progress?: number; benchmark_count?: number }
  overall_score?: number
  grade?: string
  verdict?: string
  confidence?: number
  material?: { type?: string; coverage?: string; completeness?: string; truncated?: boolean }
  one_line_hook?: string
  summary?: string
  dimensions?: Array<{ name: string; score: number; max_score?: number; evidence?: string; finding: string; suggestion: string }>
  phases?: Array<{ phase: string; finding: string }>
  strengths?: string[]
  risks?: string[]
  editorial_actions?: { must_keep?: string[]; must_fix?: string[]; optional?: string[]; human_check?: string[] }
  priority_fixes?: string[]
  evidence?: string[]
  next_action?: string
  notes?: string
  modules?: { compliance?: { level?: string; gate?: string; summary?: string; risks?: string[] }; comparison?: { available?: boolean; summary?: string; references?: string[] }; style?: { summary?: string; findings?: string[] } }
}

type ContentDetail = {
  id: string
  title: string
  content_type: string
  status: string
  source: string | null
  market: string | null
  genre: string | null
  logline: string | null
  archived_at?: string | null
  content_files: Array<{ id: string; file_name: string; version: number; parse_status: string; extracted_text: string | null; size_bytes: number | null; created_at: string }>
  content_reviews: Array<{ id: string; reviewer_type: "ai" | "human"; status: string; score: number | null; result: ReviewResult | null; model?: string | null; is_final: boolean; created_at: string }>
}

type HumanVerdict = "审核通过" | "退修" | "不采用"
type DevelopmentAction = "create" | "purchase" | "contract" | "revision"

const TECH_STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  parsing: "文件解析中",
  ready: "待审核",
  reviewing: "AI审核中",
  reviewed: "审核已完成",
  developing: "审核已完成",
  archived: "已归档",
}

const normalizeVerdict = (verdict?: string): HumanVerdict | undefined => {
  if (verdict === "审核通过" || verdict === "推荐开发") return "审核通过"
  if (verdict === "退修" || verdict === "修改后复审") return "退修"
  if (verdict === "不采用" || verdict === "暂不开发") return "不采用"
  return undefined
}

export default function ContentDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const uploadInput = useRef<HTMLInputElement>(null)
  const pollingRef = useRef(false)
  const [content, setContent] = useState<ContentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [humanVerdict, setHumanVerdict] = useState<HumanVerdict>("退修")
  const [humanScore, setHumanScore] = useState("70")
  const [humanNotes, setHumanNotes] = useState("")
  const [savingHuman, setSavingHuman] = useState(false)
  const [projectAction, setProjectAction] = useState<DevelopmentAction | null>(null)
  const [copiedCodex, setCopiedCodex] = useState(false)
  const [codexResultText, setCodexResultText] = useState("")
  const [codexMode, setCodexMode] = useState("业务审核")
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { projects, addProject, updateProject } = useProjects()

  const loadContent = useCallback(async (silent = false) => {
    if (pollingRef.current) return
    pollingRef.current = true
    if (!silent) setLoading(true)
    try {
      const response = await fetch(`/api/contents?id=${params.id}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) {
        if (!silent) setError(data.error || "加载失败")
      } else {
        setContent(data.content)
        if (!silent) setError("")
      }
    } catch (caught: unknown) {
      if (!silent) setError(caught instanceof Error ? caught.message : "加载失败")
    } finally {
      pollingRef.current = false
      if (!silent) setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadContent()
  }, [loadContent])

  useEffect(() => {
    if (content?.status !== "reviewing") return
    const timer = window.setInterval(() => void loadContent(true), 3000)
    return () => window.clearInterval(timer)
  }, [content?.status, loadContent])

  const runReview = async () => {
    setReviewing(true)
    setError("")
    try {
      const response = await fetch(`/api/contents/${params.id}/queue-review`, { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "审核入队失败")
      await loadContent()
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "审核失败")
    } finally {
      setReviewing(false)
    }
  }

  const deleteContent = async () => {
    if (!content || deleting) return
    setDeleting(true)
    setError("")
    try {
      const response = await fetch(`/api/contents?id=${encodeURIComponent(content.id)}`, { method: "DELETE" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "删除失败")
      router.replace("/content")
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "删除失败")
      setDeleting(false)
      setShowDelete(false)
    }
  }

  const uploadVersion = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError("")
    try {
      const form = new FormData()
      form.set("file", file)
      form.set("contentId", params.id)
      const response = await fetch("/api/contents/upload", { method: "POST", body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "上传失败")
      await loadContent()
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "上传失败")
    } finally {
      setUploading(false)
      if (uploadInput.current) uploadInput.current.value = ""
    }
  }

  const saveHumanReview = async () => {
    setSavingHuman(true)
    setError("")
    try {
      const response = await fetch(`/api/contents/${params.id}/human-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict: humanVerdict, score: Number(humanScore), notes: humanNotes }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "保存失败")
      setHumanNotes("")
      await loadContent()
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "保存失败")
    } finally {
      setSavingHuman(false)
    }
  }

  if (loading) return <AppLayout><div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div></AppLayout>
  if (!content) return <AppLayout><div className="rounded-lg bg-destructive/10 p-4 text-destructive">{error || "内容不存在"}</div></AppLayout>

  const files = [...content.content_files].sort((a, b) => b.version - a.version)
  const reviews = [...content.content_reviews].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const latestReview = reviews.find((review) => review.reviewer_type === "ai" && review.status === "completed")
  const activeReview = reviews.find((review) => review.reviewer_type === "ai" && (review.status === "pending" || review.status === "running"))
  const latestFailedReview = reviews.find((review) => review.reviewer_type === "ai" && review.status === "failed")
  const latestHuman = reviews.find((review) => review.reviewer_type === "human" && review.status === "completed" && review.is_final)
  const result = latestReview?.result
  const canReview = files.some((file) => file.parse_status === "ready")
  const linkedProject = projects.find((project) => project.content_id === content.id)

  const advanceToDevelopment = async (action: DevelopmentAction) => {
    const actionConfig = {
      create: { stage: "正式推进", progress: 10, next_action: "确认开发计划与排期", note: "责编审核通过，建立项目推进" },
      purchase: { stage: "拟购买/合同审批", progress: 12, next_action: "确认采购意向与合同要点", note: "责编审核通过，标记为拟购买" },
      contract: { stage: "拟购买/合同审批", progress: 15, next_action: "在飞书发起剧本采购合同审批", note: "责编审核通过，进入合同审批" },
      revision: { stage: "剧本修改", progress: 28, next_action: "根据责编意见推进定制修改", note: "责编审核通过，进入定制修改" },
    }[action]
    setProjectAction(action)
    setError("")
    try {
      if (linkedProject) {
        await updateProject(linkedProject.id, {
          stage: actionConfig.stage,
          progress: Math.max(linkedProject.progress, actionConfig.progress),
          next_action: actionConfig.next_action,
          notes: [linkedProject.notes, actionConfig.note].filter(Boolean).join("\n"),
        })
      } else {
        await addProject({
          title: content.title,
          content_id: content.id,
          market: content.market,
          genre: content.genre,
          stage: actionConfig.stage,
          progress: actionConfig.progress,
          next_action: actionConfig.next_action,
          notes: [latestHuman?.result?.notes, actionConfig.note].filter(Boolean).join("\n\n"),
        })
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "推进项目失败")
    } finally {
      setProjectAction(null)
    }
  }

  const copyCodexReviewPack = async () => {
    const file = files[0]
    const skillName: Record<string, string> = { "业务审核": "script-review-skill", "合规审核": "compliance-review-skill", "爆款对比": "comparative-review-skill", "风格分析": "style-analysis-skill" }
    const instruction: Record<string, string> = {
      "业务审核": "按 script-review-skill 执行：检查节奏、冲突、人物一致性、开篇与集尾钩子、事件完整性、逻辑连续性、格式和AI真人短剧可拍性。每个问题必须给出具体位置、问题和可执行修改动作；最后给出 PASS/FAIL 与推荐开发/修改后复审/暂不开发建议。",
      "合规审核": `按 compliance-review-skill 执行：检查题材、台词、人物关系、价值导向、画面和平台风险，并区分红线/黄线。当前目标市场为“${content.market || "未填写"}”，请先明确采用国内平台还是海外平台审核口径；不能把国内口径未经说明地套到海外项目。每项风险给出原文位置、风险级别、原因和替代表达，最后给出 PASS/FAIL。`,
      "爆款对比": "按 comparative-review-skill 执行：对比开篇速度、节奏、对白、情绪价值、冲突/反转、结构、跨集重复和事件完整性。只有在提供参考爆款剧本或明确参考样本时才能做严格对比；没有参考资料时必须明确说明“无法完成严格对比”，不得虚构Top 5或假造样本。最后给出 PASS/FAIL 和可执行改法。",
      "风格分析": "按 style-analysis-skill 执行：分析句长、对话比、视觉标记、网文感关键词和节奏，并在有参考剧本时做对比。请同时指出对白辨识度、可读性和AI真人短剧表达适配度；没有参考文本时只做单稿分析，不虚构对标数据。"
    }
    const pack = `# AI短剧${codexMode}审核包\n\n## 使用方式\n请在外部 AI 中使用本地 Skill：${skillName[codexMode]}。这是一个复制到外部 AI 的审核包，不会自动发送任何内容。只依据剧本文本判断，不补写不存在的情节。\n\n## 执行指令\n${instruction[codexMode]}\n\n## 稿件信息\n- 标题：${content.title}\n- 市场：${content.market || "未填写"}\n- 题材：${content.genre || "未填写"}\n- 来源：${content.source || "未填写"}\n- 文件：${file?.file_name || "未上传"}\n\n## 统一输出要求\n请使用中文，先给结论，再给证据和修改建议；区分“剧本文本事实”“专业判断”“需要人工确认”。不要把AI意见直接当作最终责编结论，最终是否推荐由责编确认。\n\n## 剧本文本\n${file?.extracted_text || "尚未完成文本解析，请先在工作台完成解析。"}`
    await navigator.clipboard.writeText(pack)
    setCopiedCodex(true)
    window.setTimeout(() => setCopiedCodex(false), 2400)
  }

  const importCodexResult = () => {
    if (!codexResultText.trim()) return
    try {
      const cleaned = codexResultText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
      const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}")
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { overall_score?: number; score?: number; verdict?: string; notes?: string; summary?: string; priority_fixes?: string[] }
        const verdict = parsed.verdict
        const normalizedVerdict = normalizeVerdict(verdict)
        if (normalizedVerdict) setHumanVerdict(normalizedVerdict)
        if (typeof parsed.overall_score === "number" || typeof parsed.score === "number") setHumanScore(String(Math.round(parsed.overall_score ?? parsed.score ?? 70)))
        const notes = [parsed.notes, parsed.summary, parsed.priority_fixes?.length ? `优先修改：\n${parsed.priority_fixes.join("\n")}` : ""].filter(Boolean).join("\n\n")
        if (notes) setHumanNotes(notes)
      } else setHumanNotes(codexResultText.trim())
      setError("")
    } catch { setHumanNotes(codexResultText.trim()) }
    setCodexResultText("")
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <Link href="/content" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />返回内容中心</Link>
        <div className="relative overflow-hidden rounded-[2rem] bg-[#123b2d] p-6 text-[#f7f4e9] shadow-[0_24px_65px_rgba(18,59,45,.18)] sm:p-8">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#c9f45a]/15 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="mb-3 flex flex-wrap gap-2"><Badge className="bg-[#c9f45a] text-[#102a21]">{content.content_type}</Badge><Badge variant="outline" className="border-white/20 text-white">处理状态 · {TECH_STATUS_LABEL[content.status] || content.status}</Badge>{latestHuman && <Badge variant="outline" className="border-white/20 text-white">责编判断 · {normalizeVerdict(latestHuman.result?.verdict) || latestHuman.result?.verdict}</Badge>}{content.status==="archived"&&content.archived_at&&<Badge variant="outline" className="border-white/20 text-white">归档于 {new Date(content.archived_at).toLocaleDateString("zh-CN")}</Badge>}</div><h1 className="text-4xl font-medium tracking-[-.065em] sm:text-5xl">{content.title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">{content.logline || "自动梗概待补充"}</p></div>
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            <input ref={uploadInput} type="file" accept=".docx,.pdf,.txt,.md" className="hidden" onChange={(event) => void uploadVersion(event.target.files?.[0])} />
            <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" disabled={uploading} onClick={() => uploadInput.current?.click()}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}上传新版本</Button>
            <select value={codexMode} onChange={(event) => setCodexMode(event.target.value)} className="h-9 max-w-[8rem] rounded-md border border-white/20 bg-white/5 px-2 text-xs text-white"><option className="text-foreground">业务审核</option><option className="text-foreground">合规审核</option><option className="text-foreground">爆款对比</option><option className="text-foreground">风格分析</option></select>
            <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" disabled={!files[0]?.extracted_text} onClick={() => void copyCodexReviewPack}><Copy className="mr-2 h-4 w-4" />{copiedCodex ? "已复制AI审核包" : "复制AI审核包"}</Button>
            <Button className="bg-[#c9f45a] text-[#102a21] hover:bg-[#d8ff76]" disabled={!canReview || reviewing || Boolean(activeReview)} onClick={runReview}>{reviewing || activeReview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{reviewing ? "正在加入队列…" : activeReview ? "后台审核中…" : latestFailedReview ? "重新加入审核队列" : latestReview ? "再次加入审核队列" : "开始后台AI审核"}</Button>
            <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:border-red-200 hover:bg-red-500/15 hover:text-red-100" onClick={() => setShowDelete(true)}><Trash2 className="mr-2 h-4 w-4" />删除剧本</Button>
          </div>
          </div>
        </div>

        {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1"><CardHeader><CardTitle className="text-base">文件版本</CardTitle></CardHeader><CardContent className="space-y-3">
            {files.length === 0 ? <p className="text-sm text-muted-foreground">尚未上传剧本</p> : files.map((file) => <div key={file.id} className="rounded-lg border p-3"><div className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.file_name}</p><p className="text-xs text-muted-foreground">版本 {file.version} · 上传于 {new Date(file.created_at).toLocaleString("zh-CN")} · {file.parse_status}</p></div><Button asChild variant="ghost" size="icon"><a href={`/api/contents/files/${file.id}/download`}><Download className="h-4 w-4" /></a></Button></div></div>)}
          </CardContent></Card>

          <div className="space-y-6 lg:col-span-2">
            {result ? <ReviewView result={result} score={latestReview?.score ?? null} model={latestReview?.model} /> : activeReview ? <QueueProgress result={activeReview.result} status={activeReview.status as "pending" | "running"} /> : latestFailedReview ? <Card className="border-red-200 bg-red-50/60"><CardContent className="py-8"><div className="flex items-start gap-3 text-red-700"><Sparkles className="mt-0.5 h-5 w-5" /><div><p className="font-medium">AI 审核未完成</p><p className="mt-1 text-sm">{typeof latestFailedReview.result?.error === "string" ? latestFailedReview.result.error : "审核服务返回失败，请重新尝试。"}</p><p className="mt-3 text-xs text-red-600/80">请确认剧本文件已解析完成，然后点击上方“重新加入审核队列”。</p></div></div></CardContent></Card> : <Card className="border-dashed"><CardContent className="py-12 text-center"><Sparkles className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" /><p className="font-medium">尚无 AI 审核</p><p className="mt-1 text-sm text-muted-foreground">上传可解析的剧本后开始第一次审核。</p></CardContent></Card>}
            {reviews.length > 0 && <Card><CardHeader><CardTitle className="text-base">审核历史</CardTitle></CardHeader><CardContent className="space-y-2">{reviews.slice(0, 8).map((review) => <div key={review.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><div><span className="font-medium">{review.reviewer_type === "ai" ? "AI审核" : "人工责编"}</span>{review.reviewer_type === "ai" && review.model && <span className="ml-2 text-xs text-muted-foreground">{formatModelName(review.model)}</span>}<span className="ml-2 text-xs text-muted-foreground">{new Date(review.created_at).toLocaleString("zh-CN")}</span></div><div className="flex items-center gap-2"><Badge variant={review.status === "completed" ? "secondary" : review.status === "failed" ? "destructive" : "outline"}>{review.status === "completed" ? "已完成" : review.status === "failed" ? "失败" : review.status === "running" ? "审核中" : "待处理"}</Badge>{review.score != null && <span className="font-semibold">{review.score}/100</span>}</div></div>)}</CardContent></Card>}
            <Card><CardHeader><CardTitle className="text-base">我的最终责编判断</CardTitle></CardHeader><CardContent className="space-y-4">
              {latestHuman && <div className="rounded-lg border bg-muted/30 p-3"><div className="flex items-center justify-between"><Badge>{normalizeVerdict(latestHuman.result?.verdict) || latestHuman.result?.verdict || "已判断"}</Badge><span className="font-bold">{latestHuman.score}/100</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{latestHuman.result?.notes}</p></div>}
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <select value={humanVerdict} onChange={(event) => setHumanVerdict(event.target.value as HumanVerdict)} className="h-9 rounded-md border bg-background px-3 text-sm"><option>审核通过</option><option>退修</option><option>不采用</option></select>
                <input type="number" min="0" max="100" value={humanScore} onChange={(event) => setHumanScore(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="人工评分" />
              </div>
              <Textarea value={humanNotes} onChange={(event) => setHumanNotes(event.target.value)} rows={5} placeholder="填写你的最终判断、修改要求和是否进入开发…" />
              <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4"><p className="mb-2 text-xs font-semibold text-primary">导入外部AI审核草稿</p><Textarea value={codexResultText} onChange={(event) => setCodexResultText(event.target.value)} rows={4} placeholder="粘贴外部AI输出的JSON或文字结果，点击导入后请人工确认。" /><Button variant="outline" size="sm" className="mt-2" onClick={importCodexResult} disabled={!codexResultText.trim()}>导入到责编判断</Button></div>
              <Button onClick={saveHumanReview} disabled={savingHuman || !humanNotes.trim()}>{savingHuman && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{latestHuman ? "更新最终判断" : "保存最终判断"}</Button>
            </CardContent></Card>
            {normalizeVerdict(latestHuman?.result?.verdict) === "审核通过" && <Card className="overflow-hidden border-[#a9c884]/60"><CardHeader className="bg-[#f3f8ec]"><CardTitle className="flex items-center gap-2 text-base text-[#174c39]"><CheckCircle2 className="h-5 w-5" />审核通过后的推进动作</CardTitle><p className="text-sm text-muted-foreground">这些是业务动作，不会改变稿件的技术处理状态。可按实际情况选择，不要求按固定顺序执行。</p></CardHeader><CardContent className="space-y-4 pt-5">
              {linkedProject && <div className="flex flex-col gap-2 rounded-xl border bg-muted/25 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">已关联项目：{linkedProject.title}</p><p className="text-xs text-muted-foreground">当前阶段：{linkedProject.stage} · 下一步：{linkedProject.next_action || "待补充"}</p></div><Button asChild size="sm" variant="outline"><Link href={`/projects/${linkedProject.id}`}>查看项目</Link></Button></div>}
              <div className="grid gap-3 sm:grid-cols-2">
                <DevelopmentActionButton icon={FolderKanban} title="建立项目" description="正式进入项目推进并安排开发计划" loading={projectAction === "create"} disabled={Boolean(linkedProject) || Boolean(projectAction)} onClick={() => void advanceToDevelopment("create")} />
                <DevelopmentActionButton icon={CheckCircle2} title="标记拟购买" description="记录采购意向，下一步确认合同要点" loading={projectAction === "purchase"} disabled={Boolean(projectAction)} onClick={() => void advanceToDevelopment("purchase")} />
                <DevelopmentActionButton icon={FileSignature} title="进入合同审批" description="项目内管理合同，正式审批仍在飞书完成" loading={projectAction === "contract"} disabled={Boolean(projectAction)} onClick={() => void advanceToDevelopment("contract")} />
                <DevelopmentActionButton icon={PenLine} title="进入定制修改" description="按责编意见推进剧本修改或定制写作" loading={projectAction === "revision"} disabled={Boolean(projectAction)} onClick={() => void advanceToDevelopment("revision")} />
              </div>
            </CardContent></Card>}
            {files[0]?.extracted_text && <Card><CardHeader><CardTitle className="text-base">解析正文预览</CardTitle></CardHeader><CardContent><pre className="max-h-[480px] overflow-auto whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{files[0].extracted_text}</pre></CardContent></Card>}
          </div>
        </div>
      </div>
      <DeleteContentDialog title={content.title} open={showDelete} deleting={deleting} onCancel={() => !deleting && setShowDelete(false)} onConfirm={() => void deleteContent()} />
    </AppLayout>
  )
}

function DevelopmentActionButton({ icon: Icon, title, description, loading, disabled, onClick }: { icon: LucideIcon; title: string; description: string; loading: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="group flex min-h-24 items-start gap-3 rounded-2xl border bg-background p-4 text-left transition hover:-translate-y-0.5 hover:border-[#7da85c] hover:shadow-sm disabled:pointer-events-none disabled:opacity-50">
    <span className="rounded-xl bg-[#eef6e5] p-2 text-[#205b43]">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}</span>
    <span><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span></span>
  </button>
}

function ReviewView({ result, score, model }: { result: ReviewResult; score: number | null; model?: string | null }) {
  const rawScore = score ?? result.overall_score
  const displayScore = rawScore
  const modules = result.modules
  const materialSummary = result.material
    ? `${result.material.type || "材料"} · ${result.material.completeness || "完整度未判断"} · ${result.material.coverage || "覆盖范围未记录"}${result.material.truncated ? " · 文本有截断" : ""}`
    : undefined
  const riskTitle = modules?.compliance?.level ? `发行风险 · ${modules.compliance.level.toUpperCase()}` : "发行风险"
  return <Card>
    <CardHeader>
      <div className="flex items-center justify-between gap-4">
        <CardTitle>AI 完整审核 <span className="ml-2 text-xs font-normal text-muted-foreground">{formatModelName(model)}</span></CardTitle>
        <div className="text-3xl font-bold text-violet-600">{displayScore ?? "—"}<span className="text-sm text-muted-foreground">/100</span></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{result.verdict || "待判断"}</Badge>
        {result.grade && <Badge variant="outline">{result.grade}</Badge>}
        {typeof result.confidence === "number" && <Badge variant="secondary">置信度 {result.confidence}%</Badge>}
        {result.one_line_hook && <span className="text-sm text-muted-foreground">{result.one_line_hook}</span>}
      </div>
      {materialSummary && <p className="text-xs text-muted-foreground">{materialSummary}</p>}
    </CardHeader>
    <CardContent className="space-y-5">
      <p className="text-sm leading-7">{result.summary}</p>
      <div className="grid gap-3 sm:grid-cols-2">{result.dimensions?.map((item) => <div key={item.name} className="rounded-lg border p-3">
        <div className="flex justify-between gap-3 font-medium"><span>{item.name}</span><span className="shrink-0">{item.score}/{item.max_score ?? 10}</span></div>
        {item.evidence && <p className="mt-2 text-xs leading-5 text-muted-foreground">证据：{item.evidence}</p>}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.finding}</p>
        <p className="mt-2 text-xs leading-5">建议：{item.suggestion}</p>
      </div>)}</div>
      {result.phases?.length ? <div><h3 className="mb-2 text-sm font-semibold">阶段诊断</h3><div className="grid gap-2 sm:grid-cols-2">{result.phases.map((item) => <div key={item.phase} className="rounded-lg border p-3"><p className="text-sm font-medium">{item.phase}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.finding}</p></div>)}</div></div> : null}
      <Module title={riskTitle} summary={modules?.compliance?.summary} items={modules?.compliance?.risks} />
      <Module title="爆款对比" summary={modules?.comparison?.summary} items={modules?.comparison?.references} />
      <Module title="风格与AI真人表达" summary={modules?.style?.summary} items={modules?.style?.findings} />
      <List title="核心资产 / 必须保留" items={result.editorial_actions?.must_keep?.length ? result.editorial_actions.must_keep : result.strengths} />
      <List title="主要风险" items={result.risks} />
      <List title="必须修改" items={result.editorial_actions?.must_fix} />
      <List title="可选优化" items={result.editorial_actions?.optional} />
      <List title="需要人工确认" items={result.editorial_actions?.human_check} />
      <List title="优先修改" items={result.priority_fixes} />
      {result.next_action && <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><h3 className="text-sm font-semibold">下一步</h3><p className="mt-2 text-sm leading-6">{result.next_action}</p></div>}
    </CardContent>
  </Card>
}

function QueueProgress({ result, status }: { result: ReviewResult | null; status: "pending" | "running" }) {
  const workflow = result?.workflow
  const progress = workflow?.progress ?? 0
  return <Card className="border-primary/20 bg-primary/5"><CardContent className="py-8"><div className="flex items-start gap-3"><Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" /><div className="flex-1"><p className="font-medium">{status === "pending" ? "审核已排队" : "后台正在审核"}</p><p className="mt-1 text-sm text-muted-foreground">{workflow?.stage || "等待审核服务处理"}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{progress}% · 你可以继续浏览或处理其他任务，结果会自动刷新。</p>{typeof workflow?.benchmark_count === "number" && <p className="mt-1 text-xs text-primary">本次将使用 {workflow.benchmark_count} 部优秀对标稿进行比较。</p>}</div></div></CardContent></Card>
}

function formatModelName(model?: string | null) {
  if (!model) return "未记录模型"
  if (model === "claude-sonnet-cli") return "Claude Sonnet"
  if (model === "codex-api") return "Codex API"
  return model
}

function Module({ title, summary, items }: { title: string; summary?: string; items?: string[] }) { if (!summary && !items?.length) return null; return <div className="rounded-xl border bg-muted/20 p-4"><h3 className="mb-2 text-sm font-semibold">{title}</h3>{summary && <p className="text-sm leading-6">{summary}</p>}{items?.length ? <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{items.map((item, index) => <li key={`${title}-${index}`}>· {item}</li>)}</ul> : null}</div> }

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null
  return <div><h3 className="mb-2 text-sm font-semibold">{title}</h3><ol className="space-y-1 pl-5 text-sm text-muted-foreground">{items.map((item, index) => <li key={`${title}-${index}`} className="list-decimal">{item}</li>)}</ol></div>
}
