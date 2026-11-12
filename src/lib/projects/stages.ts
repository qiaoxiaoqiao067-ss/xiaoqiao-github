export const PROJECT_STAGES = ["采购与合同", "剧本开发", "本地化与围读", "制作与上线", "完成归档"] as const
export type ProjectStage = (typeof PROJECT_STAGES)[number]
export const PROJECT_STAGE_DETAILS: Record<ProjectStage, string> = {
  "采购与合同": "拟购买、合同推进",
  "剧本开发": "前30集、后30集、整体修改、完本定稿",
  "本地化与围读": "外部译稿验收、双语稿资料、全员围读",
  "制作与上线": "美术资产、抽卡制作、成片交付、上线",
  "完成归档": "资料归档、项目复盘",
}
const ALIASES: Record<string, ProjectStage> = {
  "拟购买": "采购与合同", "合同审批": "采购与合同", "拟购买/合同审批": "采购与合同", "拟购买/合同推进": "采购与合同",
  "正式推进": "剧本开发", "立项选题": "剧本开发", "开发立项": "剧本开发", "分集与剧本": "剧本开发", "中文稿修改": "剧本开发", "剧本修改": "剧本开发", "剧本定稿": "剧本开发", "前30集": "剧本开发", "60集完本": "剧本开发",
  "本地化交付": "本地化与围读", "英语本地化": "本地化与围读", "双语稿": "本地化与围读", "双语稿确认": "本地化与围读", "本地化审校": "本地化与围读", "围读": "本地化与围读",
  "制作交接": "制作与上线", "制作中": "制作与上线", "待上线": "制作与上线", "已上线": "制作与上线",
  "已完成": "完成归档", "归档": "完成归档",
}
export function normalizeProjectStage(stage?: string | null): ProjectStage {
  if (PROJECT_STAGES.includes(stage as ProjectStage)) return stage as ProjectStage
  return ALIASES[stage || ""] || PROJECT_STAGES[0]
}
export function projectStageProgress(stage?: string | null) {
  return (PROJECT_STAGES.indexOf(normalizeProjectStage(stage)) + 1) * 20
}
export function normalizeProjectWorkflow<T extends { stage: string; progress: number }>(project: T): T {
  const stage = normalizeProjectStage(project.stage)
  return { ...project, stage, progress: projectStageProgress(stage) }
}
