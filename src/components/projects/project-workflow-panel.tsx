"use client"

import { useModuleEdit, ReadableAction, EditOnly } from "@/components/permissions/workspace-permissions"
import Link from "next/link"
import { useState } from "react"
import type { Project } from "@/hooks/use-projects"
import type { ProjectAsset } from "@/hooks/use-project-files"
import type { ProjectTimelineItem } from "@/hooks/use-project-timeline"
import type { Meeting } from "@/hooks/use-meetings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, CheckCircle2, Circle, Calculator, FileCheck2, MessageSquareText, PackageCheck } from "lucide-react"
import { PROJECT_STAGES, PROJECT_STAGE_DETAILS, PROJECT_STAGE_WEIGHTS, projectStageProgress } from "@/lib/projects/stages"
import { defaultAssetCategory } from "@/lib/projects/assets"

function hasFile(files: ProjectAsset[], categories: string[]) {
  return files.some((file) => categories.includes(file.category) && file.status !== "archived")
}

type StatisticsSummary = {
  full: number
  dialogue: number
  screen: number
  quoteCharacters: number
  minCost: number
  maxCost: number
  basis: string
  generatedAt: string
  source: string
  needsReview: boolean
}

function statisticsSummary(files: ProjectAsset[]): StatisticsSummary | null {
  const report = files
    .filter((file) => file.category === "字数统计报告" && file.status !== "archived" && file.text_content)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  if (!report?.text_content) return null
  const encoded = report.text_content.match(/```json\s*([\s\S]*?)\s*```/i)?.[1]
  if (!encoded) return null
  try {
    const data = JSON.parse(encoded) as {
      generatedAt?: string
      fileName?: string
      needsReview?: boolean
      options?: { basis?: string }
      totals?: Partial<Pick<StatisticsSummary, "full" | "dialogue" | "screen" | "quoteCharacters" | "minCost" | "maxCost">>
    }
    const totals = data.totals
    if (!totals || ![totals.full, totals.dialogue, totals.screen, totals.quoteCharacters, totals.minCost, totals.maxCost].every((value) => typeof value === "number")) return null
    return {
      full: totals.full!, dialogue: totals.dialogue!, screen: totals.screen!, quoteCharacters: totals.quoteCharacters!,
      minCost: totals.minCost!, maxCost: totals.maxCost!, basis: data.options?.basis === "full" ? "全本中文" : "发声台词",
      generatedAt: data.generatedAt || report.created_at, source: data.fileName || report.title, needsReview: Boolean(data.needsReview),
    }
  } catch { return null }
}

