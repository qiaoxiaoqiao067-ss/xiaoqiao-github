"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"

export type Todo = {
  id: string
  user_id: string
  title: string
  description: string | null
  completed: boolean
  priority: number
  due_date: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
  completed_at: string | null
  status: "todo" | "in_progress" | "waiting" | "blocked" | "completed" | "cancelled"
  project_id: string | null
  category: string | null
  next_action: string | null
  waiting_for: string | null
  dependency: string | null
  ai_score: number | null
  ai_reason: string | null
  source: string | null
  manual_override: boolean
  follow_up_date: string | null
}

export type NewTodo = {
  title: string
  description?: string
  priority?: number
  due_date?: string | null
  tags?: string[]
  status?: Todo["status"]
  project_id?: string | null
  category?: string | null
  next_action?: string | null
  waiting_for?: string | null
  dependency?: string | null
  ai_score?: number | null
  ai_reason?: string | null
  source?: string
  manual_override?: boolean
  follow_up_date?: string | null
}

function legacyTags(todo: NewTodo, existing: string[] = []) {
  const clean = existing.filter((tag) => !/^(status|category|next_action|waiting_for|follow_up_date):/.test(tag))
  return [
    ...clean,
    todo.status && `status:${todo.status}`,
    todo.category && `category:${todo.category}`,
    todo.next_action && `next_action:${todo.next_action}`,
    todo.waiting_for && `waiting_for:${todo.waiting_for}`,
    todo.follow_up_date && `follow_up_date:${todo.follow_up_date}`,
  ].filter((item): item is string => Boolean(item))
}

function tagValue(tags: string[] | null | undefined, key: string) {
  return tags?.find((tag) => tag.startsWith(`${key}:`))?.slice(key.length + 1) || null
}

function normalizeTodo(row: Record<string, unknown>): Todo {
  const tags = Array.isArray(row.tags) ? row.tags.filter((item): item is string => typeof item === "string") : []
  const status = (row.status || tagValue(tags, "status") || (row.completed ? "completed" : "todo")) as Todo["status"]
  return {
    ...row,
    tags,
    status,
    completed: Boolean(row.completed || status === "completed"),
    category: String(row.category || tagValue(tags, "category") || "") || null,
    next_action: String(row.next_action || tagValue(tags, "next_action") || "") || null,
    waiting_for: String(row.waiting_for || tagValue(tags, "waiting_for") || "") || null,
    follow_up_date: String(row.follow_up_date || tagValue(tags, "follow_up_date") || "") || null,
    project_id: (row.project_id as string | null) || null,
    dependency: (row.dependency as string | null) || null,
    ai_score: (row.ai_score as number | null) || null,
    ai_reason: (row.ai_reason as string | null) || null,
    source: String(row.source || "manual"),
    manual_override: Boolean(row.manual_override),
  } as Todo
}

function isLegacySchemaError(error: { code?: string; message?: string }) {
  return error.code === "PGRST204" || error.code === "42703" || /column .* does not exist|schema cache/i.test(error.message || "")
}

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const fetchTodos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from("todos")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setTodos((data || []).map((row) => normalizeTodo(row as Record<string, unknown>)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "任务加载失败")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const addTodo = useCallback(async (todo: NewTodo) => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) throw new Error("Not authenticated")

    const { data, error } = await supabase
      .from("todos")
      .insert({
        user_id: user.user.id,
        title: todo.title,
        description: todo.description || null,
        priority: todo.priority || 0,
        due_date: todo.due_date || null,
        tags: todo.tags || [],
        status: todo.status || "todo",
        project_id: todo.project_id || null,
        category: todo.category || null,
        next_action: todo.next_action || null,
        waiting_for: todo.waiting_for || null,
        dependency: todo.dependency || null,
        ai_score: todo.ai_score || null,
        ai_reason: todo.ai_reason || null,
        source: todo.source || "manual",
        manual_override: todo.manual_override || false,
        follow_up_date: todo.follow_up_date || null,
      })
      .select()
      .single()

    if (error && isLegacySchemaError(error)) {
      const fallback = await supabase.from("todos").insert({
        user_id: user.user.id,
        title: todo.title,
        description: todo.description || todo.next_action || null,
        priority: todo.priority || 0,
        due_date: todo.due_date || null,
        tags: legacyTags(todo, todo.tags),
      }).select().single()
      if (fallback.error) throw fallback.error
      const normalized = normalizeTodo(fallback.data as Record<string, unknown>)
      setTodos((prev) => [normalized, ...prev])
      return normalized
    }
    if (error) throw error
    const normalized = normalizeTodo(data as Record<string, unknown>)
    setTodos((prev) => [normalized, ...prev])
    return normalized
  }, [supabase])

  const toggleTodo = useCallback(async (id: string) => {
    const todo = todos.find((t) => t.id === id)
    if (!todo) return

    const updates: Pick<Todo, "completed" | "completed_at" | "status" | "updated_at"> = {
      completed: !todo.completed,
      completed_at: !todo.completed ? new Date().toISOString() : null,
      status: !todo.completed ? "completed" : "todo",
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from("todos")
      .update(updates)
      .eq("id", id)

    if (error) throw error
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, ...updates, completed_at: updates.completed_at }
          : t
      )
    )
  }, [supabase, todos])

  const updateTodo = useCallback(
    async (id: string, updates: Partial<NewTodo>) => {
      const current = todos.find((todo) => todo.id === id)
      const completionUpdates = updates.status !== undefined
        ? {
            completed: updates.status === "completed",
            completed_at: updates.status === "completed" ? (current?.completed_at || new Date().toISOString()) : null,
          }
        : {}
      const { data, error } = await supabase
        .from("todos")
      .update({ ...updates, ...completionUpdates, manual_override: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()

      if (error && isLegacySchemaError(error)) {
        const fallback = await supabase.from("todos").update({
          ...(updates.title !== undefined ? { title: updates.title } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
          ...(updates.due_date !== undefined ? { due_date: updates.due_date } : {}),
          ...completionUpdates,
          tags: legacyTags({ ...current, ...updates } as NewTodo, current?.tags || []),
          updated_at: new Date().toISOString(),
        }).eq("id", id).select().single()
        if (fallback.error) throw fallback.error
        const normalized = normalizeTodo(fallback.data as Record<string, unknown>)
        setTodos((prev) => prev.map((todo) => todo.id === id ? normalized : todo))
        return normalized
      }
      if (error) throw error
      const normalized = normalizeTodo(data as Record<string, unknown>)
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? normalized : t))
      )
      return normalized
    },
    [supabase, todos]
  )

  const deleteTodo = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("todos")
      .delete()
      .eq("id", id)

    if (error) throw error
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }, [supabase])

  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTodos()
  }, [fetchTodos])

  return {
    todos,
    loading,
    error,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    refetch: fetchTodos,
  }
}
