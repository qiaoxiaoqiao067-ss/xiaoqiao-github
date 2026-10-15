"use client"
import { AppLayout } from "@/components/layout/app-layout"
import { MeetingBoard } from "@/components/projects/meeting-board"
import { PageHero } from "@/components/layout/page-hero"
export default function MeetingsPage() { return <AppLayout><div className="space-y-6"><PageHero eyebrow="会议记录 · 结论 · 行动项" title="会议与决策" description="会议可以独立存在，也可以关联项目；结论和后续行动可以继续转成任务。" /><MeetingBoard /></div></AppLayout> }
