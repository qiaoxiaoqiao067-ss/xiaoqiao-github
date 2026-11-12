"use client"

import { useState } from "react"
import type { Project } from "@/hooks/use-projects"
import { displayTimelineTrack } from "@/hooks/use-project-timeline"
import type { ScheduleHistoryEntry } from "@/lib/projects/schedule-versions"

export function ScheduleHistory({ projects, entries }: { projects: Project[]; entries: ScheduleHistoryEntry[] }) {
  const [query, setQuery] = useState("")
  const projectNames = new Map(projects.map((project) => [project.id, project.title]))
  const visible = entries.filter(({ item, source, reason }) => `${projectNames.get(item.project_id) || ""} ${item.title} ${item.content || ""} ${item.notes || ""} ${source} ${reason}`.toLowerCase().includes(query.trim().toLowerCase()))

  return <section aria-label="排期历史记录" className="space-y-4 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-base font-bold">历史记录 · {entries.length} 条</h3><p className="mt-1 text-sm text-muted-foreground">保留旧版、已替代及重复节点的原日期与备注，仅供追溯。显示全部月份。</p></div>
      <input aria-label="搜索历史记录" placeholder="搜索项目、节点或来源" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-card px-3 text-sm sm:w-64" />
    </div>
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground"><tr>{["原计划日期", "项目 / 部门", "节点", "来源 / 归档原因"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{visible.map(({ item, source, reason }) => <tr key={item.id} className="border-t align-top">
          <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">{item.start_date}{item.end_date !== item.start_date && <><br /><span className="font-normal text-muted-foreground">至 {item.end_date}</span></>}</td>
          <td className="max-w-[240px] px-4 py-3"><p className="font-medium">{projectNames.get(item.project_id) || "未关联项目"}</p><p className="mt-1 text-xs text-muted-foreground">{displayTimelineTrack(item)}</p></td>
          <td className="max-w-[400px] px-4 py-3"><p className="font-medium">{item.title}</p>{(item.content || item.notes) && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">原内容与备注</summary>{item.content && <p className="mt-2 whitespace-pre-wrap">{item.content}</p>}{item.notes && <p className="mt-2 whitespace-pre-wrap">{item.notes}</p>}</details>}</td>
          <td className="max-w-[240px] px-4 py-3"><span className="rounded-md bg-secondary px-2 py-1 text-xs">{reason}</span><p className="mt-2 break-words text-xs text-muted-foreground">{source}</p></td>
        </tr>)}</tbody>
      </table>
      {!visible.length && <p className="p-8 text-center text-sm text-muted-foreground">{query ? "没有匹配的历史记录。" : "暂无历史记录。"}</p>}
    </div>
  </section>
}
