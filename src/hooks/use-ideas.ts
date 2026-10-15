"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export const IDEA_STATUSES = ["灵感", "待调研", "待选题会", "已通过", "已立项", "暂缓", "已淘汰"] as const
export type Idea = { id:string; user_id:string; title:string; source:string|null; market:string|null; genre:string|null; status:string; notes:string|null; created_at:string; updated_at:string }
export function useIdeas() {
  const supabase = useMemo(() => createClient(), []); const [ideas,setIdeas]=useState<Idea[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null)
  const fetchIdeas=useCallback(async()=>{setLoading(true);const {data,error:e}=await supabase.from("ideas").select("*").order("updated_at",{ascending:false});if(e)setError(e.message);else setIdeas((data||[]) as Idea[]);setLoading(false)},[supabase])
  const addIdea=useCallback(async(input:Partial<Idea>&{title:string})=>{const {data:a}=await supabase.auth.getUser();if(!a.user)throw new Error("请先登录");const {data,error:e}=await supabase.from("ideas").insert({...input,user_id:a.user.id}).select().single();if(e)throw e;setIdeas((current)=>[data as Idea,...current])},[supabase])
  const updateIdea=useCallback(async(id:string,updates:Partial<Idea>)=>{const {data,error:e}=await supabase.from("ideas").update({...updates,updated_at:new Date().toISOString()}).eq("id",id).select().single();if(e)throw e;setIdeas((current)=>current.map((item)=>item.id===id?data as Idea:item))},[supabase])
  const deleteIdea=useCallback(async(id:string)=>{const {error:e}=await supabase.from("ideas").delete().eq("id",id);if(e)throw e;setIdeas((current)=>current.filter((item)=>item.id!==id))},[supabase])
  useEffect(()=>{ // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchIdeas()
  },[fetchIdeas])
  return {ideas,loading,error,addIdea,updateIdea,deleteIdea}
}
