"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export const KNOWLEDGE_TYPES = ["AI短剧学习", "爆款拆解", "责编经验", "SOP", "项目复盘"] as const
export type KnowledgeItem = { id:string; user_id:string; title:string; item_type:string; category:string|null; content:string|null; source_url:string|null; created_at:string; updated_at:string }
export function useKnowledgeItems(){const supabase=useMemo(()=>createClient(),[]);const [items,setItems]=useState<KnowledgeItem[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const fetchItems=useCallback(async()=>{setLoading(true);const {data,error:e}=await supabase.from("knowledge_items").select("*").order("updated_at",{ascending:false});if(e)setError(e.message);else setItems((data||[]) as KnowledgeItem[]);setLoading(false)},[supabase]);const addItem=useCallback(async(input:Partial<KnowledgeItem>&{title:string})=>{const {data:a}=await supabase.auth.getUser();if(!a.user)throw new Error("请先登录");const {data,error:e}=await supabase.from("knowledge_items").insert({...input,user_id:a.user.id}).select().single();if(e)throw e;setItems((current)=>[data as KnowledgeItem,...current])},[supabase]);const deleteItem=useCallback(async(id:string)=>{const {error:e}=await supabase.from("knowledge_items").delete().eq("id",id);if(e)throw e;setItems((current)=>current.filter((item)=>item.id!==id))},[supabase]);useEffect(()=>{ // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchItems()
  },[fetchItems]);return{items,loading,error,addItem,deleteItem}}
