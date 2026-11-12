import { boardSamples } from './board-analysis'
import {marketBoardKey} from './monitoring-policy'
export type ImportMeta = {id:string; source_name:string; file_name:string; period_label:string|null; created_at:string; updated_at:string}
export function periodKind(value:string): 'month'|'week'|'day' { return /周|W\d/i.test(value)?'week':/日$|^\d{4}-\d{2}-\d{2}$/.test(value)?'day':'month' }
export function periodOrder(value:string) { const n=value.match(/\d+/g)||[];return Number(n[0]||0)*10000+Number(n[1]||0)*100+Number(n[2]||0) }
export function comparisonPeriod(metadata:ImportMeta[],period:string,choice:string) {
  const periods=[...new Set(metadata.filter(isBoardImport).map(s=>s.period_label).filter((s):s is string=>!!s))].filter(p=>periodKind(p)===periodKind(period)&&p!==period)
  return periods.includes(choice)?choice:periods.filter(p=>periodOrder(p)<periodOrder(period)).sort((a,b)=>periodOrder(b)-periodOrder(a))[0]||''
}
export function isBoardImport(item:{source_name:string}) { return item.source_name!=='中文名映射'&&!/^(外部信号:|市场版本:|ADX日报:|市场研究:)/.test(item.source_name) }
export function requestedImports<T extends ImportMeta>(metadata:T[],period:string,comparison:string) {
  const currentKeys=new Set(metadata.filter(m=>m.period_label===period&&isBoardImport(m)).map(m=>marketBoardKey(m.source_name,m.file_name)))
  return metadata.filter(m=>m.source_name==='中文名映射'||m.period_label===period||!!comparison&&m.period_label===comparison&&(!isBoardImport(m)||currentKeys.has(marketBoardKey(m.source_name,m.file_name))))
}
export function analysisSnapshot<T extends ImportMeta & {raw_rows:Record<string,unknown>[]}>(item:T) {
  if(!isBoardImport(item)) return {rows:item.raw_rows,issues:[] as string[]}
  const sample=boardSamples([item],periodKind(item.period_label||''))[0]
  // Validate the full source before sending only TopN. Future dates outside TopN still block comparisons.
  return {rows:sample?.rankKey ? sample.rows : item.raw_rows,issues:sample?.issues || ['未识别到排名字段，需核验原始文件']}
}
