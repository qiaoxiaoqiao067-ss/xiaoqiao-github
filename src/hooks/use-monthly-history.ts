"use client"
import {useEffect,useMemo,useRef,useState} from 'react'
import type {MarketDataImport} from './use-market-data-imports'
import {historyRequests, monthlySeries} from '@/lib/market/monthly-history'
import {loadImportPages} from '@/lib/market/load-import-pages'

export function useMonthlyHistory(metadata:MarketDataImport[],months:string[],board:string){
  const cache=useRef(new Map<string,MarketDataImport>())
  const requested=useMemo(()=>historyRequests(metadata,months,board),[metadata,months,board])
  const key=JSON.stringify([board,months,requested.map(i=>[i.id,i.updated_at])])
  const [retry,setRetry]=useState(0)
  const [result,setResult]=useState<{key:string;items:MarketDataImport[];error:string|null}>({key:'',items:[],error:null})
  useEffect(()=>{
    const controller=new AbortController()
    void(async()=>{
      try{
        const req=requested
        const missing=req.filter(i=>!cache.current.has(`${i.id}:${i.updated_at}`))
        const loaded=await loadImportPages(missing,async(id,offset)=>{
          const response=await fetch(`/api/market-data/imports?id=${id}&offset=${offset}&mode=sample`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])})
          const payload=await response.json().catch(()=>null)
          if(!response.ok||!Array.isArray(payload?.rows))throw new Error(payload?.error||`月份读取失败（${response.status}）`)
          return payload
        })
        if(controller.signal.aborted)return
        loaded.forEach(i=>cache.current.set(`${i.id}:${i.updated_at}`,i))
        setResult({key,items:req.map(i=>cache.current.get(`${i.id}:${i.updated_at}`)!),error:null})
      }catch(e){if(!controller.signal.aborted)setResult({key,items:[],error:e instanceof Error?e.message:'连续月份加载失败'})}
    })()
    return()=>controller.abort()
  },[key,retry,requested])
  const series=useMemo(()=>monthlySeries(result.key===key?result.items:[],months,board),[result,key,months,board])
  return {series,loading:result.key!==key,error:result.key===key?result.error:null,reload:()=>setRetry(v=>v+1)}
}
