import { loadEnvConfig } from "@next/env"

loadEnvConfig(process.cwd())

async function main() {
  // Reviews use the Codex desktop account by default. This channel is kept
  // separate from the user's interactive Claude proxy configuration, which
  // may impose a much smaller token ceiling than a full screenplay requires.
  process.env.REVIEW_AI_PROVIDER ||= "codex-cli"

  const { startReviewWorker } = await import("../src/lib/reviews/review-runner")
  startReviewWorker()
  console.log(`[${new Date().toISOString()}] 本机审核器已启动，通道：${process.env.REVIEW_AI_PROVIDER}`)
  console.log("正在监听公网工作台的待审核队列。按 Ctrl+C 停止。")
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
