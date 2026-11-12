"use client"
import {useCallback,useEffect,useState} from 'react'
import type {DailySyncStatus} from '@/lib/adx/daily-board-sync'
import {Button} from '@/components/ui/button'
export function DailySyncStatusPanel({onOpen,onRefresh}:{onOpen:(date:string)=>void;onRefresh:()=>Promise<void>}){
 const [data,setData]=useState<{latest:DailySyncStatus|null;success:DailySyncStatus|null}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const read=useCallback(async()=>{try{const r=await fetch('/api/market-data/daily-sync',{cache:'no-store',signal:AbortSignal.timeout(20000)});const p=await r.json().catch(()=>null);if(!r.ok)throw new Error(p?.error||'读取失败');setData(p);setError('')}catch(e){setError((e as Error).message)}},[])
 useEffect(()=>{
  // Initial synchronization with the remote status; later updates use timer/focus callbacks.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void read();const timer=setInterval(()=>{if(document.visibilityState==='visible')void read()},300000);const focus=()=>void read();window.addEventListener('focus',focus);return()=>{clearInterval(timer);window.removeEventListener('focus',focus)}},[read])
 async function refresh(){setBusy(true);try{await read();await onRefresh()}finally{setBusy(false)}}
 async function openLatest(){const date=data?.success?.dataDate;if(!date)return;setBusy(true);try{await onRefresh();onOpen(date)}finally{setBusy(false)}}
 const latest=data?.latest,success=data?.success
 return <section aria-label="ADX日榜自动同步" className="rounded-2xl border border-[#c8d9bc] bg-[#f8faef] px-5 py-4 text-sm text-[#173f31]">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">ADX日榜自动同步</h2><div className="flex flex-wrap gap-2">{success?.dataDate&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void openLatest()}>查看最新日榜 · {success.dataDate}</Button>}<Button size="sm" variant="outline" disabled={busy} onClick={()=>void refresh()}>{busy?'刷新中…':'刷新同步状态与榜单'}</Button></div></div>
  {error?<p role="alert" className="mt-2 text-amber-800">{error}</p>:!data?<p className="mt-2">正在读取同步状态…</p>:<>
   <p className="mt-2 text-xs leading-6">{success?`最新成功数据日 ${success.dataDate} · ${success.boards}个榜单 · 保留${success.records}条原始记录 · 日榜Top50范围${success.samples}条（未筛AI）`:'尚无正式日榜同步记录。已有日报文字不代表原始榜单已同步。'}</p>
   {!!success?.missingBoards?.length&&<p role="status" className="mt-1 text-xs leading-6 text-amber-800">本期缺榜：{success.missingBoards.join('、')}。{success.note} 已发布的榜单继续使用，缺榜不补零或沿用旧日数据。</p>}
   {latest&&latest.state!=='synced'&&<p role="status" className="mt-1 text-xs leading-6 text-amber-800">{latest.requestedDate||'最近一次'}：{latest.state==='collection_blocked'?'采集未完成':latest.state==='sync_failed'?'同步失败':'试跑未发布'}。{latest.note} 成功历史保留，本次缺失不写成零。</p>}
   <p className="mt-1 text-xs leading-6 text-muted-foreground">沿用每日10:30采集任务，完成后自动发布并关联重点作品。任务在当前电脑运行；登录失效或电脑未运行时不会产生新榜单。状态自动检查，查看新数据可刷新目录，不会替你改动笔记。</p>
  </>}
 </section>
}
