"use client"

import { Button } from "@/components/ui/button"
import { MARKET_SAMPLE_LIMITS, type MarketPeriodKind } from "@/lib/market/monitoring-policy"

type OverviewData = {
  totalWorks: number; totalRows: number; overlapCount: number
  genres: { name: string; value: number }[]
  overlapWorks: { titleKey: string; title: string; titleCn: string }[]
  datasets: { name: string; aiRows: number; rows: number; signal: string }[]
}
type Trend = {
  previousPeriod: string; comparable: boolean
  genres: { name: string; current: number; previous: number; change: number }[]
}

export function MonitorOverview({ data, trend, kind, period, loading, onInspect, onCollect }: {
  data: OverviewData; trend: Trend; kind: MarketPeriodKind; period: string; loading: boolean
  onInspect: (view: "works" | "genres" | "trends") => void; onCollect: () => void
}) {
  const target = MARKET_SAMPLE_LIMITS[kind]
  const complete = data.datasets.filter(item => item.aiRows >= target).length
  const lead = data.genres[0]
  const movement = trend.comparable ? trend.genres.find(item => item.change !== 0) : undefined
  const samples = [...new Map(data.overlapWorks.map(item => [item.titleKey, item])).values()].slice(0, 3)
  const purpose = kind === "day" ? "发现今天值得观察的信号，放入后续周榜验证。" : kind === "week" ? "验证短期信号是否延续，筛选下周重点研究对象。" : "梳理本月题材结构，为下一轮选题和定向收稿提供依据。"

  if (loading) return <div role="status" className="rounded-2xl border bg-white p-10 text-center text-sm text-muted-foreground">正在整理真实榜单与监测证据…</div>
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        ["纳入监测记录", data.totalRows.toLocaleString(), `每榜最多 ${target} 条AI仿真人记录`],
        ["去重作品", data.totalWorks.toLocaleString(), "跨来源合并作品，保留各榜记录"],
        ["达到采样目标", `${complete} / ${data.datasets.length}`, "当前有数据榜单，不代表全部市场"],
        ["投放与热播共同出现", String(data.overlapCount), "同时出现在投放榜与TikTok榜"],
      ].map(([label, value, note]) => <div key={label} className="rounded-2xl border border-[#d7e4c8] bg-white/90 px-4 py-3"><p className="text-xs text-[#61766b]">{label}</p><p className="mt-1 text-2xl font-semibold text-[#173f31]">{value}</p><p className="mt-1 text-[11px] text-[#61766b]">{note}</p></div>)}
    </div>

    <section className="overflow-hidden rounded-2xl border border-[#b6ce92] bg-[#f7faef]" aria-labelledby="monitor-conclusions">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d7e4c8] px-5 py-4"><div><p className="text-[11px] font-semibold tracking-widest text-[#668448]">市场监测 / {period}</p><h2 id="monitor-conclusions" className="mt-1 text-xl font-semibold text-[#173f31]">本期市场结论</h2><p className="mt-1 text-xs leading-5 text-[#61766b]">{purpose}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs text-[#456052]">{data.totalWorks ? "基于当前样本 · 待人工研判" : "等待榜单数据"}</span></div>
      {!data.totalWorks ? <div className="p-6"><p className="text-sm leading-6 text-[#456052]">本期暂无可识别的AI仿真人样本。导入或采集榜单后，再生成监测结论。</p><Button onClick={onCollect} className="mt-4">前往数据采集</Button></div> : <div className="divide-y divide-[#d7e4c8]">
        <Finding number="01" title={lead ? `样本最常见题材：${lead.name}` : "题材信息待补充"} fact={lead ? `${lead.value} / ${data.totalWorks} 部去重作品带有该标签，占样本 ${(lead.value / data.totalWorks * 100).toFixed(1)}%。` : "已读到作品，但尚无有效题材标签。"} judgment="反映榜单样本的内容分布；不能直接推算收入、付费转化或整体市场份额。" action={lead ? `优先拆解${lead.name}头部作品的冲突、人物关系和开篇钩子。` : "补充题材标签后再作方向判断。"} onClick={() => onInspect("genres")} />
        <Finding number="02" title={data.overlapCount ? `${data.overlapCount}部作品获得跨榜信号` : "暂未找到投放与热播交集"} fact={samples.length ? samples.map(item => item.titleCn || item.title).join("；") : "当前已识别作品中，尚无同时出现在投放榜与TikTok榜的作品。"} judgment="跨榜出现值得复核，但不等于商业成功。别名尚未确认的作品可能漏匹配。" action={samples.length ? "查看原始榜单与作品素材，核对是否为同一作品，再加入选题研究。" : "先检查两类榜单是否齐全、作品别名是否一致。"} onClick={() => onInspect("works")} />
        <Finding number="03" title={movement ? `${movement.name}较对比期${movement.change > 0 ? "增加" : "减少"}${Math.abs(movement.change)}部` : trend.comparable ? "同口径样本题材数量暂未变化" : "趋势判断待补齐可比数据"} fact={trend.previousPeriod ? `对比期：${trend.previousPeriod}。${trend.comparable ? "来源、榜单和样本数量一致。" : "两期来源、榜单或样本数量不同，暂不输出升降结论。"}` : "尚无同粒度历史榜单，不输出环比或持续升温结论。"} judgment="日榜、周榜、月榜分别比较；单次上榜只作为观察信号。" action={trend.comparable ? "检查变化涉及的具体作品，后续周期继续追踪。" : "补采同来源、同榜单、同周期粒度的数据。"} onClick={() => onInspect("trends")} />
      </div>}
    </section>

    {data.genres.length > 0 && <section className="rounded-2xl border border-[#d7e4c8] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold text-[#173f31]">题材结构</h2><p className="mt-1 text-xs text-[#61766b]">每部作品可有多个题材标签，比例不相加；这里只展示前六项。</p></div><Button variant="ghost" size="sm" onClick={() => onInspect("genres")}>查看全部题材 →</Button></div><div className="mt-4 space-y-3">{data.genres.slice(0,6).map(item => <div key={item.name} className="grid grid-cols-[5rem_1fr_5rem] items-center gap-3 text-xs sm:grid-cols-[8rem_1fr_7rem]"><span className="truncate font-medium">{item.name}</span><div className="h-2 overflow-hidden rounded-full bg-[#eef3e7]"><div className="h-full rounded-full bg-[#315f4a]" style={{width:`${Math.min(100,item.value/Math.max(1,data.totalWorks)*100)}%`}} /></div><span className="text-right tabular-nums text-[#61766b]">{item.value}部 · {(item.value/Math.max(1,data.totalWorks)*100).toFixed(0)}%</span></div>)}</div></section>}

    <details className="rounded-2xl border border-[#d7e4c8] bg-white"><summary className="cursor-pointer px-5 py-4 text-sm font-medium text-[#315f4a]">数据覆盖与结论边界 · {data.datasets.length}个有数据榜单，{Math.max(0,data.datasets.length-complete)}个未达采样目标</summary><div className="space-y-3 border-t border-[#e2eadb] p-5"><p className="text-xs leading-6 text-[#61766b]">目标为每来源、每榜单日50 / 周300 / 月500。保留原始导入记录，分析时截取目标范围；不足时展示实际数量。未采集榜单不算作零表现，投放量与播放量不相加。</p>{data.datasets.map((item,index) => <div key={`${item.name}:${index}`} className="flex flex-wrap justify-between gap-2 border-b border-[#edf1e8] pb-2 text-xs"><span className="min-w-0 break-all">{item.name}<span className="ml-2 text-[#61766b]">{item.signal}</span></span><span className="shrink-0 tabular-nums">{item.aiRows} / {target}条 · {item.aiRows>=target ? "达到目标" : "样本不足，待核查"}</span></div>)}<Button size="sm" variant="outline" onClick={onCollect}>查看来源与采集状态</Button></div></details>
  </div>
}

function Finding({ number, title, fact, judgment, action, onClick }: { number: string; title: string; fact: string; judgment: string; action: string; onClick: () => void }) {
  return <article className="grid gap-3 px-5 py-5 sm:grid-cols-[2rem_1fr_auto]"><span className="text-lg font-semibold text-[#789a52]">{number}</span><div className="min-w-0"><h3 className="font-semibold text-[#173f31]">{title}</h3><dl className="mt-3 grid grid-cols-[2rem_1fr] gap-x-3 gap-y-2 text-xs leading-6"><dt className="text-[#668448]">事实</dt><dd className="break-words">{fact}</dd><dt className="text-[#668448]">判断</dt><dd className="text-[#61766b]">{judgment}</dd><dt className="text-[#668448]">建议</dt><dd>{action}</dd></dl></div><Button size="sm" variant="ghost" onClick={onClick} className="self-start justify-self-start text-[#315f4a]">查看依据 →</Button></article>
}
