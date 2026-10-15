import { NextResponse } from "next/server"
import { z } from "zod"
import { enqueueReview } from "@/lib/reviews/review-runner"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const parsedId = z.string().uuid().safeParse((await context.params).id)
    if (!parsedId.success) return NextResponse.json({ error: "Invalid content id" }, { status: 400 })
    const contentId = parsedId.data

    const { data: content, error } = await serviceClient.from("contents").select("id").eq("id", contentId).eq("user_id", user.id).single()
    if (error || !content) return NextResponse.json({ error: "内容项目不存在" }, { status: 404 })
    const { data: file, error: fileError } = await serviceClient.from("content_files").select("id").eq("content_id", contentId).eq("user_id", user.id).eq("parse_status", "ready").limit(1).maybeSingle()
    if (fileError) throw fileError
    if (!file) return NextResponse.json({ error: "剧本尚未完成文本解析" }, { status: 409 })

    const review = await enqueueReview(contentId, user.id)
    return NextResponse.json({ review, queued: true }, { status: 202 })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "审核入队失败" }, { status: 500 })
  }
}
