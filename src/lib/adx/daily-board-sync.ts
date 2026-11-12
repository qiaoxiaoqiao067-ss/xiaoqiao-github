import {z} from 'zod'
import {makeDailyBrief} from './daily-brief'
import {marketBoardKey,MARKET_SAMPLE_LIMITS} from '../market/monitoring-policy'
export const AUTO_DAILY_SOURCE='ADX自动日榜'
export const DAILY_SYNC_SOURCE='ADX同步:run'
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s)
const metric=z.number().finite().nonnegative().nullable().optional()
const filters=z.object({extra_filters:z.literal(false),merge_same_drama:z.literal(false),only_new_drama:z.literal(false)})
const rowSchema=z.object({board:z.string(),rank:z.number().int().positive(),title:z.string().trim().min(1),tags:z.array(z.string()),sort:z.string(),channel:z.string().nullable().optional(),material_total:metric,material_new:metric,estimated_exposure:metric,playback_increment:metric,playback_total:metric,heat:metric,episodes:metric,online_date:z.string().nullable().optional(),first_ad_date:z.string().nullable().optional(),source_url:z.string().url(),captured_at:z.string().datetime({offset:true}),raw:z.record(z.string(),z.unknown())})
const boardSchema=z.object({name:z.string(),actual:z.number().int().positive(),sort:z.enum(['总素材数','新素材数','播放增量','热度']),data_date:date,status:z.enum(['success','partial_source_shortfall']),note:z.string().optional(),filters})
const pendingBoardSchema=z.object({name:z.string(),actual:z.literal(0),sort:z.null(),data_date:z.null(),status:z.literal('awaiting_source_publication'),note:z.string().trim().min(1),filters:z.null(),requested_data_date:date,latest_available_date:date.nullable().optional()})
const manifestBoardsSchema=z.array(z.union([boardSchema,pendingBoardSchema])).min(1).max(14)
export function pendingDailyBoards(manifest:Record<string,unknown>){return manifestBoardsSchema.parse(manifest.boards).filter(b=>b.status==='awaiting_source_publication').map(b=>b.name)}
const supported=new Set(['短剧排行榜','TikTok短剧热播榜','DramaBox','DramaWave','FreeReels','GoodShort','MoboReels','NetShort','ReelShort','ShortMax','StardustTV','Vigloo','PineDrama','FlickReels'])
export type DailyBoardImport={source_name:string;period_label:string;file_name:string;row_count:number;columns:string[];raw_rows:Record<string,unknown>[];created_at:string}
export type DailySyncStatus={runKey:string;checkedAt:string;requestedDate:string|null;dataDate:string|null;state:'synced'|'collection_blocked'|'trial_skipped'|'sync_failed';boards:number;records:number;samples:number;note:string;checksum?:string;missingBoards?:string[]}
export function prepareDailyBoards(manifest:Record<string,unknown>,standard:unknown,runKey:string,checksum:string):DailyBoardImport[]{
  if(!/^completed|^success/.test(String(manifest.status))||/trial/.test(String(manifest.status)))throw new Error('只有正式完成并核验过日期的采集批次可进入日榜')
  const parsedDate=date.parse(manifest.data_date)
  const input=z.object({data_date:date,rows:z.array(rowSchema).min(1).max(10000)}).parse(standard)
  const declared=manifestBoardsSchema.parse(manifest.boards)
  const boards=declared.filter((b):b is z.infer<typeof boardSchema>=>b.status!=='awaiting_source_publication')
  if(declared.some(b=>b.status==='awaiting_source_publication'&&b.requested_data_date!==parsedDate))throw new Error('缺榜请求日期与批次不一致')
  if(input.data_date!==parsedDate||manifest.actual_records!==input.rows.length)throw new Error('清单日期或总条数与标准化数据不一致')
  if(new Set(declared.map(b=>b.name)).size!==declared.length||declared.some(b=>!supported.has(b.name))||input.rows.some(r=>!boards.some(b=>b.name===r.board)))throw new Error('榜单名称缺失、重复或不支持')
  const collectedAt=makeDailyBrief(manifest,null,runKey).collectedAt
  return boards.map(b=>{
    if(b.data_date!==parsedDate)throw new Error(`${b.name}实际数据日与批次不一致`)
    const rows=input.rows.filter(r=>r.board===b.name).sort((a,b)=>a.rank-b.rank)
    if(rows.length!==b.actual||rows.some((r,i)=>r.rank!==i+1||r.sort!==b.sort))throw new Error(`${b.name}条数、排名连续性或排序不一致`)
    const file_name=`${b.name}_日榜_${parsedDate}.json`
    const raw_rows=rows.map(r=>({
      '排名':r.rank,'剧名':r.title,'标签':r.tags.join(','),'剧场号':r.channel||'',
      '投放平台':b.name==='短剧排行榜'?String(r.raw['投放产品']??''):b.name==='TikTok短剧热播榜'?'':b.name,
      '总素材数':r.material_total??null,'新素材数':r.material_new??null,'预估曝光':r.estimated_exposure??null,
      '播放增量':r.playback_increment??null,'播放总量':r.playback_total??null,'热度':r.heat??null,
      '上线时间':r.online_date||'','首次投放时间':r.first_ad_date||'','集数':r.episodes??null,
      '来源链接':r.source_url,'数据日期':parsedDate,'采集时间':r.captured_at,'采集排序':b.sort,
      '采集筛选':JSON.stringify(b.filters),'采集备注':b.note||'',
      '采集校验':/待核验|异常|未确认/.test(b.note||'')?b.note:'',
      '采集批次':runKey,'来源校验和':checksum,'原始页面':JSON.stringify(r.raw),
    }))
    return {source_name:AUTO_DAILY_SOURCE,period_label:parsedDate,file_name,row_count:raw_rows.length,columns:Object.keys(raw_rows[0]),raw_rows,created_at:collectedAt}
  })
}
export function dailyBatchTotals(imports:DailyBoardImport[]){return {boards:imports.length,records:imports.reduce((n,i)=>n+i.row_count,0),samples:imports.reduce((n,i)=>n+Math.min(i.row_count,MARKET_SAMPLE_LIMITS.day),0)}}
export function dailyBoardIdentity(item:DailyBoardImport){return marketBoardKey(item.source_name,item.file_name)}
