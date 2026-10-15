"use client"

import { useState } from "react"
import Link from "next/link"
import { AppLayout } from "@/components/layout/app-layout"
import { useTodos } from "@/hooks/use-todos"
import { useContents } from "@/hooks/use-contents"
import { useHabits } from "@/hooks/use-habits"
import { useProjects } from "@/hooks/use-projects"
import { useMeetings } from "@/hooks/use-meetings"
import { useResearchItems } from "@/hooks/use-research-items"
import { useIdeas } from "@/hooks/use-ideas"
import { AiTaskInbox } from "@/components/tasks/ai-task-inbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate, isWorkday, getGreeting } from "@/lib/utils"
import { AlertTriangle, ArrowUpRight, BookOpen, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleDot, Clock3, Lightbulb, Plus, Radar, Sparkles } from "lucide-react"

export default function DashboardPage() {
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const { todos, loading: todosLoading, toggleTodo, refetch: refetchTodos } = useTodos()
  const { contents, loading: contentsLoading } = useContents()
  const { habits, completedIds, loading: habitsLoading, toggleToday } = useHabits()
  const { projects, loading: projectsLoading } = useProjects()
  const { meetings } = useMeetings()
  const { items: researchItems } = useResearchItems()
  const { ideas } = useIdeas()
  const loading = todosLoading || contentsLoading || projectsLoading
  const today = new Date()
  const todayKey = localDateKey(today)

  const activeTodos = todos.filter((item) => !item.completed && item.status !== "completed" && item.status !== "cancelled")
  const waitingTodos = activeTodos.filter((item) => item.status === "waiting" || item.status === "blocked")
  const actionableTodos = activeTodos.filter((item) => item.status !== "waiting" && item.status !== "blocked").sort((a, b) => b.priority - a.priority || ((a.due_date || "9999").localeCompare(b.due_date || "9999")))
  const todayPool = actionableTodos.filter((item) => item.priority >= 2 || Boolean(item.due_date && item.due_date.slice(0, 10) <= todayKey))
  const focusTodos = todayPool.slice(0, 3)
  const overdueTodos = activeTodos.filter((item) => item.due_date && item.due_date.slice(0, 10) < todayKey)

  const hasCompletedAiReview = (item: (typeof contents)[number]) => item.content_reviews.some((review) => review.reviewer_type === "ai" && review.status === "completed" && review.score !== null)
  const latestAiScore = (item: (typeof contents)[number]) => {
    const review = item.content_reviews.find((candidate) => candidate.reviewer_type === "ai" && candidate.status === "completed" && candidate.score !== null)
    return review?.score ?? 0
  }
  const pendingReview = contents.filter((item) => !hasCompletedAiReview(item) && item.status !== "reviewing")
  const reviewing = contents.filter((item) => item.status === "reviewing")
  const reviewed = contents.filter(hasCompletedAiReview)
  const candidates = reviewed.filter((item) => latestAiScore(item) >= 80)
  const failedReviews = contents.filter((item) => item.content_reviews.some((review) => review.reviewer_type === "ai" && review.status === "failed"))

  const activeProjects = projects.filter((item) => item.status === "active").sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999") || b.progress - a.progress)
  const atRiskProjects = projects.filter((item) => item.status === "deferred" || item.status === "paused" || Boolean(item.risk))
  const dailyHabits = habits.filter((item) => item.active && item.frequency === "daily")
  const weeklyHabits = habits.filter((item) => item.active && item.frequency === "weekly")
  const todayHabits = [...dailyHabits, ...weeklyHabits.filter((item) => item.weekdays.includes(today.getDay()))]
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const nextMeetings = meetings.filter((item) => item.meeting_date && new Date(item.meeting_date).getTime() >= startOfToday).sort((a, b) => (a.meeting_date || "").localeCompare(b.meeting_date || "")).slice(0, 2)
  const pendingResearch = researchItems.filter((item) => !["已完成", "暂缓"].includes(item.status))
  const freshIdeas = [...ideas].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 2)
  const attentionCount = overdueTodos.length + failedReviews.length + atRiskProjects.length + waitingTodos.length
  const weekStart = addDays(startOfWeekMonday(new Date()), weekOffset * 7)
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const weekEnd = weekDays[6]
  const calendarItems: CalendarItem[] = [
    ...activeTodos.filter((item) => item.due_date).map((item) => ({ id: `task-${item.id}`, date: item.due_date!, title: item.title, type: "task" as const, href: "/todos", time: "全天" })),
    ...meetings.filter((item) => item.meeting_date).map((item) => ({ id: `meeting-${item.id}`, date: item.meeting_date!, title: item.title, type: "meeting" as const, href: "/meetings", time: timeLabel(item.meeting_date!) })),
    ...projects.filter((item) => item.status !== "archived" && item.status !== "completed" && item.due_date).map((item) => ({ id: `project-${item.id}`, date: item.due_date!, title: item.title, type: "project" as const, href: "/projects", time: "节点" })),
  ]

  return (
    <AppLayout>
      <div className="space-y-4">
        <section className="relative overflow-hidden rounded-[1.35rem] bg-[#103a2b] px-5 py-3.5 text-[#f8f6ed] shadow-[0_14px_35px_rgba(10,48,35,.14)] sm:px-6">
          <div className="absolute -right-12 -top-20 h-40 w-40 rounded-full bg-[#c9f45a]/16 blur-3xl" />
          <div className="relative flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="font-editorial text-xl font-normal tracking-[-.035em] text-[#c9f45a] sm:text-2xl">让一些好事的人把云霞摘下来吧。</h1><span className="text-[10px] font-semibold tracking-[.2em] text-white/45">今日内容工作台</span><span className="text-[11px] text-white/55">{formatDate(today)} · {isWorkday(today) ? "工作日" : "休息日"} · {getGreeting()}</span></div>
            <Link href="/todos" className="inline-flex shrink-0 items-center text-xs font-semibold text-[#c9f45a]">进入任务中心 <ChevronRight className="h-3.5 w-3.5" /></Link>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
          <Card className="overflow-hidden border-[#c9f45a]/35 bg-[#173f31] text-[#f7f4e9]">
            <CardHeader className="flex-row items-center justify-between border-b border-white/10 px-4 py-3"><div className="flex items-baseline gap-3"><p className="text-[9px] font-semibold tracking-[.2em] text-[#c9f45a]">TODAY</p><CardTitle className="text-base text-white">现在做什么</CardTitle><p className="hidden text-[10px] text-white/45 sm:block">最重要的三件事</p></div><Link href="/todos" className="flex items-center text-[10px] font-semibold text-[#c9f45a]">全部任务 <ChevronRight className="h-3 w-3" /></Link></CardHeader>
            <CardContent className="bg-[#173f31] p-2.5">{loading ? <Skeleton className="h-28 bg-white/10" /> : focusTodos.length ? <div className="space-y-0.5">{focusTodos.map((todo, index) => <div key={todo.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-white/5"><Checkbox checked={todo.completed} onCheckedChange={() => void toggleTodo(todo.id)} className="border-white/35 data-[state=checked]:bg-[#c9f45a] data-[state=checked]:text-[#102a21]" /><span className="text-[9px] font-bold text-[#c9f45a]">0{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{todo.title}</p><p className="mt-0.5 truncate text-[10px] text-white/45">{todo.next_action || todo.description || "今日推进"}</p></div>{todo.due_date && <span className="shrink-0 text-[9px] text-white/40">{shortDate(todo.due_date)}</span>}</div>)}</div> : <EmptyDark text="今天没有必须立刻处理的任务。" />}</CardContent>
          </Card>

          <div className="space-y-3">
            <Card className="border-primary/15 bg-primary/[.035]"><CardContent className="p-3"><button onClick={() => setAssistantOpen((value) => !value)} className="flex w-full items-center gap-3 text-left"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c9f45a] text-[#102a21]"><Sparkles className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">AI 任务助手</span><span className="block truncate text-[11px] text-muted-foreground">说发生了什么，自动整理成任务</span></span><ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${assistantOpen ? "rotate-180" : ""}`} /></button></CardContent></Card>
            {assistantOpen && <AiTaskInbox compact onApplied={() => void refetchTodos()} />}
            <Card><CardContent className="p-3"><p className="mb-2 text-[11px] font-semibold text-muted-foreground">快速开始</p><div className="grid grid-cols-2 gap-2"><ActionLink href="/content" label="上传剧本" icon={BookOpen} /><ActionLink href="/todos" label="添加任务" icon={Plus} /><ActionLink href="/discover" label="记录灵感" icon={Lightbulb} /><ActionLink href="/research" label="新建调研" icon={Radar} /></div></CardContent></Card>
          </div>
        </section>

        <section>
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between border-b border-border/60 px-4 py-3">
              <div><p className="section-kicker">CALENDAR</p><CardTitle className="mt-1 text-lg">本周日程</CardTitle><p className="mt-0.5 text-[11px] text-muted-foreground">{monthDay(weekStart)} — {monthDay(weekEnd)} · 任务、会议与项目节点</p></div>
              <div className="flex items-center gap-1"><button aria-label="上一周" onClick={() => setWeekOffset((value) => value - 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button><button onClick={() => setWeekOffset(0)} className="h-8 rounded-full border border-border bg-background px-3 text-[11px] font-semibold hover:bg-secondary">本周</button><button aria-label="下一周" onClick={() => setWeekOffset((value) => value + 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background hover:bg-secondary"><ChevronRight className="h-4 w-4" /></button></div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <div className="grid min-w-[820px] grid-cols-7 divide-x divide-border/60">
                  {weekDays.map((day) => {
                    const key = localDateKey(day)
                    const isToday = key === todayKey
                    const dayItems = calendarItems.filter((item) => item.date.slice(0, 10) === key).sort((a, b) => a.time.localeCompare(b.time))
                    return <div key={key} className={`min-h-[150px] ${isToday ? "bg-[#c9f45a]/[.11]" : "bg-card"}`}>
                      <div className={`flex items-center justify-between border-b border-border/50 px-2.5 py-2 ${isToday ? "text-primary" : ""}`}><span className="text-[10px] text-muted-foreground">周{"一二三四五六日"[dayIndexMonday(day)]}</span><span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-semibold ${isToday ? "bg-[#173f31] text-[#c9f45a]" : ""}`}>{day.getMonth() + 1}/{day.getDate()}</span></div>
                      <div className="space-y-1.5 p-2">{dayItems.length ? dayItems.slice(0, 4).map((item) => <Link key={item.id} href={item.href} className={`block rounded-lg border-l-2 px-2 py-1.5 transition-opacity hover:opacity-75 ${calendarItemClass(item.type)}`}><p className="truncate text-[10px] font-semibold">{item.title}</p><p className="mt-0.5 text-[9px] opacity-65">{item.time} · {calendarTypeLabel(item.type)}</p></Link>) : <p className="py-5 text-center text-[10px] text-muted-foreground/45">暂无安排</p>}{dayItems.length > 4 && <p className="px-1 text-[9px] font-semibold text-muted-foreground">还有 {dayItems.length - 4} 项</p>}</div>
                    </div>
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t border-border/60 px-4 py-2 text-[10px] text-muted-foreground"><Legend color="bg-emerald-500" label="任务" /><Legend color="bg-sky-500" label="会议" /><Legend color="bg-amber-500" label="项目节点" /><span className="ml-auto hidden sm:inline">在任务中心、会议与项目页面设置日期后会自动出现在这里</span></div>
            </CardContent>
          </Card>
        </section>

        <section className={`grid gap-2 rounded-[1.25rem] border p-3 ${attentionCount ? "border-amber-500/25 bg-amber-500/[.055]" : "border-emerald-500/20 bg-emerald-500/[.045]"}`}>
          <div className="flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${attentionCount ? "text-amber-700" : "text-emerald-700"}`} /><p className="text-sm font-semibold">{attentionCount ? `需要关注 · ${attentionCount}` : "运行正常 · 暂无紧急事项"}</p></div>
          {attentionCount > 0 && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><AttentionLink href="/todos" label="逾期任务" value={overdueTodos.length} /><AttentionLink href="/content" label="审核失败" value={failedReviews.length} /><AttentionLink href="/projects" label="项目风险" value={atRiskProjects.length} /><AttentionLink href="/todos" label="等待跟进" value={waitingTodos.length} /></div>}
        </section>

        <section>
          <div className="mb-2 flex items-end justify-between"><div><p className="section-kicker">WORKFLOW</p><h2 className="mt-1 text-xl font-semibold">工作流快照</h2></div><p className="hidden text-xs text-muted-foreground sm:block">只呈现下一步需要行动的信息</p></div>
          <div className="grid gap-4 xl:grid-cols-3">
            <SnapshotCard title="收稿与审稿" eyebrow="EDITORIAL" href="/content" icon={BookOpen}><div className="grid grid-cols-4 gap-1.5"><MiniMetric label="待审核" value={pendingReview.length} /><MiniMetric label="审核中" value={reviewing.length} /><MiniMetric label="已审核" value={reviewed.length} /><MiniMetric label="高分" value={candidates.length} accent /></div><p className="mt-3 text-[11px] text-muted-foreground">高分候选包含在已审核中，不重复计入总量。</p></SnapshotCard>
            <SnapshotCard title="项目推进" eyebrow="PROJECTS" href="/projects" icon={CircleDot}>{activeProjects.length ? <div className="space-y-2">{activeProjects.slice(0, 4).map((item) => <Link href="/projects" key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><div className="min-w-0"><p className="truncate text-xs font-semibold">{item.title}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.next_action || item.stage}</p></div><div className="text-right"><p className="text-xs font-semibold text-primary">{item.progress}%</p><p className="text-[9px] text-muted-foreground">{item.due_date ? shortDate(item.due_date) : "未定期"}</p></div></Link>)}</div> : <EmptyLight text="还没有正在推进的项目。" />}</SnapshotCard>
            <SnapshotCard title="选题与市场" eyebrow="INSIGHTS" href="/discover" icon={Radar}><div className="flex items-center justify-between rounded-xl bg-secondary/55 px-3 py-2"><span className="text-xs text-muted-foreground">待调研事项</span><strong className="text-lg">{pendingResearch.length}</strong></div><div className="mt-2 space-y-1.5">{freshIdeas.length ? freshIdeas.map((idea) => <Link href="/discover" key={idea.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-2"><Lightbulb className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-xs">{idea.title}</span><Badge variant="outline" className="text-[9px]">{idea.status}</Badge></Link>) : <EmptyLight text="还没有最新选题信号。" />}</div></SnapshotCard>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <Card><CardHeader className="flex-row items-center justify-between px-4 py-3"><div><p className="section-kicker">RHYTHM</p><CardTitle className="mt-1 text-base">今日固定节奏</CardTitle></div><Link href="/todos" className="text-[11px] font-semibold text-primary">管理固定事项</Link></CardHeader><CardContent className="grid gap-2 px-4 pb-4 pt-0 sm:grid-cols-2 xl:grid-cols-3">{habitsLoading ? <Skeleton className="h-16 sm:col-span-2" /> : todayHabits.length ? todayHabits.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/65 bg-background/45 px-3 py-2.5"><Checkbox checked={completedIds.has(item.id)} onCheckedChange={() => void toggleToday(item.id)} /><span className={`min-w-0 truncate text-xs ${completedIds.has(item.id) ? "text-muted-foreground line-through" : "font-medium"}`}>{item.name}</span></label>) : <EmptyLight text="今天没有固定事项。" />}</CardContent></Card>
          <Card><CardHeader className="flex-row items-center justify-between px-4 py-3"><div><p className="section-kicker">UP NEXT</p><CardTitle className="mt-1 text-base">近期会议与复盘</CardTitle></div><Link href="/meetings"><ArrowUpRight className="h-4 w-4 text-muted-foreground" /></Link></CardHeader><CardContent className="space-y-2 px-4 pb-4 pt-0">{nextMeetings.length ? nextMeetings.map((meeting) => <Link href="/meetings" key={meeting.id} className="flex items-center gap-3 rounded-xl border border-border/65 px-3 py-2"><CalendarDays className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{meeting.title}</p><p className="text-[10px] text-muted-foreground">{meeting.meeting_date ? formatDate(meeting.meeting_date) : "待定"} · {meeting.meeting_type}</p></div></Link>) : <p className="text-xs text-muted-foreground">近期没有已安排的会议。</p>}<Link href="/reports" className="flex items-center justify-between rounded-xl bg-amber-500/[.07] px-3 py-2 text-xs font-semibold text-amber-800"><span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />下班前完成工作复盘</span><ChevronRight className="h-3.5 w-3.5" /></Link></CardContent></Card>
        </section>
      </div>
    </AppLayout>
  )
}

function localDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` }
type CalendarItem = { id: string; date: string; title: string; type: "task" | "meeting" | "project"; href: string; time: string }
function startOfWeekMonday(date: Date) { const result = new Date(date); result.setHours(0, 0, 0, 0); const day = result.getDay(); result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); return result }
function addDays(date: Date, count: number) { const result = new Date(date); result.setDate(result.getDate() + count); return result }
function dayIndexMonday(date: Date) { return date.getDay() === 0 ? 6 : date.getDay() - 1 }
function monthDay(date: Date) { return `${date.getMonth() + 1}月${date.getDate()}日` }
function timeLabel(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime()) || !value.includes("T")) return "全天"; return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` }
function calendarTypeLabel(type: CalendarItem["type"]) { return type === "meeting" ? "会议" : type === "project" ? "项目节点" : "任务" }
function calendarItemClass(type: CalendarItem["type"]) { return type === "meeting" ? "border-sky-500 bg-sky-500/10 text-sky-950" : type === "project" ? "border-amber-500 bg-amber-500/10 text-amber-950" : "border-emerald-500 bg-emerald-500/10 text-emerald-950" }
function Legend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</span> }
function shortDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value.slice(5, 10) : `${date.getMonth() + 1}/${date.getDate()}` }
function EmptyDark({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-xs text-white/40">{text}</p> }
function EmptyLight({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">{text}</p> }
function ActionLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) { return <Link href={href} className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/50 px-3 py-2.5 text-xs font-semibold transition-colors hover:border-primary/30 hover:bg-primary/5"><Icon className="h-3.5 w-3.5 text-primary" />{label}</Link> }
function AttentionLink({ href, label, value }: { href: string; label: string; value: number }) { return <Link href={href} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${value ? "border-amber-500/20 bg-background/75" : "border-border/50 bg-background/35 text-muted-foreground"}`}><span>{label}</span><strong className={value ? "text-amber-800" : ""}>{value}</strong></Link> }
function MiniMetric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) { return <div className={`rounded-xl px-2 py-2.5 text-center ${accent ? "bg-[#c9f45a]/25" : "bg-secondary/55"}`}><p className="text-lg font-semibold tracking-[-.04em]">{value}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{label}</p></div> }
function SnapshotCard({ title, eyebrow, href, icon: Icon, children }: { title: string; eyebrow: string; href: string; icon: React.ElementType; children: React.ReactNode }) { return <Card className="overflow-hidden"><CardHeader className="flex-row items-center justify-between border-b border-border/55 px-4 py-3"><div><p className="section-kicker">{eyebrow}</p><CardTitle className="mt-1 text-base">{title}</CardTitle></div><Link href={href} className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-primary"><Icon className="h-4 w-4" /></Link></CardHeader><CardContent className="p-4">{children}<Link href={href} className="mt-3 flex items-center text-[11px] font-semibold text-primary">进入工作区 <ChevronRight className="h-3 w-3" /></Link></CardContent></Card> }
