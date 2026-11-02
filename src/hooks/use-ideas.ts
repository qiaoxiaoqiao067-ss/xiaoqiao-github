"use client"

import { useCallback, useEffect, useState } from "react"

export const IDEA_STATUSES = ["待评估", "待推进", "推进中", "暂缓", "不采用"] as const
export type Idea = { id:string; user_id:string; title:string; source:string|null; market:string|null; genre:string|null; status:string; notes:string|null; created_at:string; updated_at:string }
const LEGACY_STATUS_MAP: Record<string, string> = { "灵感":"待评估", "待调研":"待评估", "待选题会":"待推进", "已通过":"待推进", "已立项":"推进中", "已淘汰":"不采用" }
const normalizeIdea = (idea: Idea): Idea => ({ ...idea, status: LEGACY_STATUS_MAP[idea.status] || idea.status })
export function useIdeas() {
  const [ideas,setIdeas]=useState<Idea[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null)
  const fetchIdeas=useCallback(async()=>{setLoading(true);const response=await fetch("/api/ideas",{cache:"no-store"});const payload=await response.json().catch(()=>({}));if(!response.ok)setError(payload.error||"选题读取失败");else setIdeas(((payload.ideas||[]) as Idea[]).map(normalizeIdea));setLoading(false)},[])
  const addIdea=useCallback(async(input:Partial<Idea>&{title:string})=>{const response=await fetch("/api/ideas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"选题创建失败");setIdeas((current)=>[normalizeIdea(payload.idea as Idea),...current])},[])
  const updateIdea=useCallback(async(id:string,updates:Partial<Idea>)=>{const response=await fetch("/api/ideas",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...updates})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"选题更新失败");setIdeas((current)=>current.map((item)=>item.id===id?normalizeIdea(payload.idea as Idea):item))},[])
  const deleteIdea=useCallback(async(id:string)=>{const response=await fetch(`/api/ideas?id=${encodeURIComponent(id)}`,{method:"DELETE"});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"选题删除失败");setIdeas((current)=>current.filter((item)=>item.id!==id))},[])
  useEffect(()=>{ // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchIdeas()
  },[fetchIdeas])
  return {ideas,loading,error,addIdea,updateIdea,deleteIdea,refetch:fetchIdeas}
}
