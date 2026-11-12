"use client"
import {useMemo,useState} from 'react'
import {LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid} from 'recharts'
import type {MarketDataImport} from '@/hooks/use-market-data-imports'
import {useMonthlyHistory} from '@/hooks/use-monthly-history'
import {boardLabel,describeContinuity,genreTimeline,monthKey,monthRange} from '@/lib/market/monthly-history'
import {isBoardImport} from '@/lib/market/import-scope'
import {marketBoardKey} from '@/lib/market/monitoring-policy'
import {Button} from '@/components/ui/button'
export function MonthlyTrends({imports,period}:{imports:MarketDataImport[];period:string}){
  const boards=[...new Set(imports.filter(i=>isBoardImport(i)&&monthKey(i.period_label||'')).map(i=>marketBoardKey(i.source_name,i.file_name)))].sort()
  const [choice,setChoice]=useState(''),[count,setCount]=useState(6),[genre,setGenre]=useState('家庭')
  const board=boards.includes(choice)?choice:boards.find(k=>k.endsWith('tiktok-hot'))||boards[0]||''
  const months=useMemo(()=>monthRange(period,count),[period,count])
  const {series,loading,error,reload}=useMonthlyHistory(imports,months,board)
  const genres=[...new Set(series.flatMap(p=>p.sample?.ai.flatMap(r=>String(r[p.sample!.tagKey]??'').split(/[,，、/\n]/).map(t=>t.trim()).filter(t=>t&&!['AI仿真人','男频','女频'].includes(t)))||[]))].sort()
  const selected=genres.includes(genre)?genre:genres[0]||genre
  const timeline=genreTimeline(series,selected)
  const interpretation=describeContinuity(timeline.points)
  const usable=timeline.changes.filter(c=>c.change!==null)
  return <section className="space-y-4 rounded-2xl border border-[#c8d9bc] bg-[#f8faef] p-4 sm:p-5" aria-label="连续月份趋势">
    <h2 className="text-lg font-semibold text-[#173f31]">连续月份趋势</h2>
    <p className="text-xs leading-6 text-muted-foreground">截至所选统计月，按同一榜单逐月观察。缺月保留空白，不跨缺月计算环比；各月共同TopN内按原名去重统计AI作品，标签占比不相加。</p>
    {!months.length?<p>请在上方切换到月榜。</p>:<>
    <div className="flex flex-wrap gap-3"><label className="min-w-0 text-xs">来源与榜单<select aria-label="连续趋势榜单" className="mt-1 block w-full max-w-full rounded-lg border bg-white p-2" value={board} onChange={e=>setChoice(e.target.value)}>{boards.map(b=><option key={b} value={b}>{boardLabel(b)}</option>)}</select></label><label className="text-xs">观察范围<select aria-label="连续月份范围" className="mt-1 block rounded-lg border bg-white p-2" value={count} onChange={e=>setCount(+e.target.value)}>{[3,6,12].map(n=><option key={n} value={n}>最近{n}个月</option>)}</select></label><label className="text-xs">题材<select aria-label="趋势题材" className="mt-1 block rounded-lg border bg-white p-2" value={selected} onChange={e=>setGenre(e.target.value)}>{genres.map(g=><option key={g}>{g}</option>)}</select></label></div>
    {loading?<p role="status" className="py-4 text-sm">正在按需读取同榜历史月份…</p>:error?<div role="alert"><p>{error}</p><Button onClick={reload} variant="outline">重试历史月份</Button></div>:<>
      <p className="text-sm font-medium text-[#315f4a]">{boardLabel(board)} · {selected} · 共同原榜Top{timeline.commonN}</p>
      <div className="rounded-xl border border-[#c8d9bc] bg-white p-4 text-sm leading-6"><h3 className="font-semibold text-[#173f31]">{interpretation.title}</h3><p>{interpretation.text}</p><p className="mt-1 text-[#315f4a]">下一步：{interpretation.action}</p><p className="mt-2 text-xs text-muted-foreground">规则观察：同向变化每次≥3个百分点、稳定区间≤5个百分点；不代表统计显著性或商业收益。</p></div>
      <p className="text-xs leading-6">{usable.length?usable.map(c=>`${c.from}→${c.to} ${c.change!>=0?'+':''}${c.change!.toFixed(1)}个百分点`).join('；'):'缺少相邻可比月份，暂不判断连续升降。'}</p>
      <p className="text-xs text-amber-800">{timeline.changes.some(c=>c.changedTags)?`相邻月匹配记录存在标签修订（${timeline.changes.filter(c=>c.changedTags).map(c=>`${c.from}→${c.to}：${c.changedTags}/${c.matched}对`).join('；')}），须复核后解释需求趋势。`:'标签份额反映样本结构，不能直接推导收入、受众偏好或投放回报。'}</p>
      <div className="h-56 min-w-0" aria-label="月度题材占比折线图"><ResponsiveContainer width="100%" height="100%"><LineChart data={timeline.points} margin={{left:0,right:16,top:12,bottom:0}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis unit="%" domain={[0,100]} width={42} tick={{fontSize:10}}/><Tooltip formatter={v=>[v==null?'未采集':`${Number(v).toFixed(1)}%`,'题材占比']}/><Line type="linear" dataKey="share" stroke="#235d43" strokeWidth={2} connectNulls={false} isAnimationActive={false} dot={{r:4}}/></LineChart></ResponsiveContainer></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[430px] text-left text-xs"><thead><tr className="border-b"><th className="py-2">月份</th><th>题材作品 / AI作品</th><th>占比</th><th>数据情况</th></tr></thead><tbody>{timeline.points.map(p=><tr key={p.month} className="border-b"><td className="py-3">{p.month}</td><td>{p.works===null?'—':`${p.count} / ${p.works}`}</td><td>{p.share===null?'—':`${p.share.toFixed(1)}%`}</td><td className="max-w-[230px]">{p.reason||'可观察'}</td></tr>)}</tbody></table></div>
    </>}
    </>}
  </section>
}
