import { runCodex } from "@/lib/ai/codex"
import { serviceClient } from "@/lib/supabase/service"
import { normalizeReviewScore, REVIEW_PROMPT, REVIEW_PROMPT_VERSION } from "@/lib/reviews/review-standard"

type ReviewWorkflow = { stage?: string; progress?: number; retries?: number; benchmark_count?: number }
type ReviewResult = Record<string, unknown> & { workflow?: ReviewWorkflow }

function parseResult(output: string): ReviewResult {
  const cleaned = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("AI 未返回有效审核结果")
  return JSON.parse(cleaned.slice(start, end + 1)) as ReviewResult
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "审核失败"
}

async function updateProgress(reviewId: string, stage: string, progress: number, benchmarkCount?: number) {
  const workflow: ReviewWorkflow = { stage, progress, ...(benchmarkCount === undefined ? {} : { benchmark_count: benchmarkCount }) }
  await serviceClient.from("content_reviews").update({ result: { workflow }, updated_at: new Date().toISOString() }).eq("id", reviewId)
}

async function loadBenchmarks(userId: string, contentId: string) {
  const { data: contents, error } = await serviceClient
    .from("contents")
    .select("id,title,market,genre")
    .eq("user_id", userId)
    .eq("content_type", "benchmark")
    .neq("id", contentId)
    .order("updated_at", { ascending: false })
    .limit(5)
  if (error) throw error
  const ids = (contents || []).map((item) => item.id)
  if (!ids.length) return []
  const { data: files, error: filesError } = await serviceClient
    .from("content_files")
    .select("content_id,extracted_text,version")
    .eq("user_id", userId)
    .eq("parse_status", "ready")
    .in("content_id", ids)
    .order("version", { ascending: false })
  if (filesError) throw filesError
  return (contents || []).flatMap((item) => {
    const file = (files || []).find((candidate) => candidate.content_id === item.id && candidate.extracted_text)
    return file?.extracted_text ? [{ ...item, text: file.extracted_text }] : []
  })
}

export async function runQueuedReview(reviewId: string) {
  const { data: review, error: reviewError } = await serviceClient
    .from("content_reviews")
    .select("id,content_id,user_id,status,result")
    .eq("id", reviewId)
    .single()
  if (reviewError || !review) throw reviewError || new Error("审核任务不存在")
  if (review.status !== "pending") return

  const { data: claimed, error: claimedError } = await serviceClient
    .from("content_reviews")
    .update({ status: "running", result: { workflow: { stage: "正在读取剧本文本", progress: 10 } }, updated_at: new Date().toISOString() })
    .eq("id", reviewId)
    .eq("status", "pending")
    .select("id")
  if (claimedError) throw claimedError
  if (!claimed || claimed.length === 0) return // 被并发槽位抢先认领，本次空转

  try {
    const { data: content, error: contentError } = await serviceClient
      .from("contents")
      .select("id,title,content_type,market,language,genre")
      .eq("id", review.content_id)
      .eq("user_id", review.user_id)
      .single()
    if (contentError || !content) throw contentError || new Error("内容项目不存在")

    const { data: files, error: fileError } = await serviceClient
      .from("content_files")
      .select("extracted_text,version")
      .eq("content_id", review.content_id)
      .eq("user_id", review.user_id)
      .eq("parse_status", "ready")
      .order("version", { ascending: false })
      .limit(1)
    if (fileError) throw fileError
    const script = files?.[0]?.extracted_text
    if (!script) throw new Error("剧本尚未完成文本解析")

    await updateProgress(reviewId, "正在匹配优秀对标库", 25)
    const benchmarks = await loadBenchmarks(review.user_id, review.content_id)
    await updateProgress(reviewId, "正在执行编剧室审核", 40, benchmarks.length)

    const metadata = `项目：${content.title}\n类型：${content.content_type}\n市场：${content.market || "未填写"}\n语言：${content.language || "未填写"}\n题材：${content.genre || "未填写"}`
    const referenceText = benchmarks.length
      ? benchmarks.map((item, index) => `【参考${index + 1}｜${item.title}】\n市场：${item.market || "未填写"}｜题材：${item.genre || "未填写"}\n${item.text.slice(0, 12000)}`).join("\n\n")
      : "当前没有已解析的“优秀对标”剧本。comparison 必须明确说明无法完成严格对比，不得虚构样本。"
    // A full screenplay plus four analysis modules frequently needs more
    // than the old three-minute window. Allow a bounded 5–12 minutes based on
    // text size so useful work is not terminated midway.
    const reviewTimeout = Math.min(12 * 60 * 1000, Math.max(5 * 60 * 1000, 3 * 60 * 1000 + Math.ceil(script.length / 1000) * 6000))
    const heartbeat = setInterval(() => {
      void updateProgress(reviewId, "正在执行编剧室审核（仍在生成结果）", 55, benchmarks.length).catch(() => undefined)
    }, 30 * 1000)
    let output: string
    try {
      output = await runCodex(`${REVIEW_PROMPT}\n\n${metadata}\n\n【待审剧本】\n${script.slice(0, 120000)}\n\n【工作台优秀对标库】\n${referenceText}`, reviewTimeout)
    } finally {
      clearInterval(heartbeat)
    }
    let result: ReviewResult
    try {
      result = parseResult(output)
    } catch {
      // A useful review should not be discarded merely because the model added
      // a trailing comma or explanatory text.  Repair the returned content
      // without sending the screenplay through the model a second time.
      await updateProgress(reviewId, "正在修复审核结果格式", 85, benchmarks.length)
      const repaired = await runCodex(`将下面的审核结果修复为一个合法 JSON 对象。只返回 JSON，不增加解释、Markdown 或新判断；保留原有中文内容和字段。\n\n${output.slice(0, 120000)}`, 60000)
      result = parseResult(repaired)
    }
    const score = normalizeReviewScore(result)
    result.workflow = { stage: "审核完成", progress: 100, benchmark_count: benchmarks.length }

    const { error: completeError } = await serviceClient
      .from("content_reviews")
      .update({ status: "completed", score, result, model: process.env.AI_PROVIDER === "claude" ? "claude-sonnet-cli" : "codex-api", updated_at: new Date().toISOString() })
      .eq("id", reviewId)
    if (completeError) throw completeError
    await serviceClient.from("contents").update({ status: "reviewed", updated_at: new Date().toISOString() }).eq("id", review.content_id).eq("user_id", review.user_id)
  } catch (error) {
    const previous = (review.result || {}) as ReviewResult
    await serviceClient.from("content_reviews").update({ status: "failed", result: { ...previous, error: errorMessage(error), workflow: { stage: "审核失败，可重新排队", progress: 0 } }, updated_at: new Date().toISOString() }).eq("id", reviewId)
    await serviceClient.from("contents").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", review.content_id).eq("user_id", review.user_id)
  }
}

