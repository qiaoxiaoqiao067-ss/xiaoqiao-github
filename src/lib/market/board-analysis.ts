import { latestBoardImports, marketBoardKey, MARKET_SAMPLE_LIMITS, sampleMarketRows, type MarketPeriodKind } from './monitoring-policy'

type Row = Record<string, unknown>
type Source = { source_name: string; file_name: string; period_label: string | null; created_at: string; raw_rows: Row[]; analysis_issues?: string[]; columns?: string[] }
export type BoardSample = {
  key: string; name: string; period: string; rows: Row[]; ai: Row[]; metric: string | null
  issues: string[]; rankKey: string; titleKey: string; tagKey: string; channelKey?: string
}
export type BoardComparison = {
  key: string; name: string; current?: BoardSample; previous?: BoardSample; reason: string | null
  sampleSize: number; currentAI: number; previousAI: number; currentWorks: number; previousWorks: number
  genres: { name: string; current: number; previous: number; change: number }[]
  changes: { title: string; channel: string; before: number; after: number }[]
  matched: number; changedTags: number; ambiguous: number
}
const value = (x: unknown) => String(x ?? '').trim()
const identity = (x: unknown) => value(x).toLocaleLowerCase()
const tags = (row: Row, key: string) => [...new Set(value(row[key]).split(/[,，、/\n]/).map(x => x.trim()).filter(Boolean))]
export const metricNumber = (x: unknown): number | null => {
  if (x === null || x === undefined || value(x) === '') return null
  const text = value(x).replace(/,/g, '')
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null
  const n = Number(text); return Number.isFinite(n) ? n : null
}
export function boardSamples(imports: Source[], kind: MarketPeriodKind): BoardSample[] {
  return latestBoardImports(imports).map(source => {
    const keys = source.raw_rows[0] ? Object.keys(source.raw_rows[0]) : source.columns || []
    const rankKey = keys.find(k => /^(排名|排行|rank)$/i.test(k)) || ''
    const titleKey = keys.find(k => /^(剧名|短剧|作品名称|title)$/i.test(k)) || ''
    const tagKey = keys.find(k => /^(标签|题材|类型标签)$/i.test(k)) || ''
    const channelKey = keys.find(k => /^(剧场号|channel)$/i.test(k))
    const key = marketBoardKey(source.source_name, source.file_name)
    const period = source.period_label || ''
    const rows = sampleMarketRows(source.raw_rows, kind, r => metricNumber(r[rankKey]))
    const issues: string[] = [...(source.analysis_issues || [])]
    if (!rankKey || !titleKey || !tagKey) issues.push('缺少可识别的排名、剧名或标签字段，需核对字段映射')
    if (rows.some((r, i) => metricNumber(r[rankKey]) !== i + 1)) issues.push('原榜名次缺失、重复或不连续，无法确认TopN边界')
    const month = period.match(/^(\d{4})(?:年|-)(\d{1,2})(?:月)?$/)
    if (month && kind === 'month' && !source.analysis_issues) {
      const boundary = `${month[1]}-${month[2].padStart(2, '0')}`
      const future = source.raw_rows.filter(r => ['上线时间', '首次投放时间'].some(k => /^\d{4}-\d{2}-\d{2}/.test(value(r[k])) && value(r[k]).slice(0,7) > boundary)).length
      if (future) issues.push(`${future}条记录的上线/首投日期晚于统计月，暂停跨期比较，待核验文件月份或元数据`)
    }
    if (/(周榜|日榜)/.test(source.file_name) && kind === 'month' || /周榜/.test(source.file_name) && kind === 'day') issues.push('文件名榜单周期与导入周期不一致')
    const metric = key.endsWith('short-drama') ? (keys.includes('新素材数') ? '新素材数' : null)
      : keys.includes('播放增量') && rows.some(r => metricNumber(r['播放增量']) !== null) ? '播放增量'
      : keys.includes('热度') ? '热度' : null
    return { key, name: source.file_name, period, rows, ai: rows.filter(r => tags(r,tagKey).includes('AI仿真人')), metric, issues:[...new Set(issues)], rankKey, titleKey, tagKey, channelKey }
  }).filter(s => s.titleKey || s.rankKey)
}
function genreCounts(sample: BoardSample, rows: Row[]) {
  const works = new Map<string, Set<string>>()
  for (const r of rows) {
    const key = identity(r[sample.titleKey]); if (!key) continue
    const set = works.get(key) || new Set<string>()
    tags(r,sample.tagKey).forEach(t => set.add(t)); works.set(key,set)
  }
  const counts = new Map<string, number>()
  works.forEach(ts => ts.forEach(t => { if (!['AI仿真人','女频','男频'].includes(t)) counts.set(t,(counts.get(t)||0)+1) }))
  return { works: works.size, counts }
}
export function compareBoards(current: BoardSample[], previous: BoardSample[]): BoardComparison[] {
  return [...new Set([...current,...previous].map(s => s.key))].map(key => {
    const a = current.find(s => s.key===key), b = previous.find(s => s.key===key)
    const n = Math.min(a?.rows.length || 0,b?.rows.length || 0)
    const reason = !a ? '本期未采集，不代表零表现' : !b ? '对比期未采集，暂不计算变化' : a.issues.length || b.issues.length ? '存在日期或字段异常，先核验来源' : a.metric !== b.metric ? '两期指标不同，暂停比较' : !n ? '暂无可比较记录' : null
    const aa = a?.ai.filter(r => (metricNumber(r[a.rankKey]) || Infinity)<=n) || []
    const bb = b?.ai.filter(r => (metricNumber(r[b.rankKey]) || Infinity)<=n) || []
    const ag = a ? genreCounts(a,aa) : {works:0, counts:new Map<string,number>()}
    const bg = b ? genreCounts(b,bb) : {works:0, counts:new Map<string,number>()}
    const result: BoardComparison = {key,name:a?.name||b!.name,current:a,previous:b,reason,sampleSize:n,currentAI:aa.length,previousAI:bb.length,currentWorks:ag.works,previousWorks:bg.works,genres:[],changes:[],matched:0,changedTags:0,ambiguous:0}
    if (reason || !a || !b) return result
    result.genres = [...new Set([...ag.counts.keys(),...bg.counts.keys()])].map(name => ({name,current:ag.counts.get(name)||0,previous:bg.counts.get(name)||0,change:((ag.counts.get(name)||0)/(ag.works||1)-(bg.counts.get(name)||0)/(bg.works||1))*100})).sort((x,y)=>Math.abs(y.change)-Math.abs(x.change))
    const index = (s:BoardSample, rr:Row[]) => {
      const map = new Map<string,Row[]>()
      rr.forEach(r => {const k=identity(r[s.titleKey])+(s.channelKey ? `|${identity(r[s.channelKey])}`:''); map.set(k,[...(map.get(k)||[]),r])}); return map
    }
    const ai=index(a,aa), bi=index(b,bb)
    for (const k of new Set([...ai.keys(),...bi.keys()])) {
      const x=ai.get(k), y=bi.get(k)
      if ((x?.length||0)>1 || (y?.length||0)>1) {result.ambiguous++;continue}
      if (!x || !y) continue
      result.matched++
      if (tags(x[0],a.tagKey).sort().join('|')!==tags(y[0],b.tagKey).sort().join('|')) result.changedTags++
      result.changes.push({title:value(x[0][a.titleKey]),channel:a.channelKey?value(x[0][a.channelKey]):'',before:metricNumber(y[0][b.rankKey])!,after:metricNumber(x[0][a.rankKey])!})
    }
    result.changes.sort((x,y)=>(y.before-y.after)-(x.before-x.after))
    return result
  })
}
export { MARKET_SAMPLE_LIMITS }
