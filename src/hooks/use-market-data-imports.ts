"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { loadImportPages } from "@/lib/market/load-import-pages"
import { comparisonPeriod, requestedImports, analysisSnapshot } from "@/lib/market/import-scope"

export type MarketDataImport = {
  id: string; user_id: string; source_name: string; period_label: string | null; file_name: string
  row_count: number; columns: string[]; raw_rows: Record<string, unknown>[]; created_at: string; updated_at: string
  analysis_issues?: string[]
}
export type MarketDataImportInput = Pick<MarketDataImport, "source_name" | "file_name" | "row_count" | "columns" | "raw_rows"> & Partial<Pick<MarketDataImport, "period_label">>

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function friendlyDataError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  if (/failed to fetch|network|load failed|timeout|temporarily|503/i.test(message)) {
    return "数据连接出现波动，已自动重试但仍未恢复。请稍后点击重新连接。"
  }
  if (/jwt|session|auth|permission denied|42501|401|403/i.test(message)) {
    return "登录状态或数据权限需要刷新，请重新登录后再试。"
  }
  return message || "市场数据读取失败"
}

export function useMarketDataImports(period='', comparisonChoice='') {
  const [metadata,setMetadata]=useState<MarketDataImport[]>([])
  const [cache,setCache]=useState<Record<string,MarketDataImport>>({})
  const cacheRef=useRef(cache)
  const [metadataLoading,setMetadataLoading]=useState(true)
  const [metadataError,setMetadataError]=useState<string|null>(null)
  const [sampleError,setSampleError]=useState<{key:string;message:string}|null>(null)
  const [retry,setRetry]=useState(0)
  const metadataRequest=useRef(0)
  const refetch=useCallback(async()=>{
    const request=++metadataRequest.current
    setMetadataLoading(true);setMetadataError(null)
    try {
      const response=await fetch('/api/market-data/imports',{cache:'no-store',signal:AbortSignal.timeout(45000)})
      const payload=await response.json()
      if(!response.ok)throw new Error(payload.error||'市场文件目录读取失败')
      if(request===metadataRequest.current){setMetadata((payload.imports||[]).map((m:MarketDataImport)=>({...m,raw_rows:[]})));setRetry(n=>n+1)}
    }catch(e){if(request===metadataRequest.current)setMetadataError(friendlyDataError(e))}
    finally{if(request===metadataRequest.current)setMetadataLoading(false)}
  },[])
  const previous=comparisonPeriod(metadata,period,comparisonChoice)
  const requested=useMemo(()=>requestedImports(metadata,period,previous),[metadata,period,previous])
  const requestKey=requested.map(m=>`${m.id}:${m.updated_at}`).join('|')
  useEffect(()=>{
    const controller=new AbortController()
    const missing=requested.filter(m=>cacheRef.current[m.id]?.updated_at!==m.updated_at)
    if(!missing.length)return
    void (async()=>{
      for(let attempt=0;attempt<2;attempt++){
        try{
          const complete=await loadImportPages(missing,async(id,offset)=>{
            const response=await fetch(`/api/market-data/imports?id=${encodeURIComponent(id)}&offset=${offset}&mode=sample`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])})
            const payload=await response.json().catch(()=>null)
            if(!response.ok||!Array.isArray(payload?.rows))throw new Error(payload?.error||`榜单读取失败（HTTP ${response.status}）`)
            return payload
          })
          if(controller.signal.aborted)return
          const next={...cacheRef.current,...Object.fromEntries(complete.map(m=>[m.id,m]))}
          cacheRef.current=next;setCache(next);setSampleError(null);return
        }catch(e){
          if(controller.signal.aborted)return
          if(attempt===1)setSampleError({key:requestKey,message:friendlyDataError(e)})
          else await wait(400)
        }
      }
    })()
    return()=>controller.abort()
  },[requested,requestKey,retry])
  useEffect(()=>{
    // Initial synchronization with the remote directory; subsequent rows load independently.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch()
  },[refetch])
  const imports=useMemo(()=>metadata.map(m=>cache[m.id]?.updated_at===m.updated_at?{...m,...cache[m.id]}:m),[metadata,cache])
  const error=metadataError||(sampleError?.key===requestKey?sampleError.message:null)
  const loading=metadataLoading||(!error&&requested.some(m=>cache[m.id]?.updated_at!==m.updated_at))
  const addImport=useCallback(async(input:MarketDataImportInput)=>{
    const response=await fetch('/api/market-data/imports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})
    const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||'市场数据写入失败')
    const item=payload.import as MarketDataImport, snapshot=analysisSnapshot(item)
    const sampled={...item,raw_rows:snapshot.rows,analysis_issues:snapshot.issues}
    const next={...cacheRef.current,[item.id]:sampled};cacheRef.current=next;setCache(next)
    setMetadata(m=>[{...item,raw_rows:[]},...m]);return item
  },[])
  const deleteImport=useCallback(async(id:string)=>{
    const response=await fetch(`/api/market-data/imports?id=${encodeURIComponent(id)}`,{method:'DELETE'})
    const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||'市场数据删除失败')
    setMetadata(m=>m.filter(item=>item.id!==id))
    const next={...cacheRef.current};delete next[id];cacheRef.current=next;setCache(next)
  },[])
  return {imports,loading,metadataLoading,error,addImport,deleteImport,refetch}
}
