"use client"

import { useState } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
import { useTodos } from "@/hooks/use-todos"
import type { Todo } from "@/hooks/use-todos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/utils"
import {
  Plus,
  Trash2,
  Loader2,
  Calendar,
  CheckSquare,
  ListTodo,
  Sparkles,
  ChevronDown,
  Pencil,
  Save,
  X,
} from "lucide-react"
import { RecurringManager } from "@/components/tasks/recurring-manager"
import { AiTaskInbox } from "@/components/tasks/ai-task-inbox"
import { DataError } from "@/components/ui/data-error"

const PRIORITY_MAP: Record<number, { label: string; variant: "default" | "warning" | "destructive" }> = {
  0: { label: "P3 长期", variant: "default" },
  1: { label: "P2 本周", variant: "default" },
  2: { label: "P1 近期", variant: "warning" },
  3: { label: "P0 立即", variant: "destructive" },
}

export default function TodosPage() {
  const { todos, loading, error, addTodo, toggleTodo, updateTodo, deleteTodo, refetch } = useTodos()
  const [newTitle, setNewTitle] = useState("")
  const [newPriority, setNewPriority] = useState(0)
  const [adding, setAdding] = useState(false)
  const [quickPanel, setQuickPanel] = useState<"ai" | "new" | null>(null)

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    setAdding(true)
    try {
      await addTodo({ title: newTitle.trim(), priority: newPriority })
      setNewTitle("")
      setNewPriority(0)
    } catch (e: unknown) {
      console.error(e)
    } finally {
      setAdding(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd()
  }

  const activeTodos = todos.filter((t) => !t.completed && t.status !== "completed" && t.status !== "cancelled")
  const completedTodos = todos.filter((t) => t.completed || t.status === "completed")
  const waitingTodos = activeTodos.filter((todo) => todo.status === "waiting" || todo.status === "blocked")
  const actionableTodos = activeTodos.filter((todo) => todo.status !== "waiting" && todo.status !== "blocked")
  const sortedActionable = [...actionableTodos].sort((a, b) => b.priority - a.priority || ((a.due_date || "9999").localeCompare(b.due_date || "9999")))
  const todayKey = new Date().toISOString().slice(0, 10)
  const todayPool = sortedActionable.filter((todo) => todo.priority >= 2 || Boolean(todo.due_date && todo.due_date.slice(0, 10) <= todayKey))
  const nowTodos = todayPool.slice(0, 3)
  const todayTodos = todayPool.slice(3)
  const weekTodos = sortedActionable.filter((todo) => !todayPool.some((item) => item.id === todo.id) && (todo.priority >= 1 || todo.due_date))
  const backlogTodos = sortedActionable.filter((todo) => !nowTodos.some((item) => item.id === todo.id) && !todayTodos.some((item) => item.id === todo.id) && !weekTodos.some((item) => item.id === todo.id))

  const changeTaskStatus = async (id: string, status: Todo["status"]) => {
    await updateTodo(id, { status })
  }

  return (
    <AppLayout>
      <div className="space-y-3">
        <PageHero
          compact
          eyebrow="任务 · 固定事项 · 工作总结"
          title="任务中心"
          description={`${activeTodos.length} 项待完成 · ${completedTodos.length} 项已完成 · 集中管理任务、等待事项与固定节奏`}
          action={<div className="flex items-center gap-1.5"><Button size="sm" variant="outline" className="h-8 rounded-full border-white/25 bg-white/10 px-3 text-xs text-white hover:bg-white/20 hover:text-white" aria-expanded={quickPanel === "ai"} onClick={() => setQuickPanel((panel) => panel === "ai" ? null : "ai")}><Sparkles className="h-3.5 w-3.5" />AI 助手<ChevronDown className={`h-3 w-3 transition-transform ${quickPanel === "ai" ? "rotate-180" : ""}`} /></Button><Button size="sm" variant="outline" className="h-8 rounded-full border-white/25 bg-white/10 px-3 text-xs text-white hover:bg-white/20 hover:text-white" aria-expanded={quickPanel === "new"} onClick={() => setQuickPanel((panel) => panel === "new" ? null : "new")}><Plus className="h-3.5 w-3.5" />新任务<ChevronDown className={`h-3 w-3 transition-transform ${quickPanel === "new" ? "rotate-180" : ""}`} /></Button><span className="ml-1 hidden h-8 w-8 items-center justify-center rounded-full bg-[#c9f45a] text-[#102a21] sm:inline-flex"><ListTodo className="h-4 w-4" /></span></div>}
        />

        {quickPanel === "ai" && <AiTaskInbox compact onApplied={() => void refetch()} />}
        {quickPanel === "new" && (
          <Card><CardContent className="flex flex-col gap-2 p-3 sm:flex-row">
            <Input autoFocus placeholder="输入任务，按 Enter 添加" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={handleKeyDown} disabled={adding} className="h-9 flex-1" />
            <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setNewPriority((p) => (p + 1) % 4)} className="h-9 flex-1 text-xs sm:flex-none">{PRIORITY_MAP[newPriority].label}</Button><Button size="sm" className="h-9 flex-1 sm:flex-none" onClick={handleAdd} disabled={adding || !newTitle.trim()}>{adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}添加</Button></div>
          </CardContent></Card>
        )}

        {/* Error */}
        {error && <DataError error={error} onRetry={refetch} />}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!loading && <>
          <TaskSection featured title="🔥 现在做什么" description="从今日任务中选出的最高优先级 3 件。" todos={nowTodos} onToggle={toggleTodo} onStatus={changeTaskStatus} onEdit={updateTodo} onDelete={deleteTodo} empty="暂时没有必须立刻处理的事项。" />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TaskSection dense title="今日稍后" description="今日任务中除 Top 3 外的事项" todos={todayTodos} onToggle={toggleTodo} onStatus={changeTaskStatus} onEdit={updateTodo} onDelete={deleteTodo} empty="今天没有其他任务。" />
            <TaskSection dense title="本周推进" description="持续推进的工作" todos={weekTodos} onToggle={toggleTodo} onStatus={changeTaskStatus} onEdit={updateTodo} onDelete={deleteTodo} empty="暂无本周事项。" />
            <TaskSection dense title="⏳ 等待 / 跟进" description="等待条件满足" todos={waitingTodos} onToggle={toggleTodo} onStatus={changeTaskStatus} onEdit={updateTodo} onDelete={deleteTodo} empty="暂无等待事项。" />
            <TaskSection dense title="长期 / Backlog" description="长期建设与储备" todos={backlogTodos} onToggle={toggleTodo} onStatus={changeTaskStatus} onEdit={updateTodo} onDelete={deleteTodo} empty="暂无长期事项。" />
          </div>
        </>}

        {/* Completed Todos */}
        {!loading && completedTodos.length > 0 && (
          <details className="rounded-2xl border bg-card/70 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">已完成 · {completedTodos.length}</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{completedTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={() => toggleTodo(todo.id)}
                onStatus={(status) => void changeTaskStatus(todo.id, status)}
                onDelete={() => deleteTodo(todo.id)}
                dense
              />
            ))}</div>
          </details>
        )}

        {/* Empty State */}
        {!loading && todos.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CheckSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">还没有任务</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                在上方输入框添加你的第一个任务
              </p>
            </CardContent>
          </Card>
        )}

        <RecurringManager compact />
      </div>
    </AppLayout>
  )
}

