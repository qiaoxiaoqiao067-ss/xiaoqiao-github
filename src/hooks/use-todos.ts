"use client"

import { useState, useCallback, useEffect } from "react"
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
}

export type NewTodo = {
  title: string
  description?: string
  priority?: number
  due_date?: string | null
  tags?: string[]
}

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchTodos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from("todos")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setTodos(data || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

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
      })
      .select()
      .single()

    if (error) throw error
    setTodos((prev) => [data, ...prev])
    return data
  }, [])

  const toggleTodo = useCallback(async (id: string) => {
    const todo = todos.find((t) => t.id === id)
    if (!todo) return

    const updates = {
      completed: !todo.completed,
      completed_at: !todo.completed ? new Date().toISOString() : null,
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
  }, [todos])

  const updateTodo = useCallback(
    async (id: string, updates: Partial<NewTodo>) => {
      const { data, error } = await supabase
        .from("todos")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()

      if (error) throw error
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...data } : t))
      )
      return data
    },
    []
  )

  const deleteTodo = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("todos")
      .delete()
      .eq("id", id)

    if (error) throw error
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    fetchTodos()
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
