"use client"

import Link from "next/link"
import type { CalendarItem } from "@/lib/projects/calendar-schedule"
import { scheduleDateLabel } from "@/lib/projects/department-schedule"

function eventStyle(item: CalendarItem) {
  if (item.type === "meeting") return "border-sky-500 bg-sky-500/10 text-sky-950"
  if (item.type === "task") return "border-emerald-500 bg-emerald-500/10 text-emerald-950"
  if (item.department === "内容部") return "border-violet-500 bg-violet-500/10 text-violet-950"
  if (item.department === "制作部") return "border-amber-500 bg-amber-500/10 text-amber-950"
  return "border-slate-400 bg-slate-500/10 text-slate-900"
}

export function CalendarEvent({ item, onEdit, compact = false }: { item: CalendarItem; onEdit: (id: string) => void; compact?: boolean }) {
  const className = `block w-full rounded-md border-l-2 px-1.5 py-1 text-left transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${eventStyle(item)}`
  const contents = <><p className="line-clamp-2 text-[10px] font-semibold leading-4">{item.title}</p>{item.detail && item.detail !== item.title && <p className="mt-0.5 text-[10px] leading-4 opacity-85">{item.detail}</p>}{(!compact || item.type === "project") && <p className="mt-0.5 text-[9px] leading-3 opacity-70">{item.type === "project" ? item.department : `${item.time} · ${item.type === "meeting" ? "会议" : "任务"}`}</p>}</>
  if (item.type === "project" && item.scheduleId) return <button type="button" onClick={() => onEdit(item.scheduleId!)} aria-label={`编辑排期：${scheduleDateLabel(item.date, item.endDate || item.date)} ${item.title} · ${item.detail}`} title={`${item.department} · ${item.title} · ${item.detail}（点击编辑）`} className={className}>{contents}</button>
  return <Link href={item.href} title={`${item.title} · ${item.detail}`} className={className}>{contents}</Link>
}
