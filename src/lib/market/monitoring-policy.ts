export const MARKET_SAMPLE_LIMITS = { day: 50, week: 300, month: 500 } as const
export type MarketPeriodKind = keyof typeof MARKET_SAMPLE_LIMITS

export function marketBoardKey(source: string, fileName: string) {
  const provider = source.startsWith("ADX") ? "ADX" : source
  const platform = ["DramaBox", "DramaWave", "FreeReels", "GoodShort", "MoboReels", "NetShort", "ReelShort", "ShortMax", "Vigloo", "StardustTV", "PineDrama", "FlickReels", "Melolo"].find(name => fileName.toLowerCase().includes(name.toLowerCase()))
  const board = /(?:TK|TikTok).*?(?:热播|榜)/i.test(fileName) ? "tiktok-hot" : platform ? `platform:${platform}` : /短剧(?:排行|[日周月])?榜/.test(fileName) ? "short-drama" : fileName
  return `${provider}:${board}`
}

export function latestBoardImports<T extends { source_name: string; file_name: string; period_label: string | null; created_at: string }>(imports: T[]): T[] {
  const seen = new Set<string>()
  return [...imports].sort((a,b) => b.created_at.localeCompare(a.created_at)).filter(item => {
    const key = `${item.period_label}:${marketBoardKey(item.source_name,item.file_name)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Rank is meaningful only within one source/board/period. Keep raw data intact. */
export function sampleMarketRows<T>(rows: T[], kind: MarketPeriodKind, rank: (row: T) => number | null): T[] {
  return rows.map((row, index) => ({ row, index, rank: rank(row) }))
    .sort((a, b) => (a.rank && a.rank > 0 ? a.rank : Infinity) - (b.rank && b.rank > 0 ? b.rank : Infinity) || a.index - b.index)
    .slice(0, MARKET_SAMPLE_LIMITS[kind]).map(item => item.row)
}
