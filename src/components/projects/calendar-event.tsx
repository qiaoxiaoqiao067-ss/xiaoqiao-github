"use client"

import Link from "next/link"
import { Check, Clock3 } from "lucide-react"
import type { TimelineStatus } from "@/hooks/use-project-timeline"
import type { CalendarItem } from "@/lib/projects/calendar-schedule"
import { scheduleDateLabel } from "@/lib/projects/department-schedule"

const STATUS: Record<TimelineStatus, { label: string; className: string }> = {
  planned: { label: "待开始", className: "opacity-70" },
  active: { label: "进行中", className: "opacity-70" },
  completed: { label: "已完成", className: "bg-emerald-100 text-emerald-800 font-semibold" },
  delayed: { label: "已延期", className: "bg-rose-100 text-rose-800 font-semibold" },
  paused: { label: "已暂停", className: "opacity-70" },
}

function eventStyle(item: CalendarItem) {
  if (item.type === "meeting") return "border-sky-500 bg-sky-500/10 text-sky-950"
  if (item.type === "task") return "border-emerald-500 bg-emerald-500/10 text-emerald-950"
  if (item.department === "内容部") return "border-violet-500 bg-violet-500/10 text-violet-950"
  if (item.department === "制作部") return "border-amber-500 bg-amber-500/10 text-amber-950"
  return "border-slate-400 bg-slate-500/10 text-slate-900"
}

export function CalendarEvent({ item, onEdit, compact = false }: { item: CalendarItem; onEdit: (id: string) => void; compact?: boolean }) {
  const className = `block w-full rounded-md border-l-2 px-1.5 py-1 text-left transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${eventStyle(item)}`
  const status = item.type === "project" && item.scheduleStatus ? STATUS[item.scheduleStatus] : undefined
  const contents = <>
    <p className="line-clamp-2 text-[10px] font-semibold leading-4">{item.title}</p>
    {item.detail && item.detail !== item.title && <p className="mt-0.5 text-[10px] leading-4 opacity-85">{item.detail}</p>}
    {item.type === "project" ? <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[9px] leading-3">
      <span className="opacity-70">{item.department}</span>
      {status && <span className={`inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 ${status.className}`}>
        {item.scheduleStatus === "completed" && <Check aria-hidden="true" className="h-2.5 w-2.5" />}
        {item.scheduleStatus === "delayed" && <Clock3 aria-hidden="true" className="h-2.5 w-2.5" />}
        {status.label}
      </span>}
    </div> : !compact && <p className="mt-0.5 text-[9px] leading-3 opacity-70">{`${item.time} · ${item.type === "meeting" ? "会议" : "任务"}`}</p>}
  </>
  const statusDescription = status ? ` · ${status.label}` : ""
  if (item.type === "project" && item.scheduleId) return <button type="button" onClick={() => onEdit(item.scheduleId!)} aria-label={`编辑排期：${scheduleDateLabel(item.date, item.endDate || item.date)} ${item.title} · ${item.detail}${statusDescription}`} title={`${item.department} · ${item.title} · ${item.detail}${statusDescription}（点击编辑）`} className={className}>{contents}</button>
  return <Link href={item.href} title={`${item.title} · ${item.detail}`} className={className}>{contents}</Link>
}
