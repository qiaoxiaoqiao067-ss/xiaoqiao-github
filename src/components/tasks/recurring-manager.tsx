"use client"

import { useState } from "react"
import { useHabits, type HabitFrequency } from "@/hooks/use-habits"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { CalendarClock, Loader2, Pause, Play, Plus, Trash2 } from "lucide-react"

const WEEKDAYS = [{n:1,l:"一"},{n:2,l:"二"},{n:3,l:"三"},{n:4,l:"四"},{n:5,l:"五"},{n:6,l:"六"},{n:0,l:"日"}]
const TEMPLATES = [
  { name:"检查投稿邮箱与新收稿件", frequency:"daily" as const },
  { name:"完成AI初审与人工判断", frequency:"daily" as const },
  { name:"更新在研项目的下一步", frequency:"daily" as const },
  { name:"记录一条行业或爆款信号", frequency:"daily" as const },
  { name:"下班前整理日报", frequency:"daily" as const },
  { name:"更新爆款案例与选题库", frequency:"weekly" as const, weekdays:[5] },
  { name:"复盘在研项目和风险", frequency:"weekly" as const, weekdays:[5] },
  { name:"汇总收稿、审核与周报", frequency:"weekly" as const, weekdays:[5] },
]

export function RecurringManager({ compact = false }: { compact?: boolean }) {
  const { habits, completedIds, loading, error, addHabit, updateHabit, deleteHabit, toggleToday } = useHabits()
  const [name, setName] = useState("")
  const [frequency, setFrequency] = useState<HabitFrequency>("daily")
  const [weekdays, setWeekdays] = useState<number[]>([1])
  const [saving, setSaving] = useState(false)

  const add = async () => {
    if (!name.trim()) return
    setSaving(true)
    try { await addHabit({ name: name.trim(), frequency, weekdays: frequency === "weekly" ? weekdays : [] }); setName("") } finally { setSaving(false) }
  }

  const seed = async () => {
    setSaving(true)
    try { for (const item of TEMPLATES) await addHabit(item) } finally { setSaving(false) }
  }

  return <Card className={compact ? "border-border/70 bg-card/70" : undefined}>
    <CardHeader className={`flex-row items-center justify-between ${compact ? "px-4 pb-2 pt-4" : ""}`}><div><p className="section-kicker">Recurring rhythm</p><CardTitle className={compact ? "mt-0.5 text-base" : "mt-1 text-xl"}>固定事项</CardTitle>{compact && <p className="mt-0.5 text-[11px] text-muted-foreground">每日与每周重复节奏，不占主动任务排序。</p>}</div><CalendarClock className="h-4 w-4 text-primary" /></CardHeader>
    <CardContent className={compact ? "space-y-3 px-4 pb-4" : "space-y-5"}>
      <div className={`border border-border/70 bg-background/45 ${compact ? "rounded-xl p-3" : "rounded-2xl p-4"}`}>
        <div className="flex flex-col gap-3 md:flex-row">
          <Input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void add()} placeholder="添加固定事项，例如：检查投稿邮箱" className={`flex-1 ${compact ? "h-9" : ""}`} />
          <div className="flex gap-2"><Button size={compact ? "sm" : "default"} type="button" variant={frequency === "daily" ? "default" : "outline"} onClick={() => setFrequency("daily")}>每日</Button><Button size={compact ? "sm" : "default"} type="button" variant={frequency === "weekly" ? "default" : "outline"} onClick={() => setFrequency("weekly")}>每周</Button><Button size={compact ? "sm" : "default"} onClick={() => void add()} disabled={saving || !name.trim()}><Plus className="mr-1 h-4 w-4" />添加</Button></div>
        </div>
        {frequency === "weekly" && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-muted-foreground">执行日</span>{WEEKDAYS.map((day) => <button key={day.n} type="button" onClick={() => setWeekdays((current) => current.includes(day.n) ? current.filter((value) => value !== day.n) : [...current, day.n])} className={`h-8 w-8 rounded-full text-xs font-semibold transition-colors ${weekdays.includes(day.n) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{day.l}</button>)}</div>}
      </div>

      {error && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {loading ? <div className={`flex justify-center ${compact ? "py-4" : "py-8"}`}><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : habits.length === 0 ? <div className={`border border-dashed text-center ${compact ? "rounded-xl p-4" : "rounded-2xl p-7"}`}><p className="text-sm font-semibold">还没有固定事项</p><p className="mt-1 text-xs text-muted-foreground">可自行添加，或使用推荐模板。</p><Button size="sm" className="mt-3" variant="outline" onClick={() => void seed()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}使用推荐模板</Button></div> : <div className={compact ? "grid gap-2 md:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>{habits.map((habit) => <div key={habit.id} className={`group flex items-center gap-3 border border-border/70 ${compact ? "rounded-xl p-3" : "rounded-2xl p-3.5"} ${habit.active ? "bg-card" : "bg-muted/40 opacity-60"}`}><Checkbox checked={completedIds.has(habit.id)} disabled={!habit.active} onCheckedChange={() => void toggleToday(habit.id)} /><div className="min-w-0 flex-1"><p className={`truncate text-sm font-medium ${completedIds.has(habit.id) ? "line-through text-muted-foreground" : ""}`}>{habit.name}</p><div className="mt-1 flex flex-wrap gap-1.5"><Badge variant="secondary" className="text-[10px]">{habit.frequency === "daily" ? "每日" : `每周 ${habit.weekdays.map((day) => `周${day === 0 ? "日" : WEEKDAYS.find((item) => item.n === day)?.l}`).join("、")}`}</Badge>{!habit.active && <Badge variant="outline" className="text-[10px]">已暂停</Badge>}</div></div><Button variant="ghost" size="icon" className={compact ? "h-7 w-7" : ""} title={habit.active ? "暂停" : "启用"} onClick={() => void updateHabit(habit.id, { active: !habit.active })}>{habit.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" className={compact ? "h-7 w-7" : ""} title="删除" onClick={() => void deleteHabit(habit.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button></div>)}</div>}
    </CardContent>
  </Card>
}
