"use client"

import Link from "next/link"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

function friendlyMessage(error: string) {
  const text = error.toLowerCase()
  if (/jwt|unauth|not authenticated|session|请先登录/.test(text)) return "登录状态已失效，请重新登录后继续。"
  if (/fetch|network|timeout|timed out|connection|连接/.test(text)) return "数据连接暂时不稳定，请稍后重试。"
  if (/permission|row-level|policy|forbidden|403/.test(text)) return "当前账号没有读取这部分数据的权限。"
  return "数据暂时没有加载成功。你的已有内容不会丢失，可以直接重试。"
}

export function DataError({ error, onRetry, compact = false }: { error: string; onRetry?: () => void | Promise<void>; compact?: boolean }) {
  const needsLogin = /jwt|unauth|not authenticated|session|请先登录/i.test(error)
  return <div role="alert" className={`flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive sm:flex-row sm:items-center sm:justify-between ${compact ? "p-3 text-xs" : "p-4 text-sm"}`}>
    <div className="flex min-w-0 items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><div><p className="font-medium">{friendlyMessage(error)}</p><details className="mt-1 text-[11px] opacity-70"><summary className="cursor-pointer">查看技术信息</summary><p className="mt-1 break-all">{error}</p></details></div></div>
    {needsLogin ? <Button asChild size="sm" variant="outline" className="shrink-0"><Link href="/login">重新登录</Link></Button> : onRetry ? <Button size="sm" variant="outline" className="shrink-0" onClick={() => void onRetry()}><RefreshCw className="mr-1 h-3.5 w-3.5"/>重新加载</Button> : null}
  </div>
}
