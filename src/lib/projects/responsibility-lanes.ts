import type { ProjectTimelineItem } from "@/hooks/use-project-timeline"
import { PROJECT_STAGES, PROJECT_STAGE_DETAILS, type ProjectStage } from "@/lib/projects/stages"

export const RESPONSIBILITY_LANES = PROJECT_STAGES
export type ResponsibilityLane = ProjectStage
export const RESPONSIBILITY_LANE_HELP = PROJECT_STAGE_DETAILS

type Schedulable = Pick<ProjectTimelineItem, "track" | "title" | "content" | "notes">

export function responsibilityLane(item: Schedulable): ResponsibilityLane {
  if ((RESPONSIBILITY_LANES as readonly string[]).includes(item.track)) return item.track as ResponsibilityLane
  const text = `${item.track} ${item.title} ${item.content || ""} ${item.notes || ""}`
  if (/合同|签约|采购|版权|发票|付款|首款|尾款/.test(text)) return "合同中"
  if (/本地化|本土化|翻译|译稿|审校|双语|术语/.test(text)) return "本地化"
  if (/围读|美术|资产|角色|场景|制作交接|承制签约/.test(text)) return "制作准备（美术资产、围读）"
  if (/发行|运营|平台|投流|上线|分发|宣发/.test(text)) return "发行投流"
  if (/制作部|抽卡|剪辑|完片|视频|制作|初剪|成片|验收|交付|算力/.test(text)) return "AI制作"
  return "剧本开发"
}

export function laneOrder(item: Schedulable) {
  return RESPONSIBILITY_LANES.indexOf(responsibilityLane(item))
}
