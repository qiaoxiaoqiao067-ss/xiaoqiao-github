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
import { CheckCircle2, Circle, Calculator, FileCheck2, MessageSquareText, PackageCheck } from "lucide-react"
import { PROJECT_STAGES, PROJECT_STAGE_DETAILS, PROJECT_STAGE_WEIGHTS, projectStageProgress } from "@/lib/projects/stages"
import { defaultAssetCategory } from "@/lib/projects/assets"

function hasFile(files: ProjectAsset[], categories: string[]) {
  return files.some((file) => categories.includes(file.category) && file.status !== "archived")
}

export function ProjectWorkflowPanel({ project, files, nodes, meetings, onMilestone, onStageChange }: {
  project: Project
  files: ProjectAsset[]
  nodes: ProjectTimelineItem[]
  meetings: Meeting[]
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

  return <div className="space-y-4">
    <Card><CardHeader className="pb-3"><CardTitle className="text-base">项目阶段 · {project.progress}%</CardTitle><p className="text-xs text-muted-foreground">{canEdit ? "选择当前阶段后自动同步总进度。合同中和发行投流各占10%，其他阶段各占20%。" : "当前项目阶段与进度，仅供查看。"}</p></CardHeader><CardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{PROJECT_STAGES.map((stage, index) => {
      const current = stage === project.stage
      const done = index < PROJECT_STAGES.indexOf(project.stage as typeof PROJECT_STAGES[number])
      return <div key={stage} className={`rounded-xl border p-3 text-white ${current ? "border-[#c9f45a] bg-[#174c39] ring-2 ring-[#c9f45a]" : "border-[#3c725d] bg-[#245b46]"}`}>
        <ReadableAction module="projects" type="button" disabled={changingStage} aria-pressed={current} onClick={() => void selectStage(stage)} className="w-full text-left disabled:opacity-60">
          <div className="flex items-start gap-2">{done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#c9f45a]" /> : <Circle className="h-4 w-4 shrink-0" />}<p className="text-xs font-semibold leading-4">{stage}</p></div>
          <p className="mt-2 text-lg font-semibold text-[#c9f45a]">{projectStageProgress(stage)}%</p>
          <p className="text-[9px] text-white/65">本阶段权重 {PROJECT_STAGE_WEIGHTS[stage]}%</p>
          <p className="mt-1 min-h-12 text-[10px] leading-4 text-white/80">{PROJECT_STAGE_DETAILS[stage]}</p>
          <p className="mt-2 text-[10px]">{!canEdit ? (current ? "当前阶段" : done ? "已走过" : "未开始") : changingStage ? "正在保存…" : current ? "当前阶段" : done ? "已走过 · 点击可退回" : "点击设为当前阶段"}</p>
        </ReadableAction>
        <EditOnly module="projects"><Button type="button" size="sm" variant="ghost" className="mt-2 h-7 w-full text-[10px] text-white hover:bg-white/10 hover:text-white" onClick={() => onMilestone(stage, defaultAssetCategory(stage))}>记录或上传资料</Button></EditOnly>
      </div>
    })}</div>{message && <p role="status" className="mt-3 rounded-lg bg-primary/8 px-3 py-2 text-xs text-primary">{message}</p>}</CardContent></Card>

    <Card><CardHeader className="pb-3"><CardTitle className="text-base">项目工具与交付</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ActionLink href={`/localization?projectId=${project.id}`} icon={Calculator} title="字数统计与报价" text="选择已有剧本版本，统计全文、台词及费用区间" />
      <ActionLink href="/meetings" icon={MessageSquareText} title="围读记录" text={`${meetings.filter((meeting) => /围读/.test(meeting.meeting_type)).length} 次项目围读`} />
      <div className="rounded-xl border p-3"><PackageCheck className="h-4 w-4 text-primary" /><p className="mt-2 text-xs font-semibold">制作资料</p><p className="mt-1 text-[10px] text-muted-foreground">{hasFile(files, ["美术资产", "制作交接", "抽卡资料", "制作材料", "分集成片"]) ? "已有制作资料，请按阶段核对" : "在对应阶段上传资料后集中查看"}</p></div>
      <div className="rounded-xl border p-3"><FileCheck2 className="h-4 w-4 text-primary" /><p className="mt-2 text-xs font-semibold">项目档案</p><p className="mt-1 text-[10px] text-muted-foreground">{project.status === "archived" ? "项目已归档" : `${nodes.length} 个排期节点 · ${files.filter((file) => file.status !== "archived").length} 份使用中文件`}</p></div>
    </CardContent></Card>
  </div>
}

function ActionLink({ href, icon: Icon, title, text }: { href: string; icon: typeof Calculator; title: string; text: string }) {
  return <Link href={href} className="block rounded-xl border p-3 transition hover:border-primary/40 hover:bg-primary/[.03]"><Icon className="h-4 w-4 text-primary" /><p className="mt-2 text-xs font-semibold">{title}</p><p className="mt-1 text-[10px] text-muted-foreground">{text}</p></Link>
}
