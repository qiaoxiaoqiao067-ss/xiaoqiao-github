import {marketBoardKey} from './monitoring-policy'
export type MarketSignal='ad'|'tk'|'platform'|'other'
/** Known board identity takes precedence over nullable columns in normalized captures. */
export function knownBoardSignal(fileName:string):MarketSignal|null {
 const key=marketBoardKey('ADX',fileName)
 return key.endsWith(':tiktok-hot')?'tk':key.includes(':platform:')?'platform':key.endsWith(':short-drama')?'ad':null
}
export function displayMetric(signal:MarketSignal,row:Record<string,unknown>):string {
 if(signal==='ad')return '预估曝光'
 if(signal==='tk')return '播放增量'
 if(signal==='platform'){
  if(row['采集排序']==='热度')return '热度'
  if(row['采集排序']==='播放增量')return '播放增量'
  return Object.hasOwn(row,'播放增量')?'播放增量':Object.hasOwn(row,'热度')?'热度':''
 }
 return ''
}
export function displayNumber(value:unknown):number|null {
 const raw=String(value??'').trim().replace(/,/g,'')
 if(!raw)return null
 const plain=Number(raw)
 if(Number.isFinite(plain))return plain
 const n=Number.parseFloat(raw.replace(/[^\d.-]/g,''))
 if(!Number.isFinite(n))return null
 return /亿/.test(raw)?n*1e8:/万/.test(raw)?n*1e4:n
}
