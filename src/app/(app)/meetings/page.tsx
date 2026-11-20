"use client"
import Link from "next/link"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { AppLayout } from "@/components/layout/app-layout"
import { MeetingBoardCompact } from "@/components/projects/meeting-board-compact"
import { PageHero } from "@/components/layout/page-hero"
import { Button } from "@/components/ui/button"
export default function MeetingsPage() { return <Suspense fallback={<AppLayout><div className="h-48 animate-pulse rounded-2xl bg-muted"/></AppLayout>}><MeetingsContent/></Suspense> }
function MeetingsContent(){const projectId=useSearchParams().get("projectId");return <AppLayout><div className="space-y-6"><PageHero eyebrow="会议纪要 · 结论 · 知识沉淀" title="会议记录" description="会议按月份归档；摘要、结论和原文默认折叠，点击会议行即可查看。" action={projectId?<Button asChild variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link href={`/projects/${projectId}`}><ArrowLeft className="mr-1.5 h-3.5 w-3.5"/>返回项目详情</Link></Button>:undefined}/><MeetingBoardCompact /></div></AppLayout>}
