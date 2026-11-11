"use client"

import { Button } from "@/components/ui/button"
import { MARKET_SAMPLE_LIMITS, type MarketPeriodKind } from "@/lib/market/monitoring-policy"

import type { MarketResearch } from "@/lib/market/research"
import { MarketResearchPanel } from "./market-research"

type OverviewData = {
  totalWorks: number; totalRows: number; overlapCount: number
  genres: { name: string; value: number }[]
  overlapWorks: { titleKey: string; title: string; titleCn: string }[]
  datasets: { name: string; aiRows: number; sampledRows: number; rows: number; signal: string }[]
}
export function MonitorOverview({ data, research, kind, period, loading, onInspect, onCollect }: {
  data: OverviewData; research: MarketResearch; kind: MarketPeriodKind; period: string; loading: boolean
  onInspect: (view: "works" | "genres" | "trends" | "production") => void; onCollect: () => void
}) {
  const target = MARKET_SAMPLE_LIMITS[kind]
  const complete = data.datasets.filter(item => item.sampledRows >= target).length

  if (loading) return <div role="status" className="rounded-2xl border bg-white p-10 text-center text-sm text-muted-foreground">正在整理真实榜单与监测证据…</div>
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        ["纳入监测记录", data.totalRows.toLocaleString(), `原榜前 ${target} 名中的AI标签记录`],
        ["去重作品", data.totalWorks.toLocaleString(), "跨来源合并作品，保留各榜记录"],
        ["达到采样目标", `${complete} / ${data.datasets.length}`, "当前有数据榜单，不代表全部市场"],
        ["投放与热播共同出现", String(data.overlapCount), "同时出现在投放榜与TikTok榜"],
      ].map(([label, value, note]) => <div key={label} className="rounded-2xl border border-[#d7e4c8] bg-white/90 px-4 py-3"><p className="text-xs text-[#61766b]">{label}</p><p className="mt-1 text-2xl font-semibold text-[#173f31]">{value}</p><p className="mt-1 text-[11px] text-[#61766b]">{note}</p></div>)}
    </div>

    <div><p className="mb-2 text-xs text-[#61766b]">{period} · {kind === "month" ? "月度主研判" : "短期观察，需结合月榜验证"}</p><MarketResearchPanel research={research} compact onExplore={() => onInspect("production")} /></div>

    {data.genres.length > 0 && <section className="rounded-2xl border border-[#d7e4c8] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold text-[#173f31]">题材结构</h2><p className="mt-1 text-xs text-[#61766b]">每部作品可有多个题材标签，比例不相加；这里只展示前六项。</p></div><Button variant="ghost" size="sm" onClick={() => onInspect("genres")}>查看全部题材 →</Button></div><div className="mt-4 space-y-3">{data.genres.slice(0,6).map(item => <div key={item.name} className="grid grid-cols-[5rem_1fr_5rem] items-center gap-3 text-xs sm:grid-cols-[8rem_1fr_7rem]"><span className="truncate font-medium">{item.name}</span><div className="h-2 overflow-hidden rounded-full bg-[#eef3e7]"><div className="h-full rounded-full bg-[#315f4a]" style={{width:`${Math.min(100,item.value/Math.max(1,data.totalWorks)*100)}%`}} /></div><span className="text-right tabular-nums text-[#61766b]">{item.value}部 · {(item.value/Math.max(1,data.totalWorks)*100).toFixed(0)}%</span></div>)}</div></section>}

    <details className="rounded-2xl border border-[#d7e4c8] bg-white"><summary className="cursor-pointer px-5 py-4 text-sm font-medium text-[#315f4a]">数据覆盖与结论边界 · {data.datasets.length}个有数据榜单，{Math.max(0,data.datasets.length-complete)}个未达采样目标</summary><div className="space-y-3 border-t border-[#e2eadb] p-5"><p className="text-xs leading-6 text-[#61766b]">目标为每来源、每榜单日50 / 周300 / 月500。保留原始导入记录，分析时截取目标范围；不足时展示实际数量。未采集榜单不算作零表现，投放量与播放量不相加。</p>{data.datasets.map((item,index) => <div key={`${item.name}:${index}`} className="flex flex-wrap justify-between gap-2 border-b border-[#edf1e8] pb-2 text-xs"><span className="min-w-0 break-all">{item.name}<span className="ml-2 text-[#61766b]">{item.signal}</span></span><span className="shrink-0 tabular-nums">{item.sampledRows} / {target}条，AI {item.aiRows}条 · {item.sampledRows>=target ? "达到目标" : "样本不足，待核查"}</span></div>)}<Button size="sm" variant="outline" onClick={onCollect}>查看来源与采集状态</Button></div></details>
  </div>
}
