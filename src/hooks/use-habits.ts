"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export type HabitFrequency = "daily" | "weekly"
export type Habit = {
  id: string
  user_id: string
  name: string
  frequency: HabitFrequency
  weekdays: number[]
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type HabitInput = { name: string; frequency: HabitFrequency; weekdays?: number[] }

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

export function useHabits() {
  const supabase = useMemo(() => createClient(), [])
  const [habits, setHabits] = useState<Habit[]>([])
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHabits = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: habitData, error: habitError }, { data: logData, error: logError }] = await Promise.all([
        supabase.from("habits").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("habit_logs").select("habit_id,completed").eq("date", todayKey()),
      ])
      if (habitError) throw habitError
      if (logError) throw logError
      setHabits((habitData || []) as Habit[])
      setCompletedIds(new Set((logData || []).filter((item) => item.completed).map((item) => item.habit_id)))
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "固定事项加载失败")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const addHabit = useCallback(async (input: HabitInput) => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error("请先登录")
    const { data, error: insertError } = await supabase.from("habits").insert({
      user_id: auth.user.id,
      name: input.name,
      frequency: input.frequency,
      weekdays: input.weekdays || [],
      sort_order: habits.length,
    }).select().single()
    if (insertError) throw insertError
    setHabits((current) => [...current, data as Habit])
  }, [habits.length, supabase])

  const updateHabit = useCallback(async (id: string, updates: Partial<Pick<Habit, "name" | "frequency" | "weekdays" | "active" | "sort_order">>) => {
    const { data, error: updateError } = await supabase.from("habits").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single()
    if (updateError) throw updateError
    setHabits((current) => current.map((habit) => habit.id === id ? data as Habit : habit))
  }, [supabase])

  const deleteHabit = useCallback(async (id: string) => {
    const { error: logError } = await supabase.from("habit_logs").delete().eq("habit_id", id)
    if (logError) throw logError
    const { error: deleteError } = await supabase.from("habits").delete().eq("id", id)
    if (deleteError) throw deleteError
    setHabits((current) => current.filter((habit) => habit.id !== id))
  }, [supabase])

  const toggleToday = useCallback(async (habitId: string) => {
    const completed = !completedIds.has(habitId)
    const { error: upsertError } = await supabase.from("habit_logs").upsert({ habit_id: habitId, date: todayKey(), completed }, { onConflict: "habit_id,date" })
    if (upsertError) throw upsertError
    setCompletedIds((current) => {
      const next = new Set(current)
      if (completed) next.add(habitId)
      else next.delete(habitId)
      return next
    })
  }, [completedIds, supabase])

  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchHabits()
  }, [fetchHabits])

  return { habits, completedIds, loading, error, addHabit, updateHabit, deleteHabit, toggleToday, refetch: fetchHabits }
}