type WorkerState = { timer?: ReturnType<typeof setInterval>; active: number }
const globalWorker = globalThis as typeof globalThis & { __shortDramaReviewWorker?: WorkerState }

// 并发消费待审队列：每条审核是独立的 claude -p 子进程，互不冲突。
// 并发只提升吞吐，不触碰审核 prompt / 输出结构，因此不损失审核质量。
// 子进程为等待远程 API 的 IO 密集型任务，本地开销小；6 核 8GB 机器可安全跑 5 路。
const REVIEW_CONCURRENCY = 5

async function workOnce() {
  const state = globalWorker.__shortDramaReviewWorker
  if (!state) return
  // 以「已认领运行中的任务数」为占用计数。runQueuedReview 认领失败（被抢先）会
  // 空转返回，因此这里需要在入队后立即占位，避免同一轮循环内重复认领同一条。
  const runningCount = state.active
  const freeSlots = REVIEW_CONCURRENCY - runningCount
  if (freeSlots <= 0) return

  // 复活超时任务：上次心跳超过 15 分钟即视为服务重启中断，放回队列重跑。
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  await serviceClient.from("content_reviews").update({ status: "pending", result: { workflow: { stage: "服务重启后自动恢复排队", progress: 0 } }, updated_at: new Date().toISOString() }).eq("reviewer_type", "ai").eq("status", "running").lt("updated_at", staleBefore)

  // 取出最多 freeSlots 条待审任务，逐条并发拉起。
  const { data: pending } = await serviceClient.from("content_reviews").select("id").eq("reviewer_type", "ai").eq("status", "pending").order("created_at", { ascending: true }).limit(freeSlots)
  if (!pending || pending.length === 0) return
  state.active += pending.length
  try {
    await Promise.all(pending.map((item) => runQueuedReview(item.id)))
  } finally {
    state.active -= pending.length
  }
}

export function startReviewWorker() {
  if (!globalWorker.__shortDramaReviewWorker) globalWorker.__shortDramaReviewWorker = { active: 0 }
  const state = globalWorker.__shortDramaReviewWorker
  if (!state.timer) state.timer = setInterval(() => void workOnce(), 2500)
  void workOnce()
}

export async function enqueueReview(contentId: string, userId: string) {
  const { data: existing, error: existingError } = await serviceClient
    .from("content_reviews")
    .select("id,status")
    .eq("content_id", contentId)
    .eq("user_id", userId)
    .eq("reviewer_type", "ai")
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return { id: existing.id, status: existing.status, alreadyQueued: true }

  const { data: review, error } = await serviceClient
    .from("content_reviews")
    .insert({ content_id: contentId, user_id: userId, reviewer_type: "ai", status: "pending", model: process.env.AI_PROVIDER === "claude" ? "claude-sonnet-cli" : "codex-api", prompt_version: REVIEW_PROMPT_VERSION, result: { workflow: { stage: "等待后台审核", progress: 0 } } })
    .select("id,status")
    .single()
  if (error) throw error
  await serviceClient.from("contents").update({ status: "reviewing", updated_at: new Date().toISOString() }).eq("id", contentId).eq("user_id", userId)
  startReviewWorker()
  return { ...review, alreadyQueued: false }
}
