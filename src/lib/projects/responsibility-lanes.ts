import type { ProjectTimelineItem } from "@/hooks/use-project-timeline"

export const RESPONSIBILITY_LANES = ["内容开发", "本地化", "制作准备", "AI制作", "发行上线"] as const
export type ResponsibilityLane = (typeof RESPONSIBILITY_LANES)[number]

export const RESPONSIBILITY_LANE_HELP: Record<ResponsibilityLane, string> = {
  内容开发: "采购合同、前30集、60集完本、剧本修改与定稿",
  本地化: "翻译、审校与双语稿确认",
  制作准备: "围读、美术资产、角色场景确认与制作交接",
  AI制作: "抽卡、分集制作、剪辑修改与完片",
  发行上线: "平台评审、签约交付、投流、上线与归档",
}

type Schedulable = Pick<ProjectTimelineItem, "track" | "title" | "content" | "notes">

export function responsibilityLane(item: Schedulable): ResponsibilityLane {
  if ((RESPONSIBILITY_LANES as readonly string[]).includes(item.track)) return item.track as ResponsibilityLane
  const text = `${item.track} ${item.title} ${item.content || ""} ${item.notes || ""}`
  if (/本地化|翻译|译稿|审校|双语/.test(text)) return "本地化"
  if (/围读|美术|资产|角色|场景|制作交接|承制签约/.test(text)) return "制作准备"
  if (/发行|运营|平台|投流|上线|交付|分发|验收|付款|尾款|算力/.test(text)) return "发行上线"
  if (/抽卡|剪辑|完片|视频|制作|初剪/.test(text)) return "AI制作"
  return "内容开发"
}

export function laneOrder(item: Schedulable) {
  return RESPONSIBILITY_LANES.indexOf(responsibilityLane(item))
}
