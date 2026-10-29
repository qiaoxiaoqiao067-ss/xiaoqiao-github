"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export const IDEA_STATUSES = ["待评估", "待推进", "推进中", "暂缓", "不采用"] as const
export type Idea = { id:string; user_id:string; title:string; source:string|null; market:string|null; genre:string|null; status:string; notes:string|null; created_at:string; updated_at:string }
const LEGACY_STATUS_MAP: Record<string, string> = { "灵感":"待评估", "待调研":"待评估", "待选题会":"待推进", "已通过":"待推进", "已立项":"推进中", "已淘汰":"不采用" }
const normalizeIdea = (idea: Idea): Idea => ({ ...idea, status: LEGACY_STATUS_MAP[idea.status] || idea.status })
export function useIdeas() {
  const supabase = useMemo(() => createClient(), []); const [ideas,setIdeas]=useState<Idea[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null)
  const fetchIdeas=useCallback(async()=>{setLoading(true);const response=await fetch("/api/ideas",{cache:"no-store"});const payload=await response.json().catch(()=>({}));if(!response.ok)setError(payload.error||"选题读取失败");else setIdeas(((payload.ideas||[]) as Idea[]).map(normalizeIdea));setLoading(false)},[supabase])
  const addIdea=useCallback(async(input:Partial<Idea>&{title:string})=>{const {data:a}=await supabase.auth.getUser();if(!a.user)throw new Error("请先登录");const {data,error:e}=await supabase.from("ideas").insert({...input,user_id:a.user.id}).select().single();if(e)throw e;setIdeas((current)=>[normalizeIdea(data as Idea),...current])},[supabase])
  const updateIdea=useCallback(async(id:string,updates:Partial<Idea>)=>{const {data,error:e}=await supabase.from("ideas").update({...updates,updated_at:new Date().toISOString()}).eq("id",id).select().single();if(e)throw e;setIdeas((current)=>current.map((item)=>item.id===id?normalizeIdea(data as Idea):item))},[supabase])
  const deleteIdea=useCallback(async(id:string)=>{const {error:e}=await supabase.from("ideas").delete().eq("id",id);if(e)throw e;setIdeas((current)=>current.filter((item)=>item.id!==id))},[supabase])
  useEffect(()=>{ // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchIdeas()
  },[fetchIdeas])
  return {ideas,loading,error,addIdea,updateIdea,deleteIdea,refetch:fetchIdeas}
}
