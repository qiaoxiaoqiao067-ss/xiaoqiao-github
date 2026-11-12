export const DAILY_BRIEF_SOURCE = 'ADX日报:run'
export type DailySignal = {title:string;fact:string;judgment:string;action:string}
export type DailyBrief = {
  runKey:string; dataDate:string|null; requestedDate:string|null; collectedAt:string; status:string
  actual:number|null; target:number|null; boardCount:number|null; note:string; scope:string
  signals:DailySignal[]; report:string|null
}
const str=(x:unknown)=>typeof x==='string'?x:''
const number=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)?x:null
const date=(x:unknown)=>/^\d{4}-\d{2}-\d{2}$/.test(str(x))?str(x):null
export function parseDailySignals(report:string):DailySignal[] {
  const section=report.match(/^##\s*2[.、．].*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m)?.[1]||''
  return section.split(/\n(?=\d+[）).、])/).map(block=>{
    const title=block.match(/^\s*\d+[）).、]\s*(.+)/)?.[1]?.trim()
    if(!title)return null
    const field=(name:string)=>block.match(new RegExp(`(?:^|\\n)${name}[：:]([^]*?)(?=\\n(?:事实|判断|行动)[：:]|$)`))?.[1]?.trim()||''
    return {title,fact:field('事实'),judgment:field('判断'),action:field('行动')}
  }).filter((x):x is DailySignal=>!!x).slice(0,3)
}
export function makeDailyBrief(manifest:Record<string,unknown>, report:string|null, runKey:string):DailyBrief {
  const shanghai=str(manifest.generated_at_shanghai)
  const time=str(manifest.checked_at)||str(manifest.checked_at_shanghai)||str(manifest.collected_at)||str(manifest.generated_at)|| (shanghai?shanghai.replace(' ','T')+'+08:00':'')
  if(!time||!Number.isFinite(Date.parse(time)))throw new Error(`${runKey}缺少可确认的采集/整理时间`)
  const dataDate=date(manifest.data_date)
  const status=str(manifest.status)||'unknown'
  const usableReport=report && dataDate && /^completed|^success/.test(status) ? report : null
  if(usableReport&&!usableReport.split('\n')[0].includes(dataDate!))throw new Error(`${runKey}日报标题日期与清单不一致`)
  return {runKey,dataDate,requestedDate:date(manifest.requested_data_date)||dataDate,collectedAt:new Date(time).toISOString(),status,actual:number(manifest.actual_records)??number(manifest.verified_collected_records),target:number(manifest.target_records),boardCount:number(manifest.collected_ranking_count)??number(manifest.ranking_count)??(Array.isArray(manifest.boards)?manifest.boards.length:null),note:str(manifest.required_user_action)||str(manifest.missing_note)||str(manifest.observed_state)||str(manifest.date_note),scope:str(manifest.scope)||'原日报采样口径见全文；与市场看板的日50/周300/月500独立呈现。',signals:usableReport?parseDailySignals(usableReport):[],report:usableReport}
}
export function dailyBriefState(runs:DailyBrief[], now=new Date()) {
  const sorted=[...runs].sort((a,b)=>b.collectedAt.localeCompare(a.collectedAt))
  const latest=sorted[0]||null
  const report=sorted.filter(r=>r.report&&r.dataDate).sort((a,b)=>b.dataDate!.localeCompare(a.dataDate!)||b.collectedAt.localeCompare(a.collectedAt))[0]||null
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now)
  const get=(name:string)=>parts.find(p=>p.type===name)!.value
  // The existing task runs 10:30 Shanghai and publishes the previous data day.
  const delta=Number(get('hour'))*60+Number(get('minute'))<630?2:1
  const expectedDate=new Date(Date.UTC(Number(get('year')),Number(get('month'))-1,Number(get('day'))-delta)).toISOString().slice(0,10)
  return {latest,report,expectedDate,stale:!report?.dataDate||report.dataDate<expectedDate}
}
