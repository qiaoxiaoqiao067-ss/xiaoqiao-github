import {z} from 'zod'
import type {MarketResearch} from './research'
export const WATCH_SOURCE='市场研究:watch'
export const ARCHIVE_SOURCE='市场研究:archive'
export const watchStatus=z.enum(['观察中','优先拆解','暂停观察','已归档'])
export const createRecordSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('watch'),sourceId:z.string().uuid(),sourceVersion:z.string(),title:z.string().trim().min(1).max(500),channel:z.string().max(500)}),
  z.object({kind:z.literal('archive'),requestId:z.string().uuid(),period:z.string().min(1).max(100),comparison:z.string().max(100),title:z.string().trim().min(1).max(200),note:z.string().max(10000),sources:z.array(z.object({id:z.string().uuid(),updated_at:z.string()})).min(1).max(200)})
])
export const patchWatchSchema=z.object({id:z.string().uuid(),updated_at:z.string().min(1),status:watchStatus,note:z.string().max(10000)})
export type WatchRecord={kind:'watch';board:string;title:string;channel:string;status:z.infer<typeof watchStatus>;note:string;startedPeriod:string;source:{id:string;file_name:string;updated_at:string};initialRank:number|null;actor:string}
export type ArchiveRecord={kind:'archive';title:string;period:string;comparison:string;note:string;research:MarketResearch;sources:{id:string;file_name:string;period_label:string|null;updated_at:string}[];actor:string;rulesVersion:string}
export type ResearchRecord={id:string;created_at:string;updated_at:string;payload:WatchRecord|ArchiveRecord}
