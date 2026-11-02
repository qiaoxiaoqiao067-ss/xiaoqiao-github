import { after, NextResponse } from "next/server"
import { z } from "zod"
import { enqueueReview } from "@/lib/reviews/review-runner"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"

export const maxDuration = 300

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const access = await requireWorkspaceAccess(user.id, "content", "edit")
    if (!access) return NextResponse.json({ error: "没有责编审稿编辑权限" }, { status: 403 })
    const ownerId = access.ownerId
    const parsedId = z.string().uuid().safeParse((await context.params).id)
    if (!parsedId.success) return NextResponse.json({ error: "Invalid content id" }, { status: 400 })
    const contentId = parsedId.data

    const { data: content, error } = await serviceClient.from("contents").select("id").eq("id", contentId).eq("user_id", ownerId).single()
    if (error || !content) return NextResponse.json({ error: "内容项目不存在" }, { status: 404 })
    const { data: file, error: fileError } = await serviceClient.from("content_files").select("id").eq("content_id", contentId).eq("user_id", ownerId).eq("parse_status", "ready").limit(1).maybeSingle()
    if (fileError) throw fileError
    if (!file) return NextResponse.json({ error: "剧本尚未完成文本解析" }, { status: 409 })

    const review = await enqueueReview(contentId, ownerId)
    // Vercel may freeze a normal timer as soon as the response is sent. `after`
    // keeps the review invocation attached to the request lifecycle so the
    // public deployment actually starts the queued job.
    // The public workbench is the queue/UI only. Actual screenplay analysis is
    // intentionally performed by the trusted Mac worker using Claude Sonnet.
    const waitsForLocalClaude = Boolean(process.env.VERCEL)
    if (!review.alreadyQueued && !waitsForLocalClaude) {
      after(async () => {
        const { runQueuedReview } = await import("@/lib/reviews/review-runner")
        await runQueuedReview(review.id).catch(() => undefined)
      })
    }
    return NextResponse.json({ review, queued: true, execution: waitsForLocalClaude ? "local-claude" : "server" }, { status: 202 })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "审核入队失败" }, { status: 500 })
  }
}
