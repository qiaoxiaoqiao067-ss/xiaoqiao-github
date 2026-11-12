import { boardSamples, compareBoards, metricNumber, type BoardSample } from './board-analysis'
import { isBoardImport, type ImportMeta } from './import-scope'
import { marketBoardKey } from './monitoring-policy'

type Source = ImportMeta & {raw_rows:Record<string,unknown>[]; columns?:string[]; analysis_issues?:string[]}
export function monthKey(label:string) {
  const m=label.match(/^(\d{4})(?:年|-)(\d{1,2})月?$/)
  return m && +m[2]>=1 && +m[2]<=12 ? `${m[1]}-${m[2].padStart(2,'0')}` : null
}
export function monthRange(end:string,count:number) {
  const key=monthKey(end);if(!key)return []
  const [y,m]=key.split('-').map(Number)
  return Array.from({length:Math.min(12,Math.max(1,count))},(_,i)=>{const d=new Date(Date.UTC(y,m-count+i,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`})
}
export function activeMonthlySources<T extends Source>(imports:T[],month:string) {
  const items=imports.filter(i=>monthKey(i.period_label||'')===month)
  const marker=items.filter(i=>i.source_name.startsWith('市场版本:')).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
  const version=String(marker?.raw_rows[0]?.version_id||'legacy')
  return items.filter(i=>isBoardImport(i)&&(i.source_name.startsWith('ADX版本:')?i.source_name.slice('ADX版本:'.length):'legacy')===version)
}
export function historyRequests<T extends ImportMeta>(imports:T[],months:string[],board:string) {
  return imports.filter(i=>months.includes(monthKey(i.period_label||'')||'')&&(i.source_name.startsWith('市场版本:')||isBoardImport(i)&&marketBoardKey(i.source_name,i.file_name)===board))
}
export function boardLabel(key:string) {return key.replace(/:short-drama$/, ' · 投放榜').replace(/:tiktok-hot$/, ' · TikTok热播榜').replace(':platform:', ' · ')}
export function monthlySeries(imports:Source[],months:string[],board:string) {
  return months.map(month=>({month,sample:boardSamples(activeMonthlySources(imports,month),'month').find(s=>s.key===board)}))
}
export type MonthPoint = ReturnType<typeof monthlySeries>[number]
export function genreTimeline(series:MonthPoint[],genre:string) {
  const valid=series.filter(p=>p.sample&&!p.sample.issues.length&&p.sample.rows.length)
  const commonN=valid.length?Math.min(...valid.map(p=>p.sample!.rows.length)):0
  const metrics=new Set(valid.map(p=>p.sample!.metric))
  const points=series.map(({month,sample})=>{
    const reason=!sample?'未采集':sample.issues.length?sample.issues.join('；'):!sample.rows.length?'无有效记录':metrics.size>1?'各月指标不一致':null
    if(reason||!sample)return {month,share:null,works:null,count:null,reason}
    const works=new Map<string,Set<string>>()
    sample.ai.filter(r=>(metricNumber(r[sample.rankKey])??Infinity)<=commonN).forEach(r=>{
      const key=String(r[sample.titleKey]??'').trim().toLowerCase();if(!key)return
      const tags=works.get(key)||new Set<string>();String(r[sample.tagKey]??'').split(/[,，、/\n]/).map(t=>t.trim()).filter(Boolean).forEach(t=>tags.add(t));works.set(key,tags)
    })
    const count=[...works.values()].filter(tags=>tags.has(genre)).length
    return {month,share:works.size?100*count/works.size:null,works:works.size,count,reason:works.size?null:'该范围无AI作品，不计算占比'}
  })
  const changes=points.slice(1).map((p,i)=>{
    const prev=points[i],a=series[i].sample,b=series[i+1].sample
    const comparison=a&&b?compareBoards([b],[a])[0]:null
    return {from:prev.month,to:p.month,change:p.share!==null&&prev.share!==null?p.share-prev.share:null,changedTags:comparison?.changedTags||0,matched:comparison?.matched||0}
  })
  return {commonN,points,changes}
}
export const normalizedWork = (s:string)=>s.trim().toLowerCase()
export function workObservations(series:MonthPoint[],title:string,channel:string) {
  return series.map(({month,sample})=>{
    const base={month,rank:null as number|null,value:null as number|null,metric:sample?.metric||'',tags:'',source:sample?.name||''}
    if(!sample)return {...base,state:'未采集'}
    if(sample.issues.length)return {...base,state:'来源待核验'}
    // Search the full TopN, including rows whose AI label was removed later.
    const matches=sample.rows.filter(r=>normalizedWork(String(r[sample.titleKey]??''))===normalizedWork(title)&&normalizedWork(String(r[sample.channelKey||'']??''))===normalizedWork(channel))
    if(matches.length>1)return {...base,state:'同名同剧场号重复，待确认'}
    if(!matches.length)return {...base,state:`未见于原榜Top${sample.rows.length}，不代表下架`}
    const row=matches[0]
    return {...base,rank:metricNumber(row[sample.rankKey]),value:metricNumber(row[sample.metric||'']),tags:String(row[sample.tagKey]??''),state:'在榜'}
  })
}
export function trackIdentity(board:string,title:string,channel:string){return JSON.stringify([board,normalizedWork(title),normalizedWork(channel)])}
export function candidateWorks(sample:BoardSample) {
  const candidates=sample.ai.map(r=>({board:sample.key,title:String(r[sample.titleKey]??''),channel:String(r[sample.channelKey||'']??''),period:sample.period,rank:metricNumber(r[sample.rankKey])})).filter(w=>w.title)
  const counts=new Map<string,number>()
  candidates.forEach(c=>{const key=trackIdentity(c.board,c.title,c.channel);counts.set(key,(counts.get(key)||0)+1)})
  return candidates.filter(c=>counts.get(trackIdentity(c.board,c.title,c.channel))===1)
}

export function describeContinuity(points:ReturnType<typeof genreTimeline>['points']) {
  const tail=points.slice(-3)
  if(tail.length<3||tail.some(p=>p.share===null))return {title:'连续证据不足',text:'最近三个月未全部具备有效占比，暂不归纳持续趋势。',action:'先补齐缺月或核验异常来源，再决定是否调整研究顺序。'}
  const [a,b,c]=tail.map(p=>p.share!)
  const delta=[b-a,c-b],range=Math.max(a,b,c)-Math.min(a,b,c)
  if(delta.every(d=>d>=3))return {title:'连续两次明显上升',text:'最近三个月同榜题材占比连续上升，每次至少3个百分点。',action:'优先拆解连续在榜作品，并复核标签修订；内容核验后再形成定向收稿需求。'}
  if(delta.every(d=>d<=-3))return {title:'连续两次明显回落',text:'最近三个月同榜题材占比连续下降，每次至少3个百分点。',action:'复查作品出榜和标签变化，降低同质化新增研究优先级；不据此直接取消项目或停投。'}
  if(range<=5)return {title:'近三月相对稳定',text:'最近三个月占比的最高与最低相差不超过5个百分点，暂未出现持续扩张或收缩。',action:'保留常规观察，优先研究具体作品差异，不因单月小幅变化扩大收稿。'}
  return {title:'月度波动，方向待验证',text:'最近三个月未形成连续两次至少3个百分点的同向变化，需结合作品和标签核验。',action:'追踪贡献变化的具体作品，待下一月同口径数据验证后再调整选题优先级。'}
}
