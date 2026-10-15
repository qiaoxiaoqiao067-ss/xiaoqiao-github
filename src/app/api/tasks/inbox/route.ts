import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { runCodex } from "@/lib/ai/codex"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"
const statuses = ["todo", "in_progress", "waiting", "blocked", "completed", "cancelled"] as const
const priorities = [0, 1, 2, 3] as const
const previewSchema = z.object({ text: z.string().trim().min(2).max(6000), mode: z.literal("preview") })
const parsedTaskSchema = z.object({ action: z.enum(["create", "update"]), target_task_id: z.string().uuid().nullable().optional(), title: z.string().trim().min(1).max(120), description: z.string().nullable().optional(), category: z.string().nullable().optional(), status: z.enum(statuses), priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), due_date: z.string().nullable().optional(), next_action: z.string().nullable().optional(), waiting_for: z.string().nullable().optional(), dependency: z.string().nullable().optional(), project_id: z.string().uuid().nullable().optional(), ai_score: z.coerce.number().default(0), ai_reason: z.string().default("") })
const applySchema = z.object({ inboxId: z.string().uuid(), mode: z.literal("apply"), parsedResult: parsedTaskSchema.optional(), rawText: z.string().max(6000).optional() })
type ParsedTask = { action: "create" | "update"; target_task_id?: string | null; title: string; description?: string | null; category?: string | null; status: (typeof statuses)[number]; priority: (typeof priorities)[number]; due_date?: string | null; next_action?: string | null; waiting_for?: string | null; dependency?: string | null; project_id?: string | null; ai_score: number; ai_reason: string }

function parse(output: string) { const text = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); const start = text.indexOf("{"); const end = text.lastIndexOf("}"); if (start < 0 || end <= start) throw new Error("AI 未返回可识别的任务结构"); return JSON.parse(text.slice(start, end + 1)) as ParsedTask }
function isoDate(value?: string | null) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString() }
function errorMessage(error: unknown, fallback = "AI 任务处理失败") {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [value.message, value.details, value.hint, value.code].filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    if (parts.length) return [...new Set(parts)].join(" · ")
  }
  return fallback
}
function textPairs(value: string) {
  const clean = value.toLowerCase().replace(/[\s｜|·，。、“”‘’：:；;（）()【】\[\]《》<>—_-]/g, "")
  return new Set(Array.from({ length: Math.max(0, clean.length - 1) }, (_, index) => clean.slice(index, index + 2)))
}
function localTaskMatch(raw: string, title: string, tasks: Array<{ id: string; title: string }>) {
  const source = textPairs(`${raw}${title}`)
  let best: { id: string; score: number } | null = null
  for (const task of tasks) {
    const candidate = textPairs(task.title)
    const overlap = [...candidate].filter((pair) => source.has(pair)).length
    const score = candidate.size ? overlap / candidate.size : 0
    if (!best || score > best.score) best = { id: task.id, score }
  }
  return best && best.score >= 0.22 ? best.id : null
}
function migrationMissing(message: string) { return /does not exist|schema cache|could not find the table|could not find the .* column|PGRST204|42P01|42703/i.test(message) }
function legacyTags(parsed: ParsedTask, existing: string[] = []) {
  const clean = existing.filter((tag) => !/^(status|category|next_action|waiting_for):/.test(tag))
  return [...clean, `status:${parsed.status}`, parsed.category && `category:${parsed.category}`, parsed.next_action && `next_action:${parsed.next_action}`, parsed.waiting_for && `waiting_for:${parsed.waiting_for}`].filter((tag): tag is string => Boolean(tag))
}
function prompt(raw: string, tasks: Array<Record<string, unknown>>, projects: Array<Record<string, unknown>>) { return `你是中文内容工作台的任务调度助手。只完成任务解析；不要执行命令、不要修改文件、不要声称已经完成现实工作。今天是 ${new Date().toISOString().slice(0, 10)}。将用户输入解析为“最重要的一项可执行更新”。先在已有任务中查重：汇报已有事项推进、完成、延期或等待时，必须 action=update 并填 target_task_id；明确新事项才 action=create。不能因闲聊创建任务。优先级：0=P3长期，1=P2本周，2=P1今天/近期，3=P0立即处理。当天到期至少 P1；阻塞项目交付可为 P0；等待他人必须 status=waiting 或 blocked，不能占据主动待办。必须只输出合法 JSON：{"action":"create|update","target_task_id":"已有任务ID或null","title":"不超过60字","description":"可选","category":"剧本|项目推进|选题|调研|会议|市场数据|工具建设|行政协作|其他","status":"todo|in_progress|waiting|blocked|completed|cancelled","priority":0,"due_date":"ISO日期或null","next_action":"下一步动作或null","waiting_for":"等待对象/条件或null","dependency":"前置条件或null","project_id":"已有项目ID或null","ai_score":0,"ai_reason":"不超过80字，说明排序原因"}\n【用户原话】\n${raw}\n【已有任务】\n${JSON.stringify(tasks)}\n【已有项目】\n${JSON.stringify(projects)}` }

