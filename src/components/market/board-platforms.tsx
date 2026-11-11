import { metricNumber, type BoardSample } from '@/lib/market/board-analysis'

export function BoardPlatforms({samples}:{samples:BoardSample[]}) {
  const platforms = samples.filter(s=>s.key.includes(':platform:')).map(s=>{
    const values=s.ai.map(r=>s.metric?metricNumber(r[s.metric]):null)
    const total=values.reduce<number>((sum,n)=>sum+(n??0),0)
    return {...s,total,missing:values.filter(n=>n===null).length}
  })
  return <section className="space-y-4"><h3 className="text-lg font-semibold">平台榜指标 · 分开观察</h3><p className="text-xs leading-6 text-muted-foreground">仅统计本期已采集平台的原榜TopN内AI条目。播放增量按数值降序；热度只在各平台内部解释，不合计、不计算跨平台份额。平台缺榜不代表零表现，当前无法据此确认全市场份额。</p>
    {!platforms.length && <p className="rounded-xl border border-dashed p-5 text-sm">本期尚未导入平台榜；主榜中的投放产品不能替代平台播放榜。</p>}
    {['播放增量','热度','未识别'].map(metric=>{
      const group=platforms.filter(s=>(s.metric||'未识别')===metric).sort((a,b)=>metric==='播放增量'?b.total-a.total:a.name.localeCompare(b.name))
      if (!group.length) return null
      return <div key={metric} className="rounded-2xl border bg-white p-5"><h4 className="font-semibold">{metric}{metric==='热度'?'（各平台独立口径）':''}</h4>{group.map((s,i)=><div key={s.key} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm"><span className="break-all">{metric==='播放增量'?`${i+1}. `:''}{s.key.split(':platform:')[1]}</span><span className="tabular-nums">{s.ai.length}/{s.rows.length}条为AI · {s.total.toLocaleString()} {metric==='播放增量'?'次':'热度值'}</span><p className="w-full text-xs text-amber-800">{s.missing?`${s.missing}条指标缺失，合计不完整。`:''}{s.issues.join('；')}</p></div>)}</div>
    })}
  </section>
}
