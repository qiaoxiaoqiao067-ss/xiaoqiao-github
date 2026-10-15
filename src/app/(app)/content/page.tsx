"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
import { useContents, type ContentItem } from "@/hooks/use-contents"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Archive, BookOpen, FilePlus2, Loader2, Plus, RotateCcw, Search, Sparkles, Upload, X } from "lucide-react"
import { Trash2 } from "lucide-react"
import { DeleteContentDialog } from "@/components/content/delete-content-dialog"

const TYPE_LABEL: Record<ContentItem["content_type"], string> = {
  submission: "投稿剧本",
  development: "重点开发",
  benchmark: "优秀对标",
  original: "我的创作",
}

export default function ContentPage() {
  const { contents, loading, error, fetchContents, addContent, uploadScripts, deleteContent, setContentStatus } = useContents()
  const fileInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<ContentItem["content_type"]>("submission")
  const [source, setSource] = useState("")
  const [logline, setLogline] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadType, setUploadType] = useState<ContentItem["content_type"]>("submission")
  const [uploadProgress, setUploadProgress] = useState("")
  const [uploadMessage, setUploadMessage] = useState("")
  const [uploadErrors, setUploadErrors] = useState<Array<{ fileName: string; error?: string; updatedVersion?: boolean }>>([])
  const [batchReviewing, setBatchReviewing] = useState(false)
  const [queueingIds, setQueueingIds] = useState<string[]>([])
  const [batchReviewProgress, setBatchReviewProgress] = useState("")
  const [view, setView] = useState<"all" | "high" | "pending" | "reviewed" | "recommended" | "archived">("all")
  const [sortMode, setSortMode] = useState<"newest" | "score">("newest")
  const [sourceFilter, setSourceFilter] = useState("全部来源")
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteContent(deleteTarget.id)
      setUploadMessage(`《${deleteTarget.title}》已删除。`)
      setDeleteTarget(null)
    } catch (deleteError) {
      setUploadMessage(deleteError instanceof Error ? deleteError.message : "删除失败，请稍后重试")
    } finally {
      setDeleting(false)
    }
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setUploadMessage("")
    setUploadErrors([])
    const selected = Array.from(files)
    const results = await uploadScripts(selected, uploadType, (completed, total) => {
      setUploadProgress(`${completed}/${total}`)
    })
    const succeeded = results.filter((result) => result.success).length
    const failed = results.length - succeeded
    const updatedVersions = results.filter((result) => result.success && result.updatedVersion).length
    const created = succeeded - updatedVersions
    const summary = updatedVersions ? `新建 ${created} 个，更新版本 ${updatedVersions} 个` : `已成功导入 ${succeeded} 个剧本`
    setUploadMessage(failed ? `${summary}，失败 ${failed} 个` : summary)
    setUploadErrors(results.filter((result) => !result.success))
    setUploadProgress("")
    setUploading(false)
    if (fileInput.current) fileInput.current.value = ""
  }

  const createContent = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await addContent({ title: title.trim(), contentType: type, source: source.trim(), logline: logline.trim() })
      setTitle("")
      setSource("")
      setLogline("")
      setShowNew(false)
    } finally {
      setSaving(false)
    }
  }

  // A batch is intentionally capped: all selected scripts enter the durable
  // queue at once, while the worker consumes them one by one to keep the AI
  // provider stable and to leave the rest of the workbench responsive.
  const reviewableContents = contents.filter((item) => item.status === "ready" && item.content_files.some((file) => file.parse_status === "ready"))
  const batchQueueContents = reviewableContents.slice(0, 20)

  const handleBatchReview = async () => {
    if (!batchQueueContents.length || batchReviewing) return
    setBatchReviewing(true)
    let completed = 0
    let failed = 0
    for (const item of batchQueueContents) {
      setBatchReviewProgress(`${completed + 1}/${batchQueueContents.length}`)
      try {
        const response = await fetch(`/api/contents/${item.id}/queue-review`, { method: "POST" })
        if (!response.ok) failed += 1
      } catch { failed += 1 }
      completed += 1
    }
    setBatchReviewProgress("")
    setBatchReviewing(false)
    await fetchContents(query)
    setUploadMessage(failed ? `已加入审核队列 ${completed - failed} 个，失败 ${failed} 个` : `已将 ${completed} 个剧本加入后台审核队列`)
  }

  const handleSingleReview = async (item: ContentItem) => {
    if (queueingIds.includes(item.id) || item.status === "reviewing") return
    setQueueingIds((current) => [...current, item.id])
    try {
      const response = await fetch(`/api/contents/${item.id}/queue-review`, { method: "POST" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "加入审核队列失败")
      setUploadMessage(`《${item.title}》已加入后台审核队列，你可以继续处理其他剧本。`)
      await fetchContents(query)
    } catch (reviewError) {
      setUploadMessage(reviewError instanceof Error ? reviewError.message : "加入审核队列失败")
    } finally {
      setQueueingIds((current) => current.filter((id) => id !== item.id))
    }
  }

  const hasCompletedAiReview = (item: ContentItem) => item.content_reviews.some((review) => review.reviewer_type === "ai" && review.status === "completed" && review.score !== null)
  const latestAiScore = (item: ContentItem) => {
    const review = item.content_reviews.find((candidate) => candidate.reviewer_type === "ai" && candidate.status === "completed" && candidate.score !== null)
    return review?.score ?? 0
  }
  const latestReview = (item: ContentItem, reviewerType: "ai" | "human") => item.content_reviews
    .filter((review) => review.reviewer_type === reviewerType && review.status === "completed")
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0]
  const reviewPreview = (item: ContentItem) => {
    const ai = latestReview(item, "ai")
    const human = item.content_reviews
      .filter((review) => review.reviewer_type === "human" && review.status === "completed" && review.is_final)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0]
    if (human) return { label: "责编判断", text: human.result?.notes || human.result?.verdict || "已填写最终判断", tone: "text-[#205b43]" }
    if (ai) return { label: ai.result?.verdict || "AI初审", text: ai.result?.summary || ai.result?.one_line_hook || "审核已完成，查看完整结论与修改建议", tone: "text-primary" }
    return null
  }
  const reviewed = contents.filter(hasCompletedAiReview).length
  const waiting = contents.filter((item) => !hasCompletedAiReview(item)).length
  const highScore = contents.filter((item) => hasCompletedAiReview(item) && latestAiScore(item) >= 80).length
  const recommended = contents.filter((item) => hasCompletedAiReview(item) && item.content_reviews.some((review) => review.reviewer_type === "human" && review.is_final && review.result?.verdict === "推荐开发")).length
  const archived = contents.filter((item) => item.status === "archived").length
  const visibleContents = contents.filter((item) => {
    const source = (item.source || "").toLowerCase()
    if (sourceFilter === "邮箱收稿" && !/邮箱|email|gmail|投稿邮箱/.test(source)) return false
    if (sourceFilter === "小红书收稿" && !/小红书|xhs|xiaohongshu/.test(source)) return false
    if (sourceFilter === "其他来源" && /邮箱|email|gmail|投稿邮箱|小红书|xhs|xiaohongshu/.test(source)) return false
    if (view === "pending") return !hasCompletedAiReview(item)
    if (view === "reviewed") return hasCompletedAiReview(item)
    if (view === "high") return hasCompletedAiReview(item) && latestAiScore(item) >= 80
    if (view === "recommended") return hasCompletedAiReview(item) && item.content_reviews.some((review) => review.reviewer_type === "human" && review.is_final && review.result?.verdict === "推荐开发")
    if (view === "archived") return item.status === "archived"
    return item.status !== "archived"
  }).sort((a, b) => {
    if (sortMode === "score") {
      return latestAiScore(b) - latestAiScore(a)
    }
    return b.updated_at.localeCompare(a.updated_at)
  })

  useEffect(() => {
    if (!contents.some((item) => item.status === "reviewing")) return
    const timer = window.setInterval(() => { void fetchContents(query, undefined, { silent: true }) }, 6000)
    return () => window.clearInterval(timer)
  }, [contents, fetchContents, query])

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHero eyebrow="投稿 · AI初审 · 人工判断" title="收稿审稿" description="管理投稿、开发项目、对标内容和个人创作，让每个故事都有清晰的下一步。" action={<div className="flex flex-col gap-2 sm:flex-row">
            <input ref={fileInput} type="file" multiple accept=".docx,.pdf,.txt,.md" className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
            <select value={uploadType} onChange={(event) => setUploadType(event.target.value as ContentItem["content_type"])} className="h-9 rounded-md border border-white/20 bg-white/5 px-2 text-xs text-white"><option className="text-foreground" value="submission">投稿剧本</option><option className="text-foreground" value="benchmark">优秀对标库</option><option className="text-foreground" value="development">重点开发</option><option className="text-foreground" value="original">我的创作</option></select>
            <Button variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()} className="gap-2 border-white/20 bg-white/5 text-white hover:bg-white hover:text-[#102a21]">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? `上传中 ${uploadProgress}` : uploadType === "benchmark" ? "导入优秀对标" : "批量上传剧本"}
            </Button>
            <Button variant="outline" disabled={batchReviewing || !reviewableContents.length} onClick={() => void handleBatchReview()} className="gap-2 border-[#c9f45a]/60 bg-[#c9f45a]/10 text-[#c9f45a] hover:bg-[#c9f45a] hover:text-[#102a21]">
              {batchReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {batchReviewing ? `加入队列 ${batchReviewProgress}` : `批量开始审核${batchQueueContents.length ? `（${batchQueueContents.length}/20）` : ""}`}
            </Button>
            <Button onClick={() => setShowNew((value) => !value)} className="gap-2 bg-[#c9f45a] text-[#102a21] hover:bg-[#d8ff74] sm:w-auto">
              {showNew ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showNew ? "取消" : "新建内容"}
            </Button>
          </div>} />

        {uploadMessage && <div className={`rounded-lg p-3 text-sm ${uploadErrors.length ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          <p>{uploadMessage}</p>
          {uploadErrors.length > 0 && <div className="mt-2 space-y-1 text-xs">
            {uploadErrors.map((item) => <p key={`${item.fileName}-${item.error}`}><span className="font-medium">{item.fileName}</span>：{item.error || "未知上传错误"}</p>)}
          </div>}
        </div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="全部内容" value={loading ? "—" : contents.length} />
          <Stat label="待处理" value={loading ? "—" : waiting} />
          <Stat label="已审核" value={loading ? "—" : reviewed} />
          <Stat label="高分候选" value={loading ? "—" : highScore} />
          <Stat label="推荐开发" value={loading ? "—" : recommended} />
        </div>

        {showNew && (
          <Card>
            <CardHeader><CardTitle className="text-base">建立内容项目</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="剧本或项目名称" />
              <select value={type} onChange={(event) => setType(event.target.value as ContentItem["content_type"])} className="h-9 rounded-md border bg-background px-3 text-sm">
                {Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="来源/作者（可选）" />
              <div className="md:col-span-2">
                <Textarea value={logline} onChange={(event) => setLogline(event.target.value)} placeholder="一句话梗概（可选）" rows={3} />
              </div>
              <Button onClick={createContent} disabled={saving || !title.trim()} className="md:w-fit">
                <FilePlus2 className="mr-2 h-4 w-4" />{saving ? "保存中…" : "建立项目"}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && fetchContents(query)} placeholder="搜索标题或一句话梗概" className="pl-9" />
          </div>
          <Button variant="outline" onClick={() => fetchContents(query)}>搜索</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {([{key:"all",label:"当前剧本"},{key:"pending",label:"待处理"},{key:"reviewed",label:"已审核"},{key:"high",label:"高分候选"},{key:"recommended",label:"推荐开发"},{key:"archived",label:`历史归档 ${archived}`}] as const).map((item) => <Button key={item.key} variant={view === item.key ? "default" : "outline"} size="sm" onClick={() => setView(item.key)}>{item.label}</Button>)}
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="newest">按最近更新</option><option value="score">按评分优先</option></select>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option>全部来源</option><option>邮箱收稿</option><option>小红书收稿</option><option>其他来源</option></select>
        </div>

        {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-48 rounded-xl" />)}</div>
        ) : contents.length === 0 ? (
          <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16 text-center">
            <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="font-medium">还没有内容项目</p>
            <p className="mt-1 text-sm text-muted-foreground">先建立一个项目，下一步即可上传剧本并开始 AI 审核。</p>
          </CardContent></Card>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            {visibleContents.map((item) => (
              <div key={item.id} className="grid gap-3 border-b p-4 transition-colors last:border-b-0 hover:bg-muted/30 md:grid-cols-[minmax(180px,1.55fr)_92px_minmax(190px,1.35fr)_minmax(130px,1fr)_190px] md:items-center">
                <div className="min-w-0"><div className="mb-1 flex items-center gap-2"><Badge variant="secondary" className="shrink-0 text-[10px]">{TYPE_LABEL[item.content_type]}</Badge><Badge variant={hasCompletedAiReview(item) ? "success" : "outline"} className={`shrink-0 text-[10px] ${hasCompletedAiReview(item) ? "" : "border-slate-300 bg-slate-100 text-slate-500"}`}>{hasCompletedAiReview(item) ? "AI审核完成" : item.status === "reviewing" ? "AI审核中" : "未完成审核"}</Badge></div><Link href={`/content/${item.id}`} className="block truncate font-medium hover:text-primary" title={item.title}>{item.title}</Link><p className="mt-1 truncate text-xs text-muted-foreground">{item.logline || "尚未填写一句话梗概"}</p></div>
                <div className="text-sm">{(() => { const ai = item.content_reviews.find((review) => review.reviewer_type === "ai" && review.score !== null); const aiScore = ai?.score ?? null; return ai ? <span className="font-semibold text-primary">AI {aiScore}/100</span> : <span className="text-muted-foreground">未审核</span> })()}</div>
                {(() => { const preview = reviewPreview(item); return <div className="min-w-0 border-l border-border/70 pl-3"><p className={`truncate text-xs font-semibold ${preview?.tone || "text-muted-foreground"}`}>{preview?.label || "暂无审核结论"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground" title={preview?.text}>{preview?.text || "完成 AI 或人工审核后，会在此显示结论摘要。"}</p></div> })()}
                <div className="space-y-1 text-xs text-muted-foreground"><p className="truncate">{item.source || "未标记来源"}</p><p className="flex items-center gap-1"><Sparkles className="h-3 w-3" />{item.content_reviews?.length || 0} 次审核</p></div>
                <div className="flex flex-wrap justify-start gap-2 md:justify-end"><Button asChild variant="outline" size="sm"><Link href={`/content/${item.id}`}>查看详情</Link></Button>{item.status === "archived" ? <Button size="sm" variant="outline" onClick={() => void setContentStatus(item.id,hasCompletedAiReview(item)?"reviewed":"ready")}><RotateCcw className="mr-1.5 h-3.5 w-3.5"/>恢复</Button> : <>{hasCompletedAiReview(item) || latestReview(item, "human") ? null : item.status === "reviewing" ? <Button variant="outline" size="sm" disabled><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />审核中</Button> : item.status === "ready" && item.content_files.some((file) => file.parse_status === "ready") ? <Button size="sm" disabled={queueingIds.includes(item.id)} onClick={() => void handleSingleReview(item)} className="bg-[#c9f45a] text-[#102a21] hover:bg-[#d8ff74]">{queueingIds.includes(item.id) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}{queueingIds.includes(item.id) ? "加入中" : "开始审核"}</Button> : <Button variant="outline" size="sm" disabled>等待解析</Button>}<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="移入历史归档" onClick={() => void setContentStatus(item.id,"archived")}><Archive className="h-4 w-4"/></Button></>}<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title={`删除《${item.title}》`} aria-label={`删除${item.title}`} onClick={() => setDeleteTarget(item)}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <DeleteContentDialog title={deleteTarget?.title || ""} open={Boolean(deleteTarget)} deleting={deleting} onCancel={() => !deleting && setDeleteTarget(null)} onConfirm={() => void handleDelete()} />
    </AppLayout>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <Card><CardContent className="p-4"><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>
}
