export type SourceLine = { id: string; paragraph: number; line: number; text: string }
export type ScriptSource = {
  fileName: string
  format: string
  sourceHash: string
  lines: SourceLine[]
  warnings: string[]
  requiresReview?: boolean
  fileId?: string
  fileKind?: "project" | "content"
  projectId?: string
  sourceVersion?: number
}
export type LineKind = "dialogue" | "screen" | "action" | "heading" | "cast" | "unknown" | "frontmatter" | "excluded"
export type StatisticsOptions = {
  startEpisode?: number
  endEpisode?: number
  includeVoiceover?: boolean
  includeScreenText?: boolean
  basis?: "dialogue" | "full"
  minRate?: number
  maxRate?: number
  overrides?: Record<string, "dialogue" | "screen" | "action" | "excluded">
  contentOverrides?: Record<string, string>
  bodyStartLineId?: string
}
export type ClassifiedLine = SourceLine & {
  episode: number | null
  kind: LineKind
  speaker?: string
  content: string
  count: number
  voiceover?: boolean
  uncertain?: boolean
  reason?: string
}
export type StatisticsResult = {
  ruleVersion: string
  totals: { full: number; dialogue: number; screen: number; quoteCharacters: number; minCost: number; maxCost: number }
  episodes: { episode: number; full: number; dialogue: number; screen: number }[]
  lines: ClassifiedLine[]
  warnings: string[]
  episodeNumbers: number[]
  needsReview: boolean
}
