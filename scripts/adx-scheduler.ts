import { loadEnvConfig } from "@next/env"

async function main() {
  loadEnvConfig(process.cwd())
  const { runScheduledAdxJobs } = await import("@/lib/adx/local-scheduler")
  const result = await runScheduledAdxJobs()
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "ADX 后台任务启动失败。"
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
