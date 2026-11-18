"use client"
import { ReadableAction, EditOnly } from "@/components/permissions/workspace-permissions"

import { useMemo } from "react"
import { Pencil } from "lucide-react"
import type { Project } from "@/hooks/use-projects"
import { displayTimelineTrack, type ProjectTimelineItem } from "@/hooks/use-project-timeline"
import { departmentScheduleEntries, scheduleDateLabel, type ScheduleEntry } from "@/lib/projects/department-schedule"
import { RESPONSIBILITY_LANES, RESPONSIBILITY_LANE_HELP, responsibilityLane } from "@/lib/projects/responsibility-lanes"

type Props = {
  projects: Project[]
  items: ProjectTimelineItem[]
  first: string
  last: string
  onEdit: (item: ProjectTimelineItem) => void
}

const STATUS: Record<string, string> = { active: "进行中", completed: "已完成", delayed: "已延期", paused: "已暂停" }

function ScheduleNode({ entry, onEdit }: { entry: ScheduleEntry; onEdit: Props["onEdit"] }) {
  const pending = !entry.start
  return <ReadableAction module="projects"
    type="button"
    onClick={() => onEdit({ ...entry.item, track: displayTimelineTrack(entry.item) })}
    aria-label={`编辑 ${scheduleDateLabel(entry.start, entry.end)} ${entry.title}`}
    className={`group flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:border-primary/40 ${pending ? "border-amber-200 bg-amber-50/60" : "border-border/70 bg-card hover:bg-secondary/30"}`}
  >
    <span className={`shrink-0 text-sm font-bold tabular-nums ${pending ? "text-amber-800" : "text-primary"}`}>{scheduleDateLabel(entry.start, entry.end)}</span>
    <span className="min-w-0 flex-1 break-words text-sm leading-5">{entry.title}{!pending && STATUS[entry.item.status] && <span className="ml-2 inline-block text-xs text-muted-foreground">{STATUS[entry.item.status]}</span>}</span>
    <EditOnly module="projects"><Pencil aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" /></EditOnly>
  </ReadableAction>
}

export function DepartmentSchedule({ projects, items, first, last, onEdit }: Props) {
  const entries = useMemo(() => departmentScheduleEntries(items, first, last), [items, first, last])
  const orderedProjects = [...projects].sort((a, b) => Number(a.project_no || 999999) - Number(b.project_no || 999999) || a.created_at.localeCompare(b.created_at))
  return <div className="space-y-6 p-4 sm:p-5">
    {RESPONSIBILITY_LANES.map((lane, laneIndex) => {
      const laneEntries = entries.filter((entry) => responsibilityLane({ ...entry.item, title: entry.title }) === lane)
      if (!laneEntries.length) return null
      return <section key={lane} aria-label={`${lane}排期`} className="overflow-hidden rounded-2xl border border-border/80">
        <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${laneIndex % 2 ? "bg-[#174b39] text-white" : "bg-[#eaf3dc] text-[#174b39]"}`}>
          <div><h3 className="text-base font-bold">{lane}</h3><p className={`mt-0.5 text-[11px] ${laneIndex % 2 ? "text-white/70" : "text-[#56705f]"}`}>{RESPONSIBILITY_LANE_HELP[lane]}</p></div>
          <span className={`text-xs ${laneIndex % 2 ? "text-white/75" : "text-[#476457]"}`}>{laneEntries.length} 个节点</span>
        </div>
        <div className="hidden grid-cols-[220px_minmax(0,1fr)] border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground md:grid"><span>项目</span><span>具体日期 · 工作节点</span></div>
        {orderedProjects.length ? orderedProjects.map((project) => {
          const projectEntries = laneEntries.filter((entry) => entry.item.project_id === project.id)
          if (!projectEntries.length) return null
          const modes = [...new Set(projectEntries.filter((entry) => entry.start).map((entry) => displayTimelineTrack(entry.item)).filter((track) => /自制|承制/.test(track)))].map((track) => track.includes("自制") ? "自制" : "承制")
          return <div key={project.id} className="grid gap-2 border-b border-border/60 px-4 py-3 last:border-b-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-0">
            <div className="flex items-start gap-2 pr-4 pt-1.5"><span className="text-sm font-semibold leading-6">{project.title}</span>{modes.length === 1 && <span className="mt-0.5 shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">{modes[0]}</span>}</div>
            <div className="grid min-w-0 content-start gap-2 xl:grid-cols-2 2xl:grid-cols-3" aria-label={`${project.title} ${lane}节点`}>
              {projectEntries.map((entry) => <ScheduleNode key={entry.key} entry={entry} onEdit={onEdit} />)}
            </div>
          </div>
        }) : <p className="p-6 text-sm text-muted-foreground">建立项目后即可添加排期。</p>}
      </section>
    })}
  </div>
}
