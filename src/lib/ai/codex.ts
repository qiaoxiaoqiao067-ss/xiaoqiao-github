import { spawn } from "node:child_process"

const CLAUDE_MAX_OUTPUT_BYTES = 12 * 1024 * 1024

function shortCliError(stderr: string, exitCode: number | null, stdout = "") {
  // Claude Code occasionally prints API errors (including billing failures) to
  // stdout instead of stderr. Preserve that signal so the workbench can tell a
  // user what action is actually needed, rather than showing only “exit 1”.
  const detail = (stderr.trim() || stdout.trim()).replace(/\s+/g, " ").trim()
  if (/insufficient balance|billing|credit balance/i.test(detail)) {
    return "Claude 审核服务额度不足（402）。请为当前 Claude 账户充值，或在工作台服务设置中切换到已配置额度的模型后再重新加入队列。"
  }
  const clipped = detail.length > 900 ? `${detail.slice(0, 900)}…` : detail
  return `Claude 审核服务执行失败${exitCode === null ? "" : `（退出码 ${exitCode}）`}${clipped ? `：${clipped}` : ""}`
}

/**
 * Claude Code accepts a print-mode prompt from stdin.  Sending it this way is
 * safer than putting an entire screenplay into a process argument: it avoids
 * command-length issues and prevents Claude's "no stdin data" fallback.
 */
function runClaude(prompt: string, timeout: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.env.CLAUDE_BIN || "claude",
      ["-p", "--model", process.env.CLAUDE_MODEL || "sonnet", "--output-format", "text"],
      { stdio: ["pipe", "pipe", "pipe"] },
    )
    const output: Buffer[] = []
    const errors: Buffer[] = []
    let outputBytes = 0
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      finish(() => reject(new Error(`Claude 审核超时（${Math.round(timeout / 1000)} 秒），请重新加入队列。`)))
    }, timeout)

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length
      if (outputBytes > CLAUDE_MAX_OUTPUT_BYTES) {
        child.kill("SIGTERM")
        finish(() => reject(new Error("Claude 返回内容过大，审核任务已停止。")))
        return
      }
      output.push(chunk)
    })
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk))
    child.on("error", (error) => finish(() => reject(new Error(`无法启动 Claude 审核服务：${error.message}`))))
    child.on("close", (code) => finish(() => {
      const stdout = Buffer.concat(output).toString("utf8").trim()
      const stderr = Buffer.concat(errors).toString("utf8")
      if (code !== 0) return reject(new Error(shortCliError(stderr, code, stdout)))
      if (!stdout) return reject(new Error(shortCliError(stderr, code, stdout) || "Claude 返回为空"))
      resolve(stdout)
    }))

    child.stdin.end(`只完成本次内容任务，不要修改文件或执行命令。\n\n${prompt}`)
  })
}

/** Shared AI runner. Claude CLI is the reliable local fallback; HTTP remains available for Codex/OpenRouter. */
export async function runCodex(prompt: string, timeout = 120000) {
  if ((process.env.AI_PROVIDER || "").toLowerCase() === "claude") {
    return runClaude(prompt, timeout)
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("未配置 OPENAI_API_KEY")
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
    const isOpenRouter = baseUrl.includes("openrouter.ai")
    const endpoint = isOpenRouter ? `${baseUrl.replace(/\/$/, "")}/chat/completions` : `${baseUrl.replace(/\/$/, "")}/responses`
    const body = isOpenRouter
      ? { model: process.env.OPENAI_MODEL || "openai/gpt-5.3-codex", messages: [{ role: "user", content: `只完成本次内容任务，不要修改文件或执行命令。\n\n${prompt}` }] }
      : { model: process.env.OPENAI_MODEL || "gpt-5.3-codex", input: `只完成本次内容任务，不要修改文件或执行命令。\n\n${prompt}` }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await response.json() as { output_text?: string; choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
    if (!response.ok) throw new Error(data.error?.message || `Codex API 请求失败（${response.status}）`)
    const text = data.output_text || data.choices?.[0]?.message?.content
    if (!text?.trim()) throw new Error("Codex API 返回为空")
    return text.trim()
  } finally { clearTimeout(timer) }
}
