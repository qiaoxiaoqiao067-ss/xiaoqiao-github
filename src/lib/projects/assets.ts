import { normalizeProjectStage, PROJECT_STAGES, type ProjectStage } from "@/lib/projects/stages"

export const PROJECT_STAGE_ASSET_CATEGORIES: Record<ProjectStage, readonly string[]> = {
  "合同中": ["正式合同", "发票", "付款资料", "其他合同资料"],
  "剧本开发": ["剧本修改稿", "最终中文剧本", "双语剧本", "责编意见"],
  "本地化": ["翻译稿", "审校稿", "术语表", "字数统计报告"],
  "制作准备（美术资产、围读）": ["美术资产", "围读材料", "会议材料", "制作交接"],
  "AI制作": ["抽卡资料", "制作材料", "分集成片", "交付文件"],
  "发行投流": ["发行材料", "投流素材", "上线数据", "项目复盘", "其他附件"],
}

const LEGACY_CATEGORY_STAGE: Record<string, ProjectStage> = {
  "剧本采购合同": "合同中",
  "剧本修改稿": "剧本开发",
  "中文完稿": "剧本开发",
  "最终中文剧本": "剧本开发",
  "双语剧本": "剧本开发",
  "责编意见": "剧本开发",
  "翻译稿": "本地化",
  "双语稿": "本地化",
  "字数统计报告": "本地化",
  "围读材料": "制作准备（美术资产、围读）",
  "会议材料": "制作准备（美术资产、围读）",
  "制作交接": "制作准备（美术资产、围读）",
  "制作材料": "AI制作",
  "交付文件": "AI制作",
  "项目复盘": "发行投流",
  "其他附件": "发行投流",
}

export function assetStage(stage?: string | null, category?: string | null): ProjectStage {
  if (stage && PROJECT_STAGES.includes(stage as ProjectStage)) return stage as ProjectStage
  if (LEGACY_CATEGORY_STAGE[category || ""]) return LEGACY_CATEGORY_STAGE[category || ""]
  if (stage) return normalizeProjectStage(stage)
  return "发行投流"
}

export function defaultAssetCategory(stage?: string | null) {
  return PROJECT_STAGE_ASSET_CATEGORIES[normalizeProjectStage(stage)][0]
}
