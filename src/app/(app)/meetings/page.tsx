"use client"
import { AppLayout } from "@/components/layout/app-layout"
import { MeetingBoardCompact } from "@/components/projects/meeting-board-compact"
import { PageHero } from "@/components/layout/page-hero"
export default function MeetingsPage() { return <AppLayout><div className="space-y-6"><PageHero eyebrow="会议纪要 · 结论 · 知识沉淀" title="会议记录" description="会议按月份归档；摘要、结论和原文默认折叠，点击会议行即可查看。" /><MeetingBoardCompact /></div></AppLayout> }
