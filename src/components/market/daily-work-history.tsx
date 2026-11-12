"use client"
import {useMemo,useState} from 'react'
import type {MarketDataImport} from '@/hooks/use-market-data-imports'
import {useDailyHistory} from '@/hooks/use-monthly-history'
import {dayKey,dayRange,dailyWorkObservations} from '@/lib/market/monthly-history'
import {isBoardImport} from '@/lib/market/import-scope'
import type {WatchRecord} from '@/lib/market/research-records'
import {Button} from '@/components/ui/button'
export function DailyWorkHistory({imports,period,work}:{imports:MarketDataImport[];period:string;work:WatchRecord}){
 const [count,setCount]=useState(7)
 const latest=imports.filter(isBoardImport).map(i=>dayKey(i.period_label||'')).filter((d):d is string=>!!d).sort().at(-1)||''
 const end=dayKey(period)||latest
 const days=useMemo(()=>dayRange(end,count),[end,count])
 const history=useDailyHistory(imports,days,work.board)
 const observations=dailyWorkObservations(history.series,work.title,work.channel)
 return <section aria-label="作品每日追踪" className="space-y-3 rounded-xl border border-[#c8d9bc] bg-[#f8faef] p-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[#173f31]">每日记录 · {end||'等待首次同步'}</h3><select aria-label="作品日度追踪范围" value={count} onChange={e=>setCount(+e.target.value)} className="rounded-lg border bg-white p-2 text-xs">{[7,14,30].map(n=><option key={n} value={n}>最近{n}天</option>)}</select></div>
  <p className="text-xs leading-6 text-muted-foreground">自动关联已同步的同榜日榜Top50，无需再次上传。月榜与日榜分别展示；只在相邻自然日、排序和指标一致时计算名次变化，不自动改动跟进状态或笔记。</p>
  {!end?<p className="text-sm">尚无已同步日榜。采集成功并同步后将自动显示。</p>:history.loading?<p role="status" className="text-sm">正在读取每日榜单…</p>:history.error?<div role="alert">{history.error}<Button variant="outline" onClick={history.reload}>重试日榜</Button></div>:<div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead><tr className="border-b"><th className="py-2">数据日</th><th>名次</th><th>较前日</th><th>指标</th><th>记录情况</th></tr></thead><tbody>{observations.map(o=><tr key={o.month} className="border-b"><td className="py-3">{o.month}</td><td>{o.rank??'—'}</td><td>{o.rankChange===null?'—':o.rankChange===0?'持平':o.rankChange>0?`↑${o.rankChange}`:`↓${-o.rankChange}`}</td><td>{o.value===null?'—':`${o.metric} ${o.value.toLocaleString()}`}</td><td className="max-w-[200px]">{o.state}{o.tags&&` · ${o.tags}`}</td></tr>)}</tbody></table></div>}
 </section>
}
