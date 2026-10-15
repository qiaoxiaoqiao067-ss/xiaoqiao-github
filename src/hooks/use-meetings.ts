"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export type Meeting = { id:string; user_id:string; project_id:string|null; title:string; meeting_type:string; meeting_date:string|null; source_url:string|null; transcript:string|null; summary:string|null; decisions:string|null; next_actions:string|null; created_at:string; updated_at:string }
export type MeetingInput = Omit<Meeting, "id"|"user_id"|"created_at"|"updated_at">

export function useMeetings() {
  const supabase = useMemo(() => createClient(), [])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchMeetings = useCallback(async () => {
    setLoading(true); const { data, error: fetchError } = await supabase.from("meetings").select("*").order("meeting_date", { ascending:false, nullsFirst:false })
    if (fetchError) setError(fetchError.message); else setMeetings((data || []) as Meeting[]); setLoading(false)
  }, [supabase])
  const addMeeting = useCallback(async (input: MeetingInput) => {
    const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error("请先登录")
    const { data, error: insertError } = await supabase.from("meetings").insert({ ...input, user_id:auth.user.id }).select().single(); if (insertError) throw insertError
    setMeetings((current) => [data as Meeting, ...current])
  }, [supabase])
  const updateMeeting = useCallback(async (id:string, updates:Partial<MeetingInput>) => {
    const { data, error:updateError } = await supabase.from("meetings").update({...updates, updated_at:new Date().toISOString()}).eq("id",id).select().single(); if (updateError) throw updateError
    setMeetings((current) => current.map((item) => item.id === id ? data as Meeting : item))
  }, [supabase])
  useEffect(() => { // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMeetings()
  }, [fetchMeetings])
  return { meetings, loading, error, addMeeting, updateMeeting, refetch:fetchMeetings }
}
