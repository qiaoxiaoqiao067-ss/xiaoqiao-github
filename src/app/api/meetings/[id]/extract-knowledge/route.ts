import { NextResponse } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { runCodex } from "@/lib/ai/codex"

const candidateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  item_type: z.enum(["爆款拆解", "责编经验", "SOP", "项目复盘", "会议沉淀", "调研结论", "其他方法"]),
  category: z.string().trim().max(80).default("会议沉淀"),
  content: z.string().trim().min(1).max(8000),
})

const resultSchema = z.object({ candidates: z.array(candidateSchema).max(3) })

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("AI未返回可识别的知识草稿")
  return JSON.parse(cleaned.slice(start, end + 1)) as unknown
}

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const id = z.string().uuid().safeParse((await context.params).id)
    if (!id.success) return NextResponse.json({ error: "会议记录不存在" }, { status: 400 })

    const { data: meeting, error } = await serviceClient.from("meetings")
      .select("title,meeting_type,meeting_date,transcript,summary,decisions,next_actions")
      .eq("id", id.data).eq("user_id", user.id).maybeSingle()
    if (error) throw error
    if (!meeting) return NextResponse.json({ error: "会议记录不存在或无权访问" }, { status: 404 })

    const source = [meeting.transcript, meeting.summary, meeting.decisions].filter(Boolean).join("\n\n")
    if (!source.trim()) return NextResponse.json({ error: "这条会议记录还没有原文、摘要或结论，暂时无法提取知识" }, { status: 400 })

    const output = await runCodex(`你是个人内容工作台的知识编辑。请从一条会议记录中提取真正可复用的知识候选，而不是复述会议流水账。

会议：${meeting.title}
类型：${meeting.meeting_type}
日期：${meeting.meeting_date || "未记录"}

会议材料：
${source.slice(0, 30000)}

要求：
1. 最多提取3条；没有可复用知识时返回空数组。
2. 只提取可跨项目复用的方法、判断标准、案例规律、SOP或项目复盘结论。
3. 不把待办事项、人员安排、未确认猜测当作知识。
4. 区分事实与判断，不补写会议中不存在的内容。
5. content使用简洁中文，建议采用“结论—适用场景—使用方法/注意事项”结构。
6. item_type只能是：爆款拆解、责编经验、SOP、项目复盘、会议沉淀、调研结论、其他方法。

只输出JSON：
{"candidates":[{"title":"标题","item_type":"责编经验","category":"分类","content":"正文"}]}`)
    const parsed = resultSchema.parse(parseJson(output))
    return NextResponse.json(parsed)
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "知识提取失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
