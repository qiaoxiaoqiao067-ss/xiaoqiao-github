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
  const [calendarView, setCalendarView] = useState<"week"|"month">("week")
  const [monthOffset, setMonthOffset] = useState(0)
  const [attentionStates, setAttentionStates] = useState<Record<string, { status: AttentionStatus; signature: string }>>(()=>{if(typeof window==="undefined")return {};try{return JSON.parse(window.localStorage.getItem("dashboard-attention-states")||"{}") as Record<string,{status:AttentionStatus;signature:string}>}catch{return {}}})
  const { todos, loading: todosLoading, toggleTodo, updateTodo, refetch: refetchTodos } = useTodos()
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

  const latestAiReview = (item: (typeof contents)[number]) => item.content_reviews
    .filter((review) => review.reviewer_type === "ai")
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0]
  const hasCompletedAiReview = (item: (typeof contents)[number]) => {
    const review = latestAiReview(item)
    return review?.status === "completed" && review.score !== null
  }
  const latestAiScore = (item: (typeof contents)[number]) => {
    const review = latestAiReview(item)
    return review?.score ?? 0
  }
  const pendingReview = contents.filter((item) => !hasCompletedAiReview(item) && item.status !== "reviewing")
  const reviewing = contents.filter((item) => item.status === "reviewing")
  const reviewed = contents.filter(hasCompletedAiReview)
  const candidates = reviewed.filter((item) => latestAiScore(item) >= 80)
  const failedReviews = contents.filter((item) => latestAiReview(item)?.status === "failed")

  const activeProjects = projects.filter((item) => item.status === "active").sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999") || b.progress - a.progress)
  const atRiskProjects = projects.filter((item) => item.status === "deferred" || item.status === "paused" || Boolean(item.risk))
  const dailyHabits = habits.filter((item) => item.active && item.frequency === "daily")
  const weeklyHabits = habits.filter((item) => item.active && item.frequency === "weekly")
  const todayHabits = [...dailyHabits, ...weeklyHabits.filter((item) => item.weekdays.includes(today.getDay()))]
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const nextMeetings = meetings.filter((item) => item.meeting_date && new Date(item.meeting_date).getTime() >= startOfToday).sort((a, b) => (a.meeting_date || "").localeCompare(b.meeting_date || "")).slice(0, 2)
  const pendingResearch = researchItems.filter((item) => !["已完成", "暂缓"].includes(item.status))
  const freshIdeas = [...ideas].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 2)
  const attentionGroups = [
    { key: "overdue", href: "/todos", label: "逾期任务", details: overdueTodos.map((item)=>({id:item.id,title:item.title,meta:`截止 ${item.due_date ? formatDate(item.due_date) : "日期未设置"}`})) },
    { key: "review-failed", href: "/content", label: "审核失败", details: failedReviews.map((item)=>({id:item.id,title:item.title,meta:"最新一次 AI 审核仍失败"})) },
    { key: "project-risk", href: "/projects", label: "项目风险", details: atRiskProjects.map((item)=>({id:item.id,title:item.title,meta:item.risk || (item.status === "paused" ? "项目已暂停" : "项目已延期")})) },
    { key: "waiting", href: "/todos", label: "等待跟进", details: waitingTodos.map((item)=>({id:item.id,title:item.title,meta:item.waiting_for ? `等待：${item.waiting_for}` : (item.next_action || "等待后续处理")})) },
  ].map((group) => {
    const signature = group.details.map((item) => item.id).sort().join(",")
    const saved = attentionStates[group.key]
    const status: AttentionStatus = saved?.signature === signature ? saved.status : "pending"
    return { ...group, signature, status, value: status === "resolved" ? 0 : group.details.length }
  })
  const attentionCount = attentionGroups.reduce((sum, group) => sum + group.value, 0)
  const weekStart = addDays(startOfWeekMonday(new Date()), weekOffset * 7)
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const weekEnd = weekDays[6]
  const visibleMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const monthGridStart = startOfWeekMonday(visibleMonth)
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index))
  const calendarItems: CalendarItem[] = [
    ...activeTodos.filter((item) => item.due_date).map((item) => ({ id: `task-${item.id}`, date: item.due_date!, title: item.title, detail: item.description || item.next_action || "", type: "task" as const, href: "/todos", time: "全天" })),
    ...meetings.filter((item) => item.meeting_date).map((item) => ({ id: `meeting-${item.id}`, date: item.meeting_date!, title: item.title, detail: item.summary || "", type: "meeting" as const, href: "/meetings", time: timeLabel(item.meeting_date!) })),
    ...projects.filter((item) => item.status !== "archived" && item.status !== "completed" && item.due_date).map((item) => ({ id: `project-${item.id}`, date: item.due_date!, title: item.title, detail: item.next_action || item.stage || "", type: "project" as const, href: "/projects", time: "节点" })),
  ]

  const changeTaskStatus = async (id:string, status:"todo"|"in_progress"|"waiting"|"completed") => {
    await updateTodo(id, { status })
  }

  const changeAttentionStatus = (key:string, signature:string, status:AttentionStatus) => {
    setAttentionStates((current) => {
      const next = { ...current, [key]: { status, signature } }
      window.localStorage.setItem("dashboard-attention-states", JSON.stringify(next))
      return next
    })
  }

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

        <section className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1.22fr)_minmax(360px,.78fr)]">
          <Card className="overflow-hidden border-[#5f8b73]/40 bg-[#173f31] text-[#f7f4e9] shadow-[0_10px_24px_rgba(16,58,43,.10)]">
            <CardHeader className="flex-row items-center justify-between border-b border-white/10 px-3.5 py-2"><div className="flex items-baseline gap-2"><p className="text-[8px] font-semibold tracking-[.18em] text-[#c9f45a]">TODAY</p><CardTitle className="text-sm text-white">现在做什么</CardTitle><p className="hidden text-[9px] text-white/45 sm:block">Top 3</p></div><Link href="/todos" className="flex items-center text-[9px] font-semibold text-[#c9f45a]">任务中心 <ChevronRight className="h-3 w-3" /></Link></CardHeader>
            <CardContent className="bg-[#173f31] p-1.5">{loading ? <Skeleton className="h-20 bg-white/10" /> : focusTodos.length ? <div>{focusTodos.map((todo, index) => <div key={todo.id} className="flex min-h-9 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"><Checkbox checked={todo.completed} onCheckedChange={() => void toggleTodo(todo.id)} className="h-3.5 w-3.5 border-white/35 data-[state=checked]:bg-[#c9f45a] data-[state=checked]:text-[#102a21]" /><span className="text-[8px] font-bold text-[#c9f45a]">0{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold">{todo.title}</p></div>{todo.due_date && <span className="hidden shrink-0 text-[9px] text-white/40 sm:inline">{shortDate(todo.due_date)}</span>}<select aria-label={`更新${todo.title}的状态`} value={todo.status || "todo"} onChange={(event)=>void changeTaskStatus(todo.id,event.target.value as "todo"|"in_progress"|"waiting"|"completed")} className={`h-6 max-w-[82px] shrink-0 rounded-full border px-2 text-[9px] font-semibold outline-none transition-colors ${taskStatusClass(todo.status)}`}><option className="bg-white text-[#173f31]" value="todo">待处理</option><option className="bg-white text-[#173f31]" value="in_progress">进行中</option><option className="bg-white text-[#173f31]" value="waiting">等待跟进</option><option className="bg-white text-[#173f31]" value="completed">已完成</option></select></div>)}</div> : <EmptyDark text="今天没有必须立刻处理的任务。" />}</CardContent>
          </Card>

          <Card className="border-[#b8d0b2] bg-[#f7faf3]"><CardContent className="flex h-full flex-col p-2.5"><button onClick={() => setAssistantOpen((value) => !value)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#c9f45a] text-[#102a21]"><Sparkles className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#173f31]">AI 任务助手</span><span className="block truncate text-[9px] text-[#5c7468]">说一句话，自动整理任务</span></span><ChevronDown className={`h-3.5 w-3.5 text-[#5c7468] transition-transform ${assistantOpen ? "rotate-180" : ""}`} /></button>{assistantOpen&&<div className="mt-2"><AiTaskInbox compact onApplied={() => void refetchTodos()} /></div>}<div className="mt-auto border-t border-[#d7e3d2] pt-2"><div className="grid grid-cols-4 gap-1.5"><CompactActionLink href="/content" label="上传剧本" icon={BookOpen} /><CompactActionLink href="/todos" label="添加任务" icon={Plus} /><CompactActionLink href="/discover" label="记录灵感" icon={Lightbulb} /><CompactActionLink href="/research" label="新建调研" icon={Radar} /></div></div></CardContent></Card>
        </section>

        <section>
          <Card className="overflow-hidden">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><p className="section-kicker">CALENDAR</p><CardTitle className="text-base">{calendarView==="week"?"本周日程":"本月日程"}</CardTitle><p className="text-[10px] text-muted-foreground">{calendarView==="week"?`${monthDay(weekStart)} — ${monthDay(weekEnd)}`:`${visibleMonth.getFullYear()}年${visibleMonth.getMonth()+1}月`} · 任务、会议与项目节点</p></div>
              <div className="flex items-center gap-1"><div className="mr-1 flex rounded-full border border-border bg-muted/40 p-0.5"><button onClick={()=>setCalendarView("week")} className={`h-7 rounded-full px-3 text-[10px] font-semibold ${calendarView==="week"?"bg-[#173f31] text-[#c9f45a]":"text-muted-foreground"}`}>本周</button><button onClick={()=>setCalendarView("month")} className={`h-7 rounded-full px-3 text-[10px] font-semibold ${calendarView==="month"?"bg-[#173f31] text-[#c9f45a]":"text-muted-foreground"}`}>本月</button></div><button aria-label={calendarView==="week"?"上一周":"上个月"} onClick={() => calendarView==="week"?setWeekOffset((value) => value - 1):setMonthOffset((value)=>value-1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background hover:bg-secondary"><ChevronLeft className="h-3.5 w-3.5" /></button><button onClick={() => calendarView==="week"?setWeekOffset(0):setMonthOffset(0)} className="h-7 rounded-full border border-border bg-background px-2.5 text-[10px] font-semibold hover:bg-secondary">今天</button><button aria-label={calendarView==="week"?"下一周":"下个月"} onClick={() => calendarView==="week"?setWeekOffset((value) => value + 1):setMonthOffset((value)=>value+1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background hover:bg-secondary"><ChevronRight className="h-3.5 w-3.5" /></button></div>
            </CardHeader>
            <CardContent className="p-0">
              {calendarView==="week"?<div className="overflow-x-auto">
                <div className="grid min-w-[820px] grid-cols-7 divide-x divide-border/60">
                  {weekDays.map((day) => {
                    const key = localDateKey(day)
                    const isToday = key === todayKey
                    const dayItems = calendarItems.filter((item) => item.date.slice(0, 10) === key).sort((a, b) => a.time.localeCompare(b.time))
                    return <div key={key} className={`min-h-[150px] ${isToday ? "bg-[#c9f45a]/[.11]" : "bg-card"}`}>
                      <div className={`flex items-center justify-between border-b border-border/50 px-2.5 py-2 ${isToday ? "text-primary" : ""}`}><span className="text-[10px] text-muted-foreground">周{"一二三四五六日"[dayIndexMonday(day)]}</span><span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-semibold ${isToday ? "bg-[#173f31] text-[#c9f45a]" : ""}`}>{day.getMonth() + 1}/{day.getDate()}</span></div>
                      <div className="space-y-1 p-1.5">{dayItems.length ? dayItems.slice(0, 4).map((item) => <Link key={item.id} href={item.href} className={`block rounded-md border-l-2 px-1.5 py-1 transition-opacity hover:opacity-75 ${calendarItemClass(item.type)}`}><p className="line-clamp-2 text-[9px] font-semibold leading-3">{item.title}</p>{item.detail&&item.detail!==item.title&&<p className="mt-0.5 line-clamp-2 text-[7px] leading-[10px] opacity-70">{item.detail}</p>}<p className="mt-0.5 text-[7px] leading-[10px] opacity-55">{item.time} · {calendarTypeLabel(item.type)}</p></Link>) : <p className="py-5 text-center text-[10px] text-muted-foreground/45">暂无安排</p>}{dayItems.length > 4 && <p className="px-1 text-[9px] font-semibold text-muted-foreground">还有 {dayItems.length - 4} 项</p>}</div>
                    </div>
                  })}
                </div>
              </div>:<MonthCalendar days={monthDays} month={visibleMonth.getMonth()} todayKey={todayKey} items={calendarItems}/>}
              <div className="flex flex-wrap items-center gap-4 border-t border-border/60 px-4 py-2 text-[10px] text-muted-foreground"><Legend color="bg-emerald-500" label="任务" /><Legend color="bg-sky-500" label="会议" /><Legend color="bg-amber-500" label="项目节点" /><span className="ml-auto hidden sm:inline">在任务中心、会议与项目页面设置日期后会自动出现在这里</span></div>
            </CardContent>
          </Card>
        </section>

        <section className={`grid gap-2 rounded-[1.25rem] border p-3 ${attentionCount ? "border-[#d7c58d] bg-[#fbf8ed]" : "border-[#b8d0b2] bg-[#f1f7ed]"}`}>
          <div className="flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${attentionCount ? "text-[#8a6a16]" : "text-[#2d6b4d]"}`} /><p className="text-sm font-semibold text-[#173f31]">{attentionCount ? `需要关注 · ${attentionCount}` : "运行正常 · 暂无紧急事项"}</p></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{attentionGroups.map((group)=><AttentionItem key={group.key} href={group.href} label={group.label} value={group.value} details={group.details} status={group.status} onStatus={(status)=>changeAttentionStatus(group.key,group.signature,status)} />)}</div>
        </section>

        <section>
          <div className="mb-2 flex items-end justify-between"><div><p className="section-kicker">WORKFLOW</p><h2 className="mt-1 text-xl font-semibold">工作流快照</h2></div><p className="hidden text-xs text-muted-foreground sm:block">只呈现下一步需要行动的信息</p></div>
          <div className="grid gap-3 xl:grid-cols-3">
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
type CalendarItem = { id: string; date: string; title: string; detail: string; type: "task" | "meeting" | "project"; href: string; time: string }
function MonthCalendar({days,month,todayKey,items}:{days:Date[];month:number;todayKey:string;items:CalendarItem[]}) { return <div className="bg-card"><div className="grid grid-cols-7 border-b border-border/60 bg-muted/25">{"一二三四五六日".split("").map((day)=><div key={day} className="px-1 py-1.5 text-center text-[9px] font-semibold text-muted-foreground">周{day}</div>)}</div><div className="grid grid-cols-7">{days.map((day)=>{const key=localDateKey(day);const dayItems=items.filter((item)=>item.date.slice(0,10)===key).sort((a,b)=>a.time.localeCompare(b.time));const isToday=key===todayKey;const muted=day.getMonth()!==month;return <div key={key} className={`min-h-[82px] border-b border-r border-border/50 p-1 last:border-r-0 sm:min-h-[94px] ${isToday?"bg-[#c9f45a]/[.12]":muted?"bg-muted/15":"bg-card"}`}><div className="mb-1 flex items-center justify-between"><span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-semibold ${isToday?"bg-[#173f31] text-[#c9f45a]":muted?"text-muted-foreground/45":"text-[#355849]"}`}>{day.getDate()}</span>{dayItems.length>0&&<span className="text-[7px] text-muted-foreground">{dayItems.length}项</span>}</div><div className="space-y-0.5">{dayItems.slice(0,3).map((item)=><Link key={item.id} href={item.href} title={`${calendarTypeLabel(item.type)} · ${item.title}`} className={`flex items-center gap-1 rounded px-1 py-0.5 text-[7px] leading-[10px] hover:opacity-75 sm:text-[8px] ${item.type==="meeting"?"bg-sky-500/10 text-sky-950":item.type==="project"?"bg-amber-500/10 text-amber-950":"bg-emerald-500/10 text-emerald-950"}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.type==="meeting"?"bg-sky-500":item.type==="project"?"bg-amber-500":"bg-emerald-500"}`}/><span className="truncate">{item.title}</span></Link>)}{dayItems.length>3&&<p className="px-1 text-[7px] font-semibold text-muted-foreground">+{dayItems.length-3} 项</p>}</div></div>})}</div></div> }
function startOfWeekMonday(date: Date) { const result = new Date(date); result.setHours(0, 0, 0, 0); const day = result.getDay(); result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); return result }
function addDays(date: Date, count: number) { const result = new Date(date); result.setDate(result.getDate() + count); return result }
function dayIndexMonday(date: Date) { return date.getDay() === 0 ? 6 : date.getDay() - 1 }
function monthDay(date: Date) { return `${date.getMonth() + 1}月${date.getDate()}日` }
function timeLabel(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime()) || !value.includes("T")) return "全天"; return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` }
function calendarTypeLabel(type: CalendarItem["type"]) { return type === "meeting" ? "会议" : type === "project" ? "项目节点" : "任务" }
function calendarItemClass(type: CalendarItem["type"]) { return type === "meeting" ? "border-sky-500 bg-sky-500/10 text-sky-950" : type === "project" ? "border-amber-500 bg-amber-500/10 text-amber-950" : "border-emerald-500 bg-emerald-500/10 text-emerald-950" }
function taskStatusClass(status: string) { return status === "in_progress" ? "border-[#b6df43] bg-[#c9f45a] text-[#173f31]" : status === "waiting" ? "border-[#e0b94f] bg-[#f2d57d] text-[#4d3b05]" : status === "completed" ? "border-[#79b891] bg-[#a9d7b8] text-[#153d2c]" : "border-[#d7ddd6] bg-[#f0f2ed] text-[#385046]" }
function Legend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</span> }
function shortDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value.slice(5, 10) : `${date.getMonth() + 1}/${date.getDate()}` }
function EmptyDark({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-xs text-white/40">{text}</p> }
function EmptyLight({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">{text}</p> }
function CompactActionLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) { return <Link href={href} className="flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-[#bcd0b6] bg-[#f1f7ed] px-2 py-1.5 text-[10px] font-semibold text-[#24563f] transition-colors hover:border-[#8bad7f] hover:bg-[#e3efdc]"><Icon className="h-3.5 w-3.5" />{label}</Link> }
type AttentionStatus = "pending" | "following" | "resolved"
function AttentionItem({ href, label, value, details, status, onStatus }: { href:string; label:string; value:number; details:Array<{id:string;title:string;meta:string}>; status:AttentionStatus; onStatus:(status:AttentionStatus)=>void }) { const [open,setOpen]=useState(false); return <div className={`rounded-xl border text-xs ${value ? "border-[#dccb96] bg-white/75" : "border-[#bdd3b7] bg-[#edf5e9] text-[#537064]"}`}><div className="flex items-center gap-2 px-2.5 py-1.5"><button type="button" onClick={()=>setOpen((current)=>!current)} className="flex min-w-0 flex-1 items-center text-left"><span className="truncate">{label}</span><strong className={`ml-2 ${value ? "text-[#816214]" : "text-[#3f7258]"}`}>{value}</strong><ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${open?"rotate-180":""}`}/></button><select aria-label={`${label}处理状态`} value={status} onChange={(event)=>onStatus(event.target.value as AttentionStatus)} className={`h-6 rounded-full border px-1.5 text-[9px] font-semibold outline-none ${status === "following" ? "border-[#d6b858] bg-[#fff5ce] text-[#7a5c00]" : status === "resolved" ? "border-[#a9cba3] bg-[#e1f1dc] text-[#2d6948]" : "border-[#d9d4c2] bg-white text-[#68766e]"}`}><option value="pending">待处理</option><option value="following">跟进中</option><option value="resolved">已解决</option></select></div>{open&&<div className="border-t border-current/10 px-2.5 py-2"><div className="max-h-36 space-y-1.5 overflow-auto">{details.length?details.map((item)=><div key={item.id} className="rounded-lg bg-white/70 px-2 py-1.5"><p className="truncate text-[10px] font-semibold text-[#173f31]">{item.title}</p><p className="mt-0.5 text-[9px] text-[#6b786f]">{item.meta}</p></div>):<p className="py-1 text-[10px] text-[#52705f]">当前没有未解决事项。</p>}</div>{details.length>0&&<Link href={href} className="mt-2 flex items-center justify-end text-[9px] font-semibold text-[#245f44]">进入对应页面处理 <ChevronRight className="h-3 w-3"/></Link>}</div>}</div> }
function MiniMetric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) { return <div className={`rounded-xl border px-2 py-2 text-center ${accent ? "border-[#b7d66a] bg-[#dff2aa]" : "border-[#c8d9c2] bg-white/65"}`}><p className="text-lg font-semibold tracking-[-.04em] text-[#173f31]">{value}</p><p className="mt-0.5 text-[9px] text-[#668072]">{label}</p></div> }
function SnapshotCard({ title, eyebrow, href, icon: Icon, children }: { title: string; eyebrow: string; href: string; icon: React.ElementType; children: React.ReactNode }) { return <Card className="overflow-hidden border-[#bdd2b7] bg-gradient-to-br from-[#f8fbf5] to-[#eaf3e5] shadow-[0_8px_20px_rgba(23,63,49,.06)]"><CardHeader className="flex-row items-center justify-between border-b border-[#c8d9c2] bg-[#e5f0df]/75 px-4 py-2.5"><div><p className="text-[8px] font-bold tracking-[.18em] text-[#6c8b78]">{eyebrow}</p><CardTitle className="mt-0.5 text-sm text-[#173f31]">{title}</CardTitle></div><Link href={href} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#173f31] text-[#c9f45a]"><Icon className="h-3.5 w-3.5" /></Link></CardHeader><CardContent className="p-3.5 text-[#173f31]">{children}<Link href={href} className="mt-2.5 flex items-center text-[10px] font-semibold text-[#245f44]">进入工作区 <ChevronRight className="h-3 w-3" /></Link></CardContent></Card> }
