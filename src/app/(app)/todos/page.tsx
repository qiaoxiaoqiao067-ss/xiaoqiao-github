"use client"

import { useState } from "react"
import { AppLayout } from "@/components/layout/app-layout"
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
  AlertCircle,
  CheckSquare,
  ListTodo,
} from "lucide-react"

const PRIORITY_MAP: Record<number, { label: string; variant: "default" | "warning" | "destructive" }> = {
  0: { label: "普通", variant: "default" },
  1: { label: "重要", variant: "warning" },
  2: { label: "紧急", variant: "destructive" },
}

export default function TodosPage() {
  const { todos, loading, error, addTodo, toggleTodo, deleteTodo } = useTodos()
  const [newTitle, setNewTitle] = useState("")
  const [newPriority, setNewPriority] = useState(0)
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    setAdding(true)
    try {
      await addTodo({ title: newTitle.trim(), priority: newPriority })
      setNewTitle("")
      setNewPriority(0)
    } catch (e: any) {
      console.error(e)
    } finally {
      setAdding(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd()
  }

  const activeTodos = todos.filter((t) => !t.completed)
  const completedTodos = todos.filter((t) => t.completed)

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ListTodo className="h-6 w-6 text-emerald-500" />
              任务中心
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {activeTodos.length} 项待完成 · {completedTodos.length} 项已完成
            </p>
          </div>
        </div>

        {/* Add Todo */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Input
                placeholder="添加新任务... 按 Enter 确认"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={adding}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNewPriority((p) => (p + 1) % 3)}
                className="shrink-0"
              >
                {PRIORITY_MAP[newPriority].label}
              </Button>
              <Button onClick={handleAdd} disabled={adding || !newTitle.trim()}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                添加
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Active Todos */}
        {!loading && activeTodos.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">待完成</h2>
            {activeTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={() => toggleTodo(todo.id)}
                onDelete={() => deleteTodo(todo.id)}
              />
            ))}
          </div>
        )}

        {/* Completed Todos */}
        {!loading && completedTodos.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">已完成</h2>
            {completedTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={() => toggleTodo(todo.id)}
                onDelete={() => deleteTodo(todo.id)}
              />
            ))}
          </div>
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
      </div>
    </AppLayout>
  )
}

function TodoItem({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo
  onToggle: () => void
  onDelete: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const priority = PRIORITY_MAP[todo.priority] || PRIORITY_MAP[0]

  return (
    <Card
      className={`group transition-all hover:shadow-sm ${
        todo.completed ? "opacity-60 bg-muted/30" : ""
      }`}
    >
      <CardContent className="flex items-center gap-3 py-4 px-4">
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
          </div>
        </div>
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
      </CardContent>
    </Card>
  )
}
