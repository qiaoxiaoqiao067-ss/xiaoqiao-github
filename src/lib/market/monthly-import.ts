import { adxPlatformName } from './monitoring-policy'
import { boardSamples, compareBoards } from './board-analysis'

export type MonthlyBoardType = 'ad' | 'tk' | 'platform'
type Row = Record<string, unknown>
const text = (value: unknown) => String(value ?? '').trim()

/** A playback column is shared by TikTok and platform exports; it is not a source identity. */
export function detectMonthlyBoard(fileName: string, sheetName: string, columns: string[], sourceName = ''): MonthlyBoardType {
  const named = `${fileName} ${sheetName}`
  if (/(?:TikTok|TK).*?(?:热播|榜)/i.test(named)) return 'tk'
  if (/短剧(?:排行|[日周月])?榜/.test(named)) return 'ad'
  if (adxPlatformName(named) || /平台榜|平台排行|短剧平台|应用平台|App榜/i.test(named)) return 'platform'
  if (columns.includes('__market_signal_platform') || /^ADX月榜:platform:/.test(sourceName)) return 'platform'
  if (columns.includes('__market_signal_tk') || /^ADX月榜:tk:/.test(sourceName) || columns.some(name => /^(剧场号|channel)$/i.test(name))) return 'tk'
  return 'ad'
}

export function monthFromValue(value: unknown) {
  const match = text(value).match(/(20\d{2})\s*(?:年|[-_/.])\s*(1[0-2]|0?[1-9])(?!\d)(?:\s*月)?/)
  return match ? `${match[1]}-${match[2].padStart(2, '0')}` : ''
}

export function detectSheetMonth(fileName: string, sheetName: string, rows: Row[]) {
  const named = monthFromValue(`${fileName} ${sheetName}`)
  if (named) return { value: named, evidence: '文件名/工作表' }
  for (const row of rows.slice(0, 30)) {
    const key = Object.keys(row).find(name => /统计期|榜单月|数据月|所属月|月份|month|period/i.test(name))
    const found = key ? monthFromValue(row[key]) : ''
    if (found) return { value: found, evidence: `表内字段：${key}` }
  }
  return { value: '', evidence: '未识别' }
}

/** Preserve source values and add only provenance that the export filename establishes. */
export function monthlyImportRows(fileName: string, type: MonthlyBoardType, rows: Row[]) {
  const platform = type === 'platform' ? adxPlatformName(fileName) : undefined
  const sort = fileName.match(/(?:^|[_-])(总素材数|新素材数|播放增量|热度)(?=[_.-]|$)/)?.[1]
  return rows.map(row => ({ ...row, ...(platform && !row['平台'] ? { 平台: platform } : {}), ...(sort ? { 采集排序: sort } : {}) }))
}

export function monthlyComparisonReady(imports: Parameters<typeof boardSamples>[0], period: string, previous: string) {
  if (!previous) return false
  const comparisons = compareBoards(boardSamples(imports.filter(item => item.period_label === period), 'month'), boardSamples(imports.filter(item => item.period_label === previous), 'month'))
  return comparisons.length > 0 && comparisons.every(item => !item.reason)
}
