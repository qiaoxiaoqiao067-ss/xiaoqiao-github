import type { ClassifiedLine, ScriptSource, StatisticsOptions, StatisticsResult } from "@/lib/statistics/types"
import { countChinese } from "@/lib/statistics/engine"

export const KIND_LABEL: Record<ClassifiedLine["kind"], string> = {
  dialogue: "发声台词", screen: "画面文字", action: "动作说明", heading: "集数与场景", cast: "出场人物",
  unknown: "待确认", frontmatter: "正文前资料", excluded: "已排除",
}

export function scopeLabel(options: StatisticsOptions) {
  if (!options.startEpisode && !options.endEpisode) return "全部正文"
  return `第 ${options.startEpisode || "起始"}—${options.endEpisode || "末"} 集`
}

export function basisLabel(options: StatisticsOptions) {
  return options.basis === "full" ? "全本中文" : options.includeScreenText ? "发声台词＋画面文字" : "发声台词"
}

export function selectedLines(result: StatisticsResult, options: StatisticsOptions) {
  return result.lines.filter((line) => line.kind !== "frontmatter" &&
    (!options.startEpisode || (line.episode !== null && line.episode >= options.startEpisode)) &&
    (!options.endEpisode || (line.episode !== null && line.episode <= options.endEpisode)))
}

export function canConfirmSourceReview(source: ScriptSource) {
  // An acknowledgement can confirm OCR/encoding inspection, but cannot restore
  // unreadable embedded DOCX content. That requires another source file.
  return ["pdf", "doc", "txt", "md"].includes(source.format.toLowerCase())
}

export function needsStatisticsReview(source: ScriptSource, result: StatisticsResult, options: StatisticsOptions, reviewedExtraction: boolean) {
  return result.needsReview || selectedLines(result, options).some((line) => line.kind === "unknown" || line.uncertain) ||
    Boolean(source.requiresReview && (!reviewedExtraction || !canConfirmSourceReview(source)))
}

export function quotationText(source: ScriptSource, result: StatisticsResult, options: StatisticsOptions, pending: boolean) {
  return `《${source.fileName}》本地化字数与报价${pending ? "（待复核）" : ""}\n` +
    `范围：${scopeLabel(options)}\n全本中文：${result.totals.full.toLocaleString("zh-CN")} 字；发声台词：${result.totals.dialogue.toLocaleString("zh-CN")} 字；画面文字：${result.totals.screen.toLocaleString("zh-CN")} 字。\n` +
    `计费范围：${basisLabel(options)}，共 ${result.totals.quoteCharacters.toLocaleString("zh-CN")} 个汉字。\n` +
    `单价：${options.minRate}—${options.maxRate} 元／千字；预估费用：¥${result.totals.minCost.toFixed(2)}—¥${result.totals.maxCost.toFixed(2)}。\n` +
    `口径：只计汉字，不计标点、空白、英文和阿拉伯数字。${options.basis === "full" ? "全本含正文内场景、人物、动作、VO／OS及画面文字。" : `台词排除说话人标签及表演提示。${options.includeVoiceover ? "含 VO／OS／旁白。" : "不含 VO／OS／旁白。"}`}`
}

export function statisticsReport(source: ScriptSource, result: StatisticsResult, options: StatisticsOptions, project: { id: string; title: string } | undefined, reviewedExtraction: boolean) {
  const pending = needsStatisticsReview(source, result, options, reviewedExtraction)
  const corrections = result.lines.filter((line) => options.overrides?.[line.id] || Object.hasOwn(options.contentOverrides || {}, line.id)).map((line) => ({ lineId: line.id, original: line.text, kindOverride: options.overrides?.[line.id] || null, contentOverride: options.contentOverrides?.[line.id] ?? null, resultingKind: line.kind, resultingContent: line.content, han: line.count }))
  const metadata = {
    generatedAt: new Date().toISOString(), fileName: source.fileName, fileHash: source.sourceHash,
    format: source.format, ruleVersion: result.ruleVersion, sourceFileId: source.fileId || null,
    sourceFileKind: source.fileKind || null, sourceVersion: source.sourceVersion ?? null,
    projectId: project?.id || null, projectTitle: project?.title || null,
    selectedRange: { startEpisode: options.startEpisode ?? null, endEpisode: options.endEpisode ?? null },
    options: { ...options, corrections }, reviewedExtraction, needsReview: pending, totals: result.totals,
    episodes: result.episodes, warnings: [...new Set([...source.warnings, ...result.warnings])],
  }
  return `# 本地化字数统计报告\n\n${quotationText(source, result, options, pending)}\n\n` +
    `关联项目：${project?.title || "未关联项目"}\n\n本报告记录文件版本、统计规则和人工修正，不改变项目阶段或合同金额。\n\n` +
    `## 按集明细\n\n| 集数 | 全本中文 | 发声台词 | 画面文字 |\n|---|---:|---:|---:|\n` +
    result.episodes.map((episode) => `| ${episode.episode} | ${episode.full} | ${episode.dialogue} | ${episode.screen} |`).join("\n") +
    `\n\n## 来源、选项与可追溯数据\n\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n`
}

function csvCell(value: string | number | null | undefined) {
  const raw = String(value ?? "")
  // Quoting alone does not prevent spreadsheet formula execution.
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/u.test(raw) || /^[\t\r\n]/u.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

export function statisticsCsv(result: StatisticsResult, options: StatisticsOptions) {
  const header = ["集数", "段落", "行", "分类", "说话人", "识别正文汉字", "计入报价汉字", "VO/OS/旁白", "原文", "计数正文", "复核提示", "人工分类", "人工修正正文"]
  const rows = selectedLines(result, options).map((line) => {
    const dialogue = line.kind === "dialogue" && (options.includeVoiceover !== false || !line.voiceover) ? line.count : 0
    const full = line.kind === "excluded" ? 0 : countChinese(line.text)
    const billable = options.basis === "full" ? full : dialogue + (options.includeScreenText && line.kind === "screen" ? line.count : 0)
    return [line.episode, line.paragraph, line.line, KIND_LABEL[line.kind], line.speaker, line.count, billable, line.voiceover ? "是" : "否", line.text, line.content, line.reason, options.overrides?.[line.id], options.contentOverrides?.[line.id]]
  })
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
}

export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_")
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