export async function GET() { try { const { user, response } = await requireUser(); if (response) return response; const { data, error } = await serviceClient.from("task_inbox").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(12); if (error) throw error; return NextResponse.json({ items: data || [] }, { headers: { "Cache-Control": "no-store" } }) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取任务收件箱失败" }, { status: 500 }) } }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json(); const { user, response } = await requireUser(); if (response) return response
    const preview = previewSchema.safeParse(body)
    if (preview.success) {
      // Keep existing task data local: the model only receives the user's new
      // sentence. Deduplication is performed below against legacy-safe fields.
      const { data: tasks, error: taskError } = await serviceClient.from("todos").select("id,title").eq("user_id", user.id).eq("completed", false).order("updated_at", { ascending: false }).limit(60)
      if (taskError) throw taskError
      const parsed = parsedTaskSchema.parse(parse(await runCodex(prompt(preview.data.text, [], []), 90_000))) as ParsedTask
      const matchedTaskId = localTaskMatch(preview.data.text, parsed.title, tasks || [])
      if (matchedTaskId) { parsed.action = "update"; parsed.target_task_id = matchedTaskId }
      else if (parsed.action === "update") { parsed.action = "create"; parsed.target_task_id = null }
      if (!statuses.includes(parsed.status) || !priorities.includes(parsed.priority)) throw new Error("AI 返回的任务状态不合法")
      const { data: inbox, error } = await serviceClient.from("task_inbox").insert({ user_id: user.id, raw_text: preview.data.text, parsed_result: parsed, status: "preview" }).select().single()
      if (error && !migrationMissing(errorMessage(error))) throw error
      return NextResponse.json({ inbox: inbox || { id: crypto.randomUUID(), raw_text: preview.data.text, parsed_result: parsed, status: "preview", ephemeral: true } })
    }
    const apply = applySchema.safeParse(body); if (!apply.success) return NextResponse.json({ error: "请求内容不正确" }, { status: 400 })
    const { data: storedInbox, error: inboxError } = await serviceClient.from("task_inbox").select("*").eq("id", apply.data.inboxId).eq("user_id", user.id).single()
    if (storedInbox?.status === "applied") return NextResponse.json({ alreadyApplied: true })
    if (inboxError && !migrationMissing(errorMessage(inboxError))) throw inboxError
    const parsed = parsedTaskSchema.parse(storedInbox?.parsed_result || apply.data.parsedResult) as ParsedTask
    const inbox = storedInbox || { id: apply.data.inboxId }
    const updates = { title: parsed.title.trim(), description: parsed.description || null, category: parsed.category || null, status: parsed.status, priority: parsed.priority, due_date: isoDate(parsed.due_date), next_action: parsed.next_action || null, waiting_for: parsed.waiting_for || null, dependency: parsed.dependency || null, project_id: parsed.project_id || null, ai_score: Math.max(0, Math.min(100, Number(parsed.ai_score) || 0)), ai_reason: parsed.ai_reason || null, source: "ai_inbox", completed: parsed.status === "completed", completed_at: parsed.status === "completed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
    let todo: Record<string, unknown> | null
    if (parsed.action === "update" && parsed.target_task_id) {
      const { data, error } = await serviceClient.from("todos").update(updates).eq("id", parsed.target_task_id).eq("user_id", user.id).select().single()
      if (error && migrationMissing(errorMessage(error))) {
        const current = await serviceClient.from("todos").select("tags").eq("id", parsed.target_task_id).eq("user_id", user.id).single()
        const fallback = await serviceClient.from("todos").update({ title: updates.title, description: updates.description || updates.next_action, priority: updates.priority, due_date: updates.due_date, tags: legacyTags(parsed, current.data?.tags || []), completed: updates.completed, completed_at: updates.completed_at, updated_at: updates.updated_at }).eq("id", parsed.target_task_id).eq("user_id", user.id).select().single()
        if (fallback.error) throw fallback.error; todo = fallback.data
      } else { if (error) throw error; todo = data }
    } else {
      const { data, error } = await serviceClient.from("todos").insert({ ...updates, user_id: user.id }).select().single()
      if (error && migrationMissing(errorMessage(error))) {
        const fallback = await serviceClient.from("todos").insert({ user_id: user.id, title: updates.title, description: updates.description || updates.next_action, priority: updates.priority, due_date: updates.due_date, tags: legacyTags(parsed), completed: updates.completed, completed_at: updates.completed_at }).select().single()
        if (fallback.error) throw fallback.error; todo = fallback.data
      } else { if (error) throw error; todo = data }
    }
    const todoId = (todo as { id: string }).id
    if (storedInbox) await Promise.all([serviceClient.from("task_inbox").update({ status: "applied", applied_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", inbox.id), serviceClient.from("task_events").insert({ user_id: user.id, todo_id: todoId, inbox_id: inbox.id, event_type: parsed.action, summary: parsed.action === "update" ? "AI 根据收件箱更新了任务" : "AI 根据收件箱创建了任务", payload: parsed })])
    return NextResponse.json({ todo, inboxId: inbox.id })
  } catch (error) {
    const message = errorMessage(error)
    return NextResponse.json({ error: migrationMissing(message) ? "当前数据库字段不完整，任务助手已尝试兼容模式但仍无法写入。" : message }, { status: 500 })
  }
}
