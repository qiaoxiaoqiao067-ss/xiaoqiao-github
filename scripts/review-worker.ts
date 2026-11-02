import { loadEnvConfig } from "@next/env"

loadEnvConfig(process.cwd())

async function main() {
  if ((process.env.AI_PROVIDER || "").toLowerCase() !== "claude") {
    throw new Error("本机审核器要求 AI_PROVIDER=claude")
  }

  const { startReviewWorker } = await import("../src/lib/reviews/review-runner")
  startReviewWorker()
  console.log(`[${new Date().toISOString()}] 本机 Claude 审核器已启动，模型：${process.env.CLAUDE_MODEL || "sonnet"}`)
  console.log("正在监听公网工作台的待审核队列。按 Ctrl+C 停止。")
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
