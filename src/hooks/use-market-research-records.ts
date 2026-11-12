"use client"
import {useCallback,useEffect,useState} from 'react'
import type {ResearchRecord} from '@/lib/market/research-records'
export async function researchRequest(method:string,body:unknown){
  const r=await fetch('/api/market-data/research-records',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)})
  const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||`保存失败（${r.status}），请重试`);return data as {record:ResearchRecord;existing?:boolean}
}
export function useResearchRecords(kind:'watch'|'archive'){
  const [records,setRecords]=useState<ResearchRecord[]>([]),[canEdit,setCanEdit]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true),[hasMore,setHasMore]=useState(false)
  const load=useCallback(async(offset=0)=>{
    setLoading(true);setError('')
    try{const r=await fetch(`/api/market-data/research-records?kind=${kind}&offset=${offset}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||'研究记录读取失败');setRecords(old=>offset?[...old,...data.records.filter((i:ResearchRecord)=>!old.some(o=>o.id===i.id))]:data.records);setCanEdit(data.canEdit);setHasMore(data.hasMore)}catch(e){setError(e instanceof Error?e.message:'读取失败')}finally{setLoading(false)}
  },[kind])
  useEffect(()=>{
    // Synchronize this mounted view with its server-side record directory.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  },[load])
  const replace=(record:ResearchRecord)=>setRecords(old=>old.some(r=>r.id===record.id)?old.map(r=>r.id===record.id?record:r):[record,...old])
  return {records,canEdit,error,loading,hasMore,load,replace}
}
