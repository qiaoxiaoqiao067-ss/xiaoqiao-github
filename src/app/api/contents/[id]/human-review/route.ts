import { NextResponse } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"

const reviewSchema = z.object({
  verdict: z.enum(["审核通过", "退修", "不采用", "推荐开发", "修改后复审", "暂不开发"]),
  score: z.number().int().min(0).max(100),
  notes: z.string().trim().min(1).max(10000),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const contentId = z.string().uuid().safeParse((await context.params).id)
    if (!contentId.success) return NextResponse.json({ error: "Invalid content id" }, { status: 400 })
    const input = reviewSchema.safeParse(await request.json())
    if (!input.success) return NextResponse.json({ error: "请完整填写人工结论、评分和意见" }, { status: 400 })

    const { data: content } = await serviceClient.from("contents").select("id").eq("id", contentId.data).eq("user_id", user.id).maybeSingle()
    if (!content) return NextResponse.json({ error: "内容项目不存在" }, { status: 404 })

    await serviceClient.from("content_reviews").update({ is_final: false }).eq("content_id", contentId.data).eq("user_id", user.id).eq("reviewer_type", "human")
    const verdictMap: Record<string, "审核通过" | "退修" | "不采用"> = {
      推荐开发: "审核通过",
      修改后复审: "退修",
      暂不开发: "不采用",
    }
    const verdict = verdictMap[input.data.verdict] || input.data.verdict
    const { data, error } = await serviceClient
      .from("content_reviews")
      .insert({
        content_id: contentId.data,
        user_id: user.id,
        reviewer_type: "human",
        status: "completed",
        score: input.data.score,
        result: { verdict, notes: input.data.notes },
        prompt_version: "human-editor-v2",
        is_final: true,
      })
      .select()
      .single()
    if (error) throw error

    // `contents.status` only describes the processing lifecycle. Business
    // decisions live in the final human review and project records.
    await serviceClient.from("contents").update({ status: "reviewed", updated_at: new Date().toISOString() }).eq("id", contentId.data).eq("user_id", user.id)
    return NextResponse.json({ review: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "保存失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
