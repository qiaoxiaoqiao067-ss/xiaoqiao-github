"use client"

import { Button } from '@/components/ui/button'
import type { MarketResearch, ResearchFinding } from '@/lib/market/research'

export function MarketResearchPanel({ research, compact = false, onExplore, onSave, saving, saved }: {
  research: MarketResearch; compact?: boolean; onExplore?: () => void
  onSave?: (finding: ResearchFinding) => Promise<void>; saving?: string; saved?: (finding: ResearchFinding) => boolean
}) {
  return <section className="min-w-0 space-y-4" aria-label="市场研判与行动">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#173f31]">市场研判与行动</h2><p className="mt-1 text-xs leading-6 text-[#61766b]">事实 → 判断 → 选题与测试动作。规则筛选的研究建议，待内容核验；随统计期和对比期更新。</p></div>{compact && <Button size="sm" variant="outline" onClick={onExplore}>对标作品与执行建议 →</Button>}</div>
    {!research.findings.length && <div className="rounded-2xl border bg-white p-5 text-sm text-[#61766b]">暂无足够且通过校验的AI题材数据。请先补齐榜单或核验来源；此处不生成无依据的市场判断。</div>}
    <div className="overflow-hidden rounded-2xl border border-[#b6ce92] bg-[#f7faef]">{research.findings.map((f,i)=><article key={f.id} className="min-w-0 border-b border-[#d7e4c8] p-5 last:border-0">
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[#789a52]">{String(i+1).padStart(2,'0')}</span><h3 className="min-w-0 flex-1 text-base font-semibold text-[#173f31]">{f.title}</h3><span className="rounded-full bg-[#dce9c9] px-3 py-1 text-xs text-[#173f31]">{f.decision}</span></div>
      <dl className="mt-3 grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs leading-6"><dt className="text-[#668448]">依据</dt><dd>{f.facts.map(t=><p key={t}>{t}</p>)}</dd><dt className="text-[#668448]">判断</dt><dd>{f.judgment}</dd><dt className="text-[#668448]">开发</dt><dd>{f.development}</dd>{!compact && <><dt className="text-[#668448]">投放</dt><dd>{f.advertising}</dd><dt className="text-[#668448]">复核</dt><dd>{f.validation}</dd></>}</dl>
      {f.cautions.map(t=><p key={t} className="mt-2 text-xs leading-5 text-[#7b612e]">{t}</p>)}
      {!compact && <div className="mt-4 space-y-3 rounded-xl border border-[#d7e4c8] bg-white p-4"><p className="text-xs font-semibold text-[#315f4a]">对标作品 · 同榜同标签按指标降序选取，剧情尚未核验</p>{f.cases.map((c,j)=><div key={`${c.source}:${c.title}:${j}`} className="min-w-0 border-b border-[#e7eddf] pb-2 last:border-0"><p className="break-words text-sm font-medium">{c.title}</p><p className="mt-1 break-words text-xs leading-5 text-[#61766b]">原榜第{c.rank}名 · {c.metric} {c.value === null ? '未提供' : c.value.toLocaleString()} {c.channel && `· 剧场号 ${c.channel}`}</p><p className="break-all text-[11px] leading-5 text-[#61766b]">{c.period} · {c.source}{c.regions && ` · 国家Top3：${c.regions}（不代表受众占比）`}</p></div>)}{onSave && <Button size="sm" variant="outline" disabled={saved?.(f) || saving===f.id} onClick={()=>void onSave(f)}>{saving===f.id?'正在保存…':saved?.(f)?'已加入选题情报':'保存为待评估研究方向'}</Button>}</div>}
    </article>)}</div>
    <details className="rounded-2xl border border-[#d7e4c8] bg-white"><summary className="cursor-pointer px-5 py-3 text-xs font-medium text-[#315f4a]">研判规则与证据缺口 · {research.limitations.length}项</summary><div className="space-y-2 border-t p-5 text-xs leading-6 text-[#61766b]"><p>{research.method}</p>{research.limitations.map(t=><p key={t}>{t}</p>)}</div></details>
  </section>
}
