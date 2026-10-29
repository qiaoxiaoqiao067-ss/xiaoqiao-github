"use client"

import { useState } from "react"
import { Check, Loader2, Sparkles, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

type Preview = {
  id: string
  raw_text: string
  parsed_result: {
    action: "create" | "update"
    title: string
    category?: string | null
    status: string
    priority: number
    due_date?: string | null
    next_action?: string | null
    waiting_for?: string | null
    ai_reason?: string | null
  }
}

const priorityLabel = ["P3 长期", "P2 本周", "P1 近期", "P0 立即"]
const statusLabel: Record<string, string> = { todo: "待处理", in_progress: "进行中", waiting: "等待跟进", blocked: "受阻", completed: "已完成", cancelled: "已取消" }

export function AiTaskInbox({ onApplied, compact = false }: { onApplied?: () => void; compact?: boolean }) {
  const [text, setText] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const createPreview = async () => {
    if (!text.trim() || loading) return
    setLoading(true); setError(null); setMessage(null)
    try {
      const response = await fetch("/api/tasks/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "preview", text: text.trim() }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "AI 暂时无法解析这件事")
      setPreview(data.inbox as Preview)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "AI 暂时无法解析这件事") } finally { setLoading(false) }
  }

  const apply = async () => {
    if (!preview || applying) return
    setApplying(true); setError(null)
    try {
      const response = await fetch("/api/tasks/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "apply", inboxId: preview.id, parsedResult: preview.parsed_result, rawText: preview.raw_text }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "写入任务失败")
      setMessage(preview.parsed_result.action === "update" ? "已更新原任务。" : "已写入任务库。")
      setText(""); setPreview(null); onApplied?.()
    } catch (caught) { setError(caught instanceof Error ? caught.message : "写入任务失败") } finally { setApplying(false) }
  }

  const task = preview?.parsed_result
  if (compact) {
    return <Card className="border-[#b8d0b2] bg-[#f4f8ef] shadow-none"><CardContent className="p-2">
      {!preview || !task ? <div className="flex items-center gap-2"><Textarea aria-label="告诉AI发生了什么" value={text} onChange={(event)=>setText(event.target.value)} placeholder="直接输入一件事，例如：合同已提交，后续继续跟进" rows={1} className="h-8 min-h-8 flex-1 resize-none rounded-lg bg-white px-2.5 py-1.5 text-[11px]"/><Button size="sm" disabled={!text.trim()||loading} onClick={()=>void createPreview()} className="h-8 shrink-0 bg-[#173f31] px-2.5 text-[10px] text-white hover:bg-[#205b43]">{loading?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Sparkles className="h-3.5 w-3.5"/>}<span className="ml-1">整理</span></Button></div> : <div className="space-y-2"><div className="flex flex-wrap items-center gap-1.5"><Badge variant="secondary" className="text-[9px]">{task.action==="update"?"更新任务":"新建任务"}</Badge><Badge variant="outline" className="text-[9px]">{priorityLabel[task.priority]||"P2 本周"}</Badge><p className="min-w-0 flex-1 truncate text-[11px] font-semibold">{task.title}</p></div><div className="flex justify-end gap-1.5"><Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" disabled={applying} onClick={()=>setPreview(null)}>重填</Button><Button size="sm" className="h-7 px-2 text-[10px]" disabled={applying} onClick={()=>void apply()}>{applying?<Loader2 className="mr-1 h-3 w-3 animate-spin"/>:<Check className="mr-1 h-3 w-3"/>}确认写入</Button></div></div>}
      {error&&<p className="mt-1.5 text-[10px] text-destructive">{error}</p>}{message&&<p className="mt-1.5 text-[10px] text-emerald-700">{message}</p>}
    </CardContent></Card>
  }
  return (
    <Card className="overflow-hidden border-primary/20 bg-[linear-gradient(135deg,rgba(201,244,90,.11),rgba(255,255,255,.2))]">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#c9f45a] text-[#102a21]"><Wand2 className="h-4 w-4" /></span>
          <div><p className="font-semibold">AI 任务助手</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">直接说发生了什么，我会查重、判断状态和优先级。</p></div>
        </div>
        {!preview || !task ? (
          <>
            <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="例如：黑帮女王合同已经提交，后续继续跟进。" rows={3} className="mt-4 resize-none bg-background/80" />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">不会直接写入；确认后才会创建或更新任务。</p>
              <Button size="sm" disabled={!text.trim() || loading} onClick={() => void createPreview()} className="bg-[#173f31] text-white hover:bg-[#205b43]">
                {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}{loading ? "正在整理" : "AI 整理"}
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-primary/15 bg-background/80 p-4">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{task.action === "update" ? "更新已有任务" : "新建任务"}</Badge><Badge variant={task.priority >= 3 ? "destructive" : task.priority === 2 ? "warning" : "default"}>{priorityLabel[task.priority] || "P2 本周"}</Badge><Badge variant="outline">{statusLabel[task.status] || task.status}</Badge>{task.category && <span className="text-xs text-muted-foreground">{task.category}</span>}</div>
            <p className="mt-3 font-semibold">{task.title}</p>
            {task.next_action && <p className="mt-1 text-sm text-muted-foreground">下一步：{task.next_action}</p>}
            {task.waiting_for && <p className="mt-1 text-sm text-amber-700">等待：{task.waiting_for}</p>}
            {task.ai_reason && <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">AI 判断：{task.ai_reason}</p>}
            <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" size="sm" disabled={applying} onClick={() => setPreview(null)}>重新说</Button><Button size="sm" disabled={applying} onClick={() => void apply()}>{applying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}{applying ? "写入中" : "确认写入"}</Button></div>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        {message && <p className="mt-3 flex items-center gap-1 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" />{message}</p>}
      </CardContent>
    </Card>
  )
}