export function ProjectWorkflowPanel({ project, files, onMilestone, onStageChange }: {
  project: Project
  files: ProjectAsset[]
  onMilestone: (stage: string, category: string) => void
  onStageChange: (stage: string) => Promise<void>
}) {
  const canEdit = useModuleEdit("projects")
  const [message, setMessage] = useState("")
  const [changingStage, setChangingStage] = useState(false)
  const selectStage = async (stage: string) => {
    setChangingStage(true)
    setMessage("")
    try { await onStageChange(stage) }
    catch (error) { setMessage(error instanceof Error ? error.message : "阶段保存失败") }
    finally { setChangingStage(false) }
  }

  const summary = statisticsSummary(files)
  return <div className="space-y-4">
    <Card><CardHeader className="flex-row items-start justify-between gap-3 pb-3"><div><CardTitle className="text-base">项目阶段 · {project.progress}%</CardTitle><p className="mt-1 text-xs text-muted-foreground">{canEdit ? "选择当前阶段后自动同步总进度。合同中和发行投流各占10%，其他阶段各占20%。" : "当前项目阶段与进度，仅供查看。"}</p></div><Button asChild size="sm" variant="outline" className="shrink-0"><Link href="/projects"><ArrowLeft className="mr-1 h-3.5 w-3.5"/>返回项目列表</Link></Button></CardHeader><CardContent><div className="space-y-1.5">{PROJECT_STAGES.map((stage, index) => {
      const current = stage === project.stage
      const done = index < PROJECT_STAGES.indexOf(project.stage as typeof PROJECT_STAGES[number])
      const tone = current ? "border-[#c9f45a] bg-[#174c39] text-white ring-1 ring-[#c9f45a]" : done ? "border-[#c8dbc0] bg-[#eef6e9] text-[#173f31]" : "border-[#dce5d8] bg-white text-[#173f31]"
      return <div key={stage} className={`flex flex-col gap-2 rounded-xl border px-3 py-2 md:flex-row md:items-center ${tone}`}>
        <ReadableAction module="projects" type="button" disabled={changingStage} aria-pressed={current} onClick={() => void selectStage(stage)} className="grid min-w-0 flex-1 gap-2 text-left disabled:opacity-60 md:grid-cols-[minmax(190px,1.1fr)_90px_minmax(150px,.8fr)] md:items-center">
          <div className="flex min-w-0 items-start gap-2">{done ? <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${current ? "text-[#c9f45a]" : "text-[#4d8a5d]"}`} /> : <Circle className={`mt-0.5 h-4 w-4 shrink-0 ${current ? "text-[#c9f45a]" : "text-[#648070]"}`} />}<div className="min-w-0"><p className="text-xs font-semibold leading-4">{stage}</p><p className={`mt-0.5 truncate text-[9px] ${current ? "text-white/70" : "text-muted-foreground"}`}>{PROJECT_STAGE_DETAILS[stage]}</p></div></div>
          <div><strong className={`text-base ${current ? "text-[#c9f45a]" : "text-[#206044]"}`}>{projectStageProgress(stage)}%</strong><span className={`ml-1 text-[9px] ${current ? "text-white/65" : "text-muted-foreground"}`}>权重 {PROJECT_STAGE_WEIGHTS[stage]}%</span></div>
          <p className={`text-[10px] ${current ? "text-white/85" : "text-muted-foreground"}`}>{!canEdit ? (current ? "当前阶段" : done ? "已走过" : "未开始") : changingStage ? "正在保存…" : current ? "当前阶段" : done ? "已走过 · 点击可退回" : "点击设为当前阶段"}</p>
        </ReadableAction>
        <EditOnly module="projects"><Button type="button" size="sm" variant={current ? "secondary" : "outline"} className={`h-8 shrink-0 text-[10px] ${current ? "bg-white/10 text-white hover:bg-white/20 hover:text-white" : ""}`} onClick={() => onMilestone(stage, defaultAssetCategory(stage))}>记录或上传资料</Button></EditOnly>
      </div>
    })}</div>{message && <p role="status" className="mt-3 rounded-lg bg-primary/8 px-3 py-2 text-xs text-primary">{message}</p>}</CardContent></Card>

    <Card><CardHeader className="flex-row items-start justify-between gap-3 pb-3"><div><CardTitle className="text-base">字数统计与报价</CardTitle><p className="mt-1 text-xs text-muted-foreground">同时统计中文剧本总字数、发声台词和画面文字；保存后长期显示在项目里。</p></div><Button asChild size="sm"><Link href={`/localization?projectId=${project.id}`}><Calculator className="mr-1 h-3.5 w-3.5"/>{summary ? "重新统计" : "开始统计"}</Link></Button></CardHeader><CardContent>{summary ? <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6"><Statistic label="中文剧本总字数" value={`${summary.full.toLocaleString("zh-CN")} 字`}/><Statistic label="中文发声台词" value={`${summary.dialogue.toLocaleString("zh-CN")} 字`}/><Statistic label="画面文字" value={`${summary.screen.toLocaleString("zh-CN")} 字`}/><Statistic label={`${summary.basis}计费`} value={`${summary.quoteCharacters.toLocaleString("zh-CN")} 字`}/><Statistic label="报价区间" value={`¥${summary.minCost.toFixed(2)}—¥${summary.maxCost.toFixed(2)}`}/><Statistic label={summary.needsReview ? "保存时间 · 待复核" : "保存时间"} value={new Date(summary.generatedAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })}/></div> : <div className="rounded-xl border border-dashed px-4 py-5 text-center"><p className="text-sm font-semibold text-[#173f31]">尚未保存字数统计</p><p className="mt-1 text-xs text-muted-foreground">完成统计后点击“保存统计报告”，结果会记录并显示在这里。</p></div>}</CardContent></Card>
  </div>
}

export function ProjectSecondaryTools({ project, files, nodes, meetings }: { project: Project; files: ProjectAsset[]; nodes: ProjectTimelineItem[]; meetings: Meeting[] }) {
  return <Card><CardHeader className="flex-row items-center justify-between gap-3 pb-3"><div><CardTitle className="text-base">其他项目记录</CardTitle><p className="mt-1 text-xs text-muted-foreground">围读、制作资料和项目归档集中放在页面底部，需要时再查看。</p></div><Button asChild size="sm" variant="outline"><Link href="/projects"><ArrowLeft className="mr-1 h-3.5 w-3.5"/>返回项目列表</Link></Button></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3">
    <ActionLink href={`/meetings?projectId=${project.id}`} icon={MessageSquareText} title="围读记录" text={`${meetings.filter((meeting) => /围读/.test(meeting.meeting_type)).length} 次项目围读`} />
    <div className="rounded-xl border p-3"><PackageCheck className="h-4 w-4 text-primary" /><p className="mt-2 text-xs font-semibold">制作资料</p><p className="mt-1 text-[10px] text-muted-foreground">{hasFile(files, ["美术资产", "制作交接", "抽卡资料", "制作材料", "分集成片"]) ? "已有制作资料，请按阶段核对" : "在对应阶段上传资料后集中查看"}</p></div>
    <div className="rounded-xl border p-3"><FileCheck2 className="h-4 w-4 text-primary" /><p className="mt-2 text-xs font-semibold">项目档案</p><p className="mt-1 text-[10px] text-muted-foreground">{project.status === "archived" ? "项目已归档" : `${nodes.length} 个排期节点 · ${files.filter((file) => file.status !== "archived").length} 份使用中文件`}</p></div>
  </CardContent></Card>
}

function Statistic({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-[#f7faf4] px-3 py-2"><p className="text-[9px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-xs font-semibold text-[#173f31]">{value}</p></div>
}

function ActionLink({ href, icon: Icon, title, text }: { href: string; icon: typeof Calculator; title: string; text: string }) {
  return <Link href={href} className="block rounded-xl border p-3 transition hover:border-primary/40 hover:bg-primary/[.03]"><Icon className="h-4 w-4 text-primary" /><p className="mt-2 text-xs font-semibold">{title}</p><p className="mt-1 text-[10px] text-muted-foreground">{text}</p></Link>
}
