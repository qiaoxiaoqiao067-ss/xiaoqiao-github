"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Download, FileText, Loader2 } from "lucide-react"
import { useParams } from "next/navigation"
import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import type { KnowledgeItem } from "@/hooks/use-knowledge-items"

const ANALYSIS_LABELS = ["一句话钩子", "核心冲突", "情绪发动机", "结构与节奏", "值得学习", "可迁移到自己的创作", "不建议照搬"]

export default function HitScriptDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const supabase = useMemo(() => createClient(), [])
  const [item, setItem] = useState<KnowledgeItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const { data, error: queryError } = await supabase.from("knowledge_items").select("*").eq("id", id).maybeSingle()
      if (cancelled) return
      if (queryError) setError(queryError.message)
      else if (!data) setError("没有找到这条爆款剧本")
      else {
        const next = data as KnowledgeItem
        setItem(next)
        if (next.attachment_path) {
          const { data: signed } = await supabase.storage.from("content-files").createSignedUrl(next.attachment_path, 60 * 60)
          if (!cancelled) setAttachmentUrl(signed?.signedUrl || null)
        }
      }
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [id, supabase])

  const parsed = useMemo(() => parseContent(item?.content || ""), [item?.content])

  return <AppLayout>
    <div className="space-y-5">
      <div><Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/knowledge"><ArrowLeft className="mr-2 h-4 w-4" />返回知识与学习</Link></Button></div>
      <PageHero eyebrow="Hit Script · Breakdown" title={item?.title || "爆款剧本详情"} description="查看完整剧本文字、爆款拆解结论与可迁移的创作方法。" />
      {loading && <Card><CardContent className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在加载详情…</CardContent></Card>}
      {!loading && error && <Card className="border-destructive/30"><CardContent className="py-12 text-center text-sm text-destructive">{error}</CardContent></Card>}
      {!loading && item && <>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            <Badge variant="secondary">{item.item_type}</Badge>
            {item.category && <Badge variant="outline">{item.category}</Badge>}
            {item.primary_genre && <Badge>{item.primary_genre}</Badge>}
            {(item.genre_tags || []).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
            {attachmentUrl && <Button asChild size="sm" variant="outline" className="ml-auto"><a href={attachmentUrl} target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" />打开原始文件</a></Button>}
          </CardContent>
        </Card>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.8fr)]">
          <Card><CardHeader><CardTitle>作品信息</CardTitle></CardHeader><CardContent className="space-y-4 text-sm leading-6"><Info label="一句话梗概" value={item.logline} /><Info label="主要人物关系" value={item.relationships} /><Info label="原文件" value={item.attachment_name} /><Info label="保存时间" value={new Date(item.updated_at || item.created_at).toLocaleString("zh-CN")} /></CardContent></Card>
          <Card><CardHeader><CardTitle>爆款拆解与学习结论</CardTitle></CardHeader><CardContent className="space-y-4">{parsed.blocks.length ? parsed.blocks.map((block) => <section key={block.label} className="rounded-xl border border-primary/15 bg-primary/[.035] p-3"><p className="mb-1 text-xs font-semibold text-primary">{block.label}</p><p className="whitespace-pre-wrap text-sm leading-6">{block.value}</p></section>) : <p className="text-sm text-muted-foreground">这条记录还没有结构化拆解结论。</p>}</CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />完整剧本文字</CardTitle><p className="text-sm text-muted-foreground">原始剧本文字保留在这里，方便随时回看和学习。</p></CardHeader><CardContent><pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-2xl border bg-muted/20 p-5 text-sm leading-7">{parsed.script || "还没有可展示的剧本文字"}</pre></CardContent></Card>
      </>}
    </div>
  </AppLayout>
}

function Info({ label, value }: { label: string; value?: string | null }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 whitespace-pre-wrap">{value || "未填写"}</p></div> }

function parseContent(content: string) {
  const marker = "【一句话钩子】"
  const index = content.indexOf(marker)
  const script = (index >= 0 ? content.slice(0, index) : content).trim()
  const analysisText = index >= 0 ? content.slice(index) : ""
  const blocks = ANALYSIS_LABELS.map((label, position) => {
    const start = analysisText.indexOf(`【${label}】`)
    if (start < 0) return null
    const next = ANALYSIS_LABELS.slice(position + 1).map((nextLabel) => analysisText.indexOf(`【${nextLabel}】`, start + 1)).filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? analysisText.length
    const value = analysisText.slice(start + label.length + 2, next).trim()
    return value ? { label, value } : null
  }).filter((value): value is { label: string; value: string } => Boolean(value))
  return { script, blocks }
}
