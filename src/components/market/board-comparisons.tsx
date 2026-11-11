import type { BoardComparison } from '@/lib/market/board-analysis'

export function BoardComparisons({ comparisons, current, previous }: {comparisons: BoardComparison[]; current: string; previous: string}) {
  return <section className="space-y-4" aria-label="分榜同期比较">
    <div><h2 className="text-lg font-semibold text-[#173f31]">{current} 与 {previous || '待补充对比期'} · 分榜比较</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">每榜独立比较两期共有的原榜TopN，再识别AI标签。题材按同榜同月原名去重，变化单位为百分点；不同榜单不混算。导出筛选条件仍需源站凭证核验。</p></div>
    {!comparisons.length && <p>暂无可识别榜单，请先上传数据。</p>}
    {comparisons.map(c => <article key={c.key} className="rounded-2xl border border-[#d7e4c8] bg-white p-5">
      <h3 className="break-all font-semibold text-[#173f31]">{c.name}</h3>
      <p className="mt-1 text-xs text-muted-foreground">本期：{c.current?.period || '未采集'} · 对比期：{c.previous?.period || '未采集'} · 指标：{c.current?.metric || c.previous?.metric || '未识别'}</p>
      {c.reason ? <p className="mt-3 text-sm text-amber-800">{c.reason}</p> : <>
        <p className="mt-3 text-sm">共同范围：原榜前{c.sampleSize}名；AI条目 {c.previousAI} → {c.currentAI}；同名去重AI作品 {c.previousWorks} → {c.currentWorks}。</p>
        <p className="mt-2 text-xs leading-6 text-amber-800">唯一匹配记录 {c.matched} 对，其中 {c.changedTags} 对标签变化；{c.ambiguous} 个重复匹配键已排除名次比较。男女频不进入题材升降；其他标签变化也可能影响统计，不能直接当作需求变化。</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[400px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-2">题材</th><th>对比期作品数</th><th>本期作品数</th><th>占比变化</th></tr></thead><tbody>{c.genres.slice(0,8).map(g=><tr key={g.name} className="border-b"><td className="py-2">{g.name}</td><td>{g.previous}</td><td>{g.current}</td><td className="font-medium text-[#315f4a]">{g.change>0?'+':''}{g.change.toFixed(1)}个百分点</td></tr>)}</tbody></table></div>
        <details className="mt-4 text-sm"><summary className="cursor-pointer text-[#315f4a]">查看同名、同剧场号的名次变化与来源</summary><p className="my-2 break-all text-xs text-muted-foreground">本期文件：{c.current?.name}；对比文件：{c.previous?.name}。这里显示原榜名次，同名不等于已核验同一版本；离开TopN也不代表下架。</p>{c.changes.slice(0,10).map((w,i)=><div key={i} className="border-t py-2"><span className="break-words">{w.title}{w.channel?` · ${w.channel}`:''}</span><span className="ml-3 whitespace-nowrap font-medium">第{w.before} → 第{w.after}</span></div>)}</details>
      </>}
      {[...(c.current?.issues||[]),...(c.previous?.issues||[])].map((issue,i)=><p key={i} className="mt-2 text-xs leading-6 text-amber-800">{issue}</p>)}
    </article>)}
  </section>
}
