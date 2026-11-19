export const PROJECT_STAGES = ["合同中", "剧本开发", "本地化", "制作准备（美术资产、围读）", "AI制作", "发行投流"] as const
export type ProjectStage = (typeof PROJECT_STAGES)[number]

export const PROJECT_STAGE_DETAILS: Record<ProjectStage, string> = {
  "合同中": "正式合同、发票与付款资料",
  "剧本开发": "剧本修改、中文完稿与版本确认",
  "本地化": "翻译、审校、双语稿与术语统一",
  "制作准备（美术资产、围读）": "围读、美术资产、角色场景与制作交接",
  "AI制作": "抽卡、分集制作、剪辑修改与成片交付",
  "发行投流": "发行素材、平台上线、投流数据与复盘",
}

export const PROJECT_STAGE_WEIGHTS: Record<ProjectStage, number> = {
  "合同中": 10,
  "剧本开发": 20,
  "本地化": 20,
  "制作准备（美术资产、围读）": 20,
  "AI制作": 20,
  "发行投流": 10,
}

const ALIASES: Record<string, ProjectStage> = {
  "采购与合同": "合同中", "拟购买": "合同中", "合同审批": "合同中", "拟购买/合同审批": "合同中", "拟购买/合同推进": "合同中", "正式推进": "合同中",
  "立项选题": "剧本开发", "开发立项": "剧本开发", "分集与剧本": "剧本开发", "中文稿修改": "剧本开发", "剧本修改": "剧本开发", "剧本定稿": "剧本开发", "前30集": "剧本开发", "60集完本": "剧本开发",
  "本地化交付": "本地化", "英语本地化": "本地化", "双语稿": "本地化", "双语稿确认": "本地化", "本地化审校": "本地化", "本地化与围读": "本地化",
  "围读": "制作准备（美术资产、围读）", "制作准备": "制作准备（美术资产、围读）", "美术资产": "制作准备（美术资产、围读）", "制作交接": "制作准备（美术资产、围读）",
  "制作与上线": "AI制作", "制作中": "AI制作",
  "待上线": "发行投流", "已上线": "发行投流", "已完成": "发行投流", "完成归档": "发行投流", "归档": "发行投流",
}

export function normalizeProjectStage(stage?: string | null): ProjectStage {
  if (PROJECT_STAGES.includes(stage as ProjectStage)) return stage as ProjectStage
  return ALIASES[stage || ""] || PROJECT_STAGES[0]
}

export function projectStageProgress(stage?: string | null) {
  const normalized = normalizeProjectStage(stage)
  const index = PROJECT_STAGES.indexOf(normalized)
  return PROJECT_STAGES.slice(0, index + 1).reduce((total, item) => total + PROJECT_STAGE_WEIGHTS[item], 0)
}

export function normalizeProjectWorkflow<T extends { stage: string; progress: number }>(project: T): T {
  const stage = normalizeProjectStage(project.stage)
  return { ...project, stage, progress: projectStageProgress(stage) }
}
