"use client"
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { dailyBriefState } from '@/lib/adx/daily-brief'
type BriefState=ReturnType<typeof dailyBriefState>
const stamp=(s:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s))
export function DailyBriefCard(){
  const [state,setState]=useState<BriefState|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[hidden,setHidden]=useState(false)
  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{const response=await fetch('/api/market-data/daily-brief',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(response.status===403){setHidden(true);return}const data=await response.json();if(!response.ok)throw new Error(data.error||'日报读取失败');setState(data)}catch(e){setError(e instanceof Error?e.message:'日报读取失败')}finally{setLoading(false)}
  },[])
  useEffect(()=>{
    // Initial synchronization of the separately published daily report.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const refresh=()=>{if(!document.hidden)void load()}
    window.addEventListener('focus',refresh)
    const timer=window.setInterval(refresh,300000)
    return()=>{window.removeEventListener('focus',refresh);window.clearInterval(timer)}
  },[load])
  if(hidden)return null
  const report=state?.report,latest=state?.latest
  const failed=!!latest&&!/^(completed|success)/.test(latest.status)
  return <section aria-label="ADX市场日报" className="rounded-2xl border border-[#b8d0b2] bg-[#f7faf3] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-[#173f31]">ADX市场日报</h2><p className="mt-1 text-[11px] text-[#61766b]">{report?`数据日 ${report.dataDate} · 整理于 ${stamp(report.collectedAt)}（北京时间）`:'每日市场信号与对标研究'}</p></div><div className="flex items-center gap-3 text-xs"><button onClick={()=>void load()} disabled={loading} className="text-[#315f4a] disabled:opacity-50">{loading?'读取中…':'刷新日报'}</button><Link href="/market-data" className="font-medium text-[#315f4a]">进入市场看板 →</Link></div></div>
    {error&&<p role="alert" className="mt-3 text-xs text-red-700">读取失败，{state?'下方保留上次成功读取内容。':''}{error}。请刷新重试。</p>}
    {!state&&!error&&<p role="status" className="mt-3 text-xs text-[#61766b]">正在读取已发布日报…</p>}
    {state&&<div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#61766b]"><span>{report?`${report.boardCount??'—'}个榜单 · ${report.actual??'—'} / ${report.target??'—'}条`:'尚无已发布日报'}</span><span className={failed||state.stale?'text-amber-800':'text-[#315f4a]'}>{failed?'最近采集受阻':latest?'最近采集完成'+(latest.status.includes('shortfall')?' · 源站样本不足':''):'尚无采集记录'}{latest?` · ${stamp(latest.collectedAt)}`:''}</span>{state.stale&&<span className="text-amber-800">待更新：按现有10:30日程，应更新至{state.expectedDate}数据日</span>}</div>
      {failed&&<p className="rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-900">目标数据日 {latest?.requestedDate||'待确认'}：{latest?.note||'请检查采集任务状态'}。保留最近成功日报，未用旧数据替代本次采集。</p>}
      {report&&<><p className="text-[11px] leading-5 text-[#61766b]">独立日报：投放与TikTok各Top100，12个平台各Top50（历史采样口径）；不与市场看板的日50 / 周300 / 月500混算。</p><div className="grid gap-3 lg:grid-cols-3">{report.signals.map((s,i)=><article key={s.title} className="min-w-0 rounded-xl border border-[#d7e4c8] bg-white p-3"><h3 className="text-xs font-semibold leading-5 text-[#173f31]">{i+1}. {s.title}</h3><p className="mt-2 text-xs leading-5 text-[#4b6657]">{s.judgment||'查看原日报核对结论。'}</p>{s.action&&<p className="mt-2 text-xs leading-5"><span className="font-semibold text-[#315f4a]">下一步：</span>{s.action}</p>}<details className="mt-2 text-[11px] leading-5 text-[#61766b]"><summary className="cursor-pointer">查看事实依据</summary><p className="mt-1">{s.fact||'原文未提供独立事实段。'}</p></details></article>)}</div><details className="text-xs text-[#315f4a]"><summary className="cursor-pointer font-medium">完整日报与采集缺口</summary><p className="mt-3 text-xs leading-6 text-[#61766b]">{report.note}</p><div className="mt-3 max-h-[32rem] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-white p-4 text-xs leading-6 text-[#344e40]">{report.report}</div></details></>}
    </div>}
  </section>
}