function TodoItem({
  todo,
  onToggle,
  onDelete,
  onStatus,
  onEdit,
  dense = false,
}: {
  todo: Todo
  onToggle: () => void
  onDelete: () => void
  onStatus?: (status: Todo["status"]) => void
  onEdit?: (updates: { title: string; description: string; priority: number; due_date: string | null; status: Todo["status"] }) => Promise<unknown>
  dense?: boolean
}) {
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({ title: todo.title, description: todo.description || "", priority: todo.priority, due_date: todo.due_date?.slice(0, 10) || "", status: todo.status || "todo" })
  const priority = PRIORITY_MAP[todo.priority] || PRIORITY_MAP[0]

  const saveEdit = async () => {
    if (!onEdit || !draft.title.trim() || saving) return
    setSaving(true)
    try {
      await onEdit({ ...draft, title: draft.title.trim(), description: draft.description.trim(), due_date: draft.due_date || null, status: draft.status as Todo["status"] })
      setEditing(false)
    } finally { setSaving(false) }
  }

  return (
    <Card
      className={`group transition-all hover:shadow-sm ${
        todo.completed ? "opacity-60 bg-muted/30" : ""
      }`}
    >
      <CardContent className={dense ? "px-2.5 py-2" : "px-4 py-3"}>
        <div className={`flex items-center ${dense ? "gap-2" : "gap-3"}`}>
        <Checkbox
          checked={todo.completed}
          onCheckedChange={onToggle}
          className="shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium truncate ${
              todo.completed ? "line-through text-muted-foreground" : ""
            }`}
          >
            {todo.title}
          </p>
          {todo.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {todo.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <Badge
              variant={priority.variant}
              className="text-[10px] px-1.5 py-0"
            >
              {priority.label}
            </Badge>
            {todo.due_date && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Calendar className="h-3 w-3" />
                {formatDate(todo.due_date)}
              </span>
            )}
            {onStatus && <select value={todo.completed ? "completed" : (todo.status || "todo")} onChange={(event) => onStatus(event.target.value as Todo["status"])} className="h-6 rounded-md border bg-background px-1.5 text-[10px] text-muted-foreground"><option value="todo">待处理</option><option value="in_progress">进行中</option><option value="waiting">等待</option><option value="blocked">受阻</option><option value="completed">已完成</option></select>}
          </div>
        </div>
        {onEdit && !todo.completed && <Button variant="ghost" size="icon" aria-label={`编辑${todo.title}`} className="h-7 w-7 shrink-0 opacity-60 transition-opacity hover:opacity-100" onClick={() => setEditing((value) => !value)}><Pencil className="h-3.5 w-3.5" /></Button>}
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-8 w-8"
          onClick={() => {
            setDeleting(true)
            onDelete()
          }}
          disabled={deleting}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </Button>
        </div>
        {editing && (
          <div className="mt-2 space-y-2 border-t pt-2">
            <Input value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} className="h-8 text-xs" aria-label="任务标题" />
            <Input value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} className="h-8 text-xs" placeholder="补充任务说明或下一步" aria-label="任务说明" />
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              <select value={draft.priority} onChange={(event) => setDraft((value) => ({ ...value, priority: Number(event.target.value) }))} className="h-8 rounded-md border bg-background px-2 text-xs" aria-label="任务优先级"><option value={3}>P0 立即</option><option value={2}>P1 近期</option><option value={1}>P2 本周</option><option value={0}>P3 长期</option></select>
              <select value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value as Todo["status"] }))} className="h-8 rounded-md border bg-background px-2 text-xs" aria-label="任务状态"><option value="todo">待处理</option><option value="in_progress">进行中</option><option value="waiting">等待</option><option value="blocked">受阻</option></select>
              <Input type="date" value={draft.due_date} onChange={(event) => setDraft((value) => ({ ...value, due_date: event.target.value }))} className="h-8 px-2 text-xs" aria-label="截止日期" />
            </div>
            <div className="flex justify-end gap-1.5"><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" />取消</Button><Button size="sm" className="h-7 px-2 text-xs" disabled={saving || !draft.title.trim()} onClick={() => void saveEdit()}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}保存</Button></div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TaskSection({ title, description, todos, onToggle, onStatus, onEdit, onDelete, empty, dense = false, featured = false }: { title: string; description: string; todos: Todo[]; onToggle: (id: string) => void; onStatus: (id: string, status: Todo["status"]) => Promise<void>; onEdit: (id: string, updates: { title: string; description: string; priority: number; due_date: string | null; status: Todo["status"] }) => Promise<Todo>; onDelete: (id: string) => void; empty: string; dense?: boolean; featured?: boolean }) {
  return <section className={`rounded-2xl border bg-card/80 ${dense ? "p-3" : "p-3.5"} ${featured ? "border-[#c9f45a]/70 shadow-[0_12px_30px_rgba(18,59,45,.08)]" : ""}`}><div className="mb-2 flex items-end justify-between gap-2"><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p></div><span className="text-xs font-semibold text-muted-foreground">{todos.length}</span></div><div className={dense ? "space-y-1.5" : "grid gap-2 lg:grid-cols-3"}>{todos.length ? todos.map((todo) => <TodoItem dense={dense || featured} key={todo.id} todo={todo} onToggle={() => onToggle(todo.id)} onStatus={(status) => void onStatus(todo.id, status)} onEdit={(updates) => onEdit(todo.id, updates)} onDelete={() => onDelete(todo.id)} />) : <p className="rounded-xl border border-dashed px-3 py-3 text-xs text-muted-foreground">{empty}</p>}</div></section>
}
