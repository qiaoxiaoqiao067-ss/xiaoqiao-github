import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireUser } from "@/lib/supabase/require-user"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

type SummaryItem = { source: string; text: string; kind: "fact" | "plan" }
// Supabase dynamic table queries cannot infer a shared row shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = Record<string, any>

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser()
  if (response) return response
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 })
  const userId = user.id

  const date = new URL(request.url).searchParams.get("date")
  if (!date) return NextResponse.json({ error: "缺少日期" }, { status: 400 })

  const client = createClient(supabaseUrl, supabaseServiceKey)
  const start = `${date}T00:00:00`
  const end = `${date}T23:59:59.999`

  async function rows(table: string, column: string, select = "*") {
    const { data, error } = await client.from(table).select(select).eq("user_id", userId).gte(column, start).lte(column, end)
    return error ? [] : (data || []) as unknown as DbRow[]
  }
  async function rowsOnDate(table: string, column: string, select = "*") {
    const { data, error } = await client.from(table).select(select).eq("user_id", userId).eq(column, date)
    return error ? [] : (data || []) as unknown as DbRow[]
  }

  const [completedTasks, updatedProjects, contents, ideas, research, meetings, knowledge] = await Promise.all([
    rows("todos", "completed_at", "title,completed_at,tags"),
    rows("projects", "updated_at", "title,stage,next_action,status,updated_at"),
    rows("contents", "updated_at", "title,status,content_type,updated_at"),
    rows("ideas", "updated_at", "title,status,updated_at"),
    rows("research_items", "updated_at", "title,status,conclusion,next_action,updated_at"),
    rowsOnDate("meetings", "meeting_date", "title,meeting_type,summary,decisions,next_actions,meeting_date"),
    rows("knowledge_items", "updated_at", "title,item_type,category,updated_at"),
  ])

  const facts: SummaryItem[] = [
    ...completedTasks.map((row) => ({ source: "任务", text: `完成：${row.title}`, kind: "fact" as const })),
    ...updatedProjects.map((row) => ({ source: "项目", text: `${row.title}：推进至${row.stage || "当前阶段"}${row.next_action ? `，下一步${row.next_action}` : ""}`, kind: "fact" as const })),
    ...contents.map((row) => ({ source: "责编审稿", text: `${row.title}：${row.status || "已更新"}`, kind: "fact" as const })),
    ...ideas.map((row) => ({ source: "选题", text: `${row.title}：${row.status || "已更新"}`, kind: "fact" as const })),
    ...research.map((row) => ({ source: "调研", text: `${row.title}：${row.conclusion || row.status || "已更新"}`, kind: "fact" as const })),
    ...meetings.map((row) => ({ source: "会议", text: `${row.title}${row.decisions ? `：${row.decisions}` : ""}`, kind: "fact" as const })),
    ...knowledge.map((row) => ({ source: "知识学习", text: `更新/学习：${row.title}`, kind: "fact" as const })),
  ]

  const plans: SummaryItem[] = [
    ...updatedProjects.filter((row) => row.next_action).map((row) => ({ source: "项目", text: `${row.title}：${row.next_action}`, kind: "plan" as const })),
    ...research.filter((row) => row.next_action).map((row) => ({ source: "调研", text: `${row.title}：${row.next_action}`, kind: "plan" as const })),
    ...meetings.filter((row) => row.next_actions).map((row) => ({ source: "会议", text: `${row.title}：${row.next_actions}`, kind: "plan" as const })),
  ]

  const coverage = [
    ["任务", completedTasks.length], ["项目", updatedProjects.length], ["责编审稿", contents.length],
    ["选题", ideas.length], ["调研", research.length], ["会议", meetings.length], ["知识学习", knowledge.length],
  ].map(([source, count]) => ({ source, count }))

  return NextResponse.json({ facts, plans, coverage })
}
