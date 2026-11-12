"use client"
import {useCallback,useEffect,useState} from 'react'
import type {EvidenceRecord,EvidenceInput} from '@/lib/market/evidence'
export async function saveEvidence(id:string,evidence:EvidenceInput,confirmVerified:boolean,updated_at?:string){
 const r=await fetch('/api/market-data/evidence',{method:updated_at?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,evidence,confirmVerified,updated_at}),signal:AbortSignal.timeout(30000)})
 const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||'证据保存失败');return data.record as EvidenceRecord
}
export function useMarketEvidence(){
 const [records,setRecords]=useState<EvidenceRecord[]>([]),[canEdit,setCanEdit]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[hasMore,setHasMore]=useState(false)
 const load=useCallback(async(offset=0)=>{setLoading(true);setError('');try{const r=await fetch(`/api/market-data/evidence?offset=${offset}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||'证据读取失败');setRecords(old=>offset?[...old,...data.records.filter((i:EvidenceRecord)=>!old.some(o=>o.id===i.id))]:data.records);setCanEdit(data.canEdit);setHasMore(data.hasMore)}catch(e){setError((e as Error).message)}finally{setLoading(false)}},[])
 useEffect(()=>{
  // Read remote evidence once this view is mounted; never reset an open editor.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void load()
 },[load])
 const replace=(r:EvidenceRecord)=>setRecords(old=>old.some(o=>o.id===r.id)?old.map(o=>o.id===r.id?r:o):[r,...old])
 return {records,canEdit,loading,error,hasMore,load,replace}
}
