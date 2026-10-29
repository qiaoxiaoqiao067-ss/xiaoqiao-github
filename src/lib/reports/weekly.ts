export const WEEKLY_PAGE_KEYS = ["p4", "p7", "p8", "p9"] as const

export type WeeklyPageKey = (typeof WEEKLY_PAGE_KEYS)[number]

export type WeeklySections = Record<WeeklyPageKey, string>

export const WEEKLY_PAGE_META: Record<WeeklyPageKey, { page: string; title: string; hint: string }> = {
  p4: { page: "P4", title: "本周工作完成情况", hint: "模块｜完成情况｜进度｜备注" },
  p7: { page: "P7", title: "存在问题及改进事项", hint: "1–2项：具体表现、原因、改进动作" },
  p8: { page: "P8", title: "下周工作计划", hint: "模块｜计划内容｜进度目标｜备注" },
  p9: { page: "P9", title: "复盘结论与改善计划", hint: "不超过3条：本周发现—判断—后续改善" },
}

export function emptyWeeklySections(): WeeklySections {
  return { p4: "", p7: "", p8: "", p9: "" }
}

export function serializeWeeklySections(sections: WeeklySections) {
  return WEEKLY_PAGE_KEYS.map((key) => {
    const meta = WEEKLY_PAGE_META[key]
    return `${meta.page} ${meta.title}\n${sections[key].trim()}`
  }).join("\n\n")
}

export function parseWeeklySections(content: string): WeeklySections {
  const sections = emptyWeeklySections()
  WEEKLY_PAGE_KEYS.forEach((key, index) => {
    const meta = WEEKLY_PAGE_META[key]
    const next = WEEKLY_PAGE_KEYS[index + 1]
    const nextPage = next ? WEEKLY_PAGE_META[next].page : null
    const pattern = nextPage
      ? new RegExp(`${meta.page}\\s+${meta.title}\\s*\\n([\\s\\S]*?)(?=\\n\\n${nextPage}\\s+)`)
      : new RegExp(`${meta.page}\\s+${meta.title}\\s*\\n([\\s\\S]*)$`)
    sections[key] = content.match(pattern)?.[1]?.trim() || ""
  })
  if (!WEEKLY_PAGE_KEYS.some((key) => sections[key]) && content.trim()) sections.p4 = content.trim()
  return sections
}

