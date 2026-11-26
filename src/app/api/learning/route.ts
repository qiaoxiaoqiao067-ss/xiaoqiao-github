import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { runCodex } from "@/lib/ai/codex"
import { requireUser } from "@/lib/supabase/require-user"
import { getWorkspaceAccess } from "@/lib/supabase/workspace-access"
import { serviceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const publishSchema = z.object({
  action: z.literal("publish"),
  learnerId: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  brief: z.string().trim().min(10).max(4000),
  cadence: z.enum(["daily", "weekly", "extra"]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})
const submitSchema = z.object({
  action: z.literal("submit"),
  assignmentId: z.string().uuid(),
  sources: z.string().trim().min(20).max(8000),
  findings: z.string().trim().min(30).max(8000),
  reasoning: z.string().trim().min(30).max(8000),
  reflection: z.string().trim().max(4000),
})
const retrySchema = z.object({ action: z.literal("retry_grade"), submissionId: z.string().uuid() })
const updateSchema = publishSchema.omit({ action: true }).extend({ action: z.literal("update"), assignmentId: z.string().uuid() })
const archiveSchema = z.object({ action: z.literal("archive"), assignmentId: z.string().uuid() })
const restoreSchema = z.object({ action: z.literal("restore"), assignmentId: z.string().uuid() })
const managementSchema = z.discriminatedUnion("action", [updateSchema, archiveSchema, restoreSchema])
const actionSchema = z.discriminatedUnion("action", [publishSchema, submitSchema, retrySchema])
const breakdownSchema = z.object({
  steps: z.array(z.object({
    title: z.string().trim().min(2).max(100),
    instructions: z.string().trim().min(8).max(1000),
    deliverable: z.string().trim().min(4).max(500),
  })).min(2).max(8),
})
const gradeSchema = z.object({
  scores: z.object({
    retrieval: z.number().int().min(0).max(25),
    evidence: z.number().int().min(0).max(25),
    reasoning: z.number().int().min(0).max(25),
    synthesis: z.number().int().min(0).max(15),
    reflection: z.number().int().min(0).max(10),
  }),
  feedback: z.string().trim().min(20).max(3000),
  strengths: z.array(z.string()).max(5),
  improvements: z.array(z.string()).min(1).max(5),
  next_task: z.object({
    title: z.string().trim().min(3).max(120),
    brief: z.string().trim().min(15).max(1000),
    steps: z.array(z.string().trim().min(5).max(500)).min(2).max(6),
  }),
})

function parseJson<T>(raw: string, schema: z.ZodType<T>): T {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("AI 返回格式不完整")
  return schema.parse(JSON.parse(raw.slice(start, end + 1)))
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败"
}

async function gradeSubmission(
  submission: { id: string; workspace_id: string; assignment_id: string; learner_id: string; sources: string; findings: string; reasoning: string; reflection: string },
  assignment: { id: string; title: string; brief: string; steps: unknown; created_by: string },
) {
  const prompt = [
    "你是短剧学习导师，任务可能涉及 AI 工具、市场观察、看片拆解、动手创作或多元视角。只输出 JSON 对象，不要 Markdown。",
    "依据具体任务评分：研究任务看来源与核查，看片任务看具体场景与人物因果，实操任务看过程、作品和迭代，多元思考看能否准确理解不同立场。不要强迫每种任务都引用市场数据。你没有独立核验链接或作品，不能把未核验内容说成事实；要指出证据缺口。",
    "评分维度与上限：retrieval 信息获取与问题定位 25，evidence 具体观察、实践过程或可追溯证据 25，reasoning 因果分析与不同解释的逻辑 25，synthesis 作品质量或跨场景迁移 15，reflection 对错误、局限和他人视角的复盘 10。按任务目标适配每项标准。",
    "输出格式：{\"scores\":{\"retrieval\":0,\"evidence\":0,\"reasoning\":0,\"synthesis\":0,\"reflection\":0},\"feedback\":\"具体评语\",\"strengths\":[\"...\"],\"improvements\":[\"...\"],\"next_task\":{\"title\":\"明日任务\",\"brief\":\"针对薄弱点的任务说明，要求自主实践与思考\",\"steps\":[\"...\",\"...\"]}}。",
    "长期训练应覆盖 AI 工具使用、短剧市场、内容与人物世界观拆解、动手产出、包容多元的思考。次日任务优先练本次薄弱点，避免机械重复。",
    "作业：" + JSON.stringify({ title: assignment.title, brief: assignment.brief, steps: assignment.steps }),
    "提交：" + JSON.stringify({ sources: submission.sources, findings: submission.findings, reasoning: submission.reasoning, reflection: submission.reflection }),
  ].join("\n\n")
  const grade = parseJson(await runCodex(prompt, 90000), gradeSchema)
  const total = Object.values(grade.scores).reduce((sum, value) => sum + value, 0)
  const tomorrow = new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { error: nextError } = await serviceClient.from("learning_assignments").upsert({
    workspace_id: submission.workspace_id,
    learner_id: submission.learner_id,
    created_by: assignment.created_by,
    title: grade.next_task.title,
    brief: grade.next_task.brief,
    cadence: "daily",
    due_date: tomorrow,
    steps: grade.next_task.steps.map((step) => ({ title: step, instructions: step, deliverable: "提交具体观察或作品，并说明过程与判断" })),
    origin_submission_id: submission.id,
  }, { onConflict: "origin_submission_id" })
  if (nextError) throw nextError
  const { error: updateError } = await serviceClient.from("learning_submissions").update({
    review_status: "graded",
    score: grade.scores,
    total_score: total,
    feedback: grade.feedback,
    next_plan: { strengths: grade.strengths, improvements: grade.improvements, next_task: grade.next_task },
  }).eq("id", submission.id).eq("workspace_id", submission.workspace_id)
  if (updateError) throw updateError
  return total
}

async function learnerIsAuthorized(workspaceId: string, learnerId: string) {
  const { data: member, error: memberError } = await serviceClient.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", learnerId).eq("status", "active").maybeSingle()
  if (memberError) throw memberError
  const { data: permission, error: permissionError } = await serviceClient.from("workspace_module_permissions").select("can_view").eq("workspace_id", workspaceId).eq("user_id", learnerId).eq("module_key", "learning").maybeSingle()
  if (permissionError) throw permissionError
  return Boolean(member && permission?.can_view)
}

async function generateSteps(input: { title: string; brief: string; cadence: "daily" | "weekly" | "extra"; dueDate: string | null }) {
  const prompt = [
    "你是短剧学习导师。请将负责人自行编写的任务拆成 2 到 8 个可执行、可检查的步骤，只输出 JSON 对象，不要 Markdown。",
    "保持负责人设定的主题与交付范围。任务可能是 AI 工具实操、短剧市场观察、观看与拆解剧集、动手创作或从多元立场思考。研究任务安排来源核查；看片任务安排具体场景记录与人物动机分析；实操任务安排作品、迭代与错误复盘；多元思考任务安排不同立场与反例。不要把所有任务都强制改成市场检索，不要代替学员完成任务，也不要编造资料。",
    "输出格式：{\"steps\":[{\"title\":\"步骤标题\",\"instructions\":\"具体动作\",\"deliverable\":\"可检查的交付物\"}]}。",
    "任务：" + JSON.stringify({ title: input.title, brief: input.brief, cadence: input.cadence, dueDate: input.dueDate }),
  ].join("\n\n")
  return parseJson(await runCodex(prompt, 90000), breakdownSchema).steps
}

export async function GET() {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const access = await getWorkspaceAccess(user.id, "learning")
    if (!access?.canView) return NextResponse.json({ error: "无学习页权限" }, { status: 403 })
    const owner = access.role === "owner"
    let query = serviceClient.from("learning_assignments").select("id,workspace_id,learner_id,created_by,title,brief,cadence,due_date,steps,status,created_at,updated_at,archived_at,origin_submission_id").eq("workspace_id", access.workspaceId).is("archived_at", null).order("created_at", { ascending: false }).limit(100)
    if (!owner) query = query.eq("learner_id", user.id)
    const { data: assignments, error: assignmentError } = await query
    if (assignmentError) throw assignmentError
    const ids = (assignments || []).map((item) => item.id)
    const { data: submissions, error: submissionError } = ids.length
      ? await serviceClient.from("learning_submissions").select("id,assignment_id,learner_id,sources,findings,reasoning,reflection,review_status,score,total_score,feedback,next_plan,submitted_at").eq("workspace_id", access.workspaceId).in("assignment_id", ids).order("submitted_at", { ascending: false })
      : { data: [], error: null }
    if (submissionError) throw submissionError
    if (!owner) return NextResponse.json({ role: "learner", assignments, submissions }, { headers: { "Cache-Control": "private, no-store" } })

    const { data: members, error: memberError } = await serviceClient.from("workspace_members").select("user_id,status,invited_email").eq("workspace_id", access.workspaceId).eq("status", "active")
    if (memberError) throw memberError
    const memberIds = (members || []).map((member) => member.user_id)
    const { data: permissions, error: permissionError } = memberIds.length
      ? await serviceClient.from("workspace_module_permissions").select("user_id,can_view").eq("workspace_id", access.workspaceId).eq("module_key", "learning").eq("can_view", true).in("user_id", memberIds)
      : { data: [], error: null }
    if (permissionError) throw permissionError
    const learnerIds = (permissions || []).map((item) => item.user_id).filter((id) => id !== access.ownerId)
    const { data: profiles, error: profileError } = learnerIds.length
      ? await serviceClient.from("users").select("id,email,name").in("id", learnerIds)
      : { data: [], error: null }
    if (profileError) throw profileError
    const learners = learnerIds.map((id) => {
      const profile = (profiles || []).find((item) => item.id === id)
      const member = (members || []).find((item) => item.user_id === id)
      return { id, email: profile?.email || member?.invited_email || id, name: profile?.name || null }
    })
    const { data: archivedAssignments, error: archivedError } = await serviceClient.from("learning_assignments")
      .select("id,title,learner_id,due_date,archived_at,created_at")
      .eq("workspace_id", access.workspaceId).not("archived_at", "is", null)
      .order("archived_at", { ascending: false }).limit(50)
    if (archivedError) throw archivedError
    return NextResponse.json({ role: "owner", assignments, submissions, learners, archivedAssignments }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const access = await getWorkspaceAccess(user.id, "learning")
    if (!access?.canView) return NextResponse.json({ error: "无学习页权限" }, { status: 403 })
    const parsed = actionSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "请检查填写内容", details: parsed.error.flatten() }, { status: 400 })
    const input = parsed.data

    if (input.action === "publish") {
      if (access.role !== "owner") return NextResponse.json({ error: "只有负责人可以发布任务" }, { status: 403 })
      if (!await learnerIsAuthorized(access.workspaceId, input.learnerId)) return NextResponse.json({ error: "学员尚未获得学习页权限" }, { status: 400 })
      const steps = await generateSteps(input)
      const { data, error } = await serviceClient.from("learning_assignments").insert({
        workspace_id: access.workspaceId,
        learner_id: input.learnerId,
        created_by: user.id,
        title: input.title,
        brief: input.brief,
        cadence: input.cadence,
        due_date: input.dueDate,
        steps,
      }).select("id").single()
      if (error) throw error
      return NextResponse.json({ id: data.id }, { status: 201 })
    }

    if (input.action === "submit") {
      const { data: assignment, error: assignmentError } = await serviceClient.from("learning_assignments").select("id,workspace_id,learner_id,created_by,title,brief,steps").eq("id", input.assignmentId).eq("workspace_id", access.workspaceId).eq("learner_id", user.id).is("archived_at", null).maybeSingle()
      if (assignmentError) throw assignmentError
      if (!assignment) return NextResponse.json({ error: "任务不存在或无权提交" }, { status: 404 })
      const { data: submission, error: insertError } = await serviceClient.from("learning_submissions").insert({
        workspace_id: access.workspaceId,
        assignment_id: assignment.id,
        learner_id: user.id,
        sources: input.sources,
        findings: input.findings,
        reasoning: input.reasoning,
        reflection: input.reflection,
      }).select("id,workspace_id,assignment_id,learner_id,sources,findings,reasoning,reflection").single()
      if (insertError) {
        if (insertError.code === "23505") return NextResponse.json({ error: "这项任务已提交" }, { status: 409 })
        throw insertError
      }
      await serviceClient.from("learning_assignments").update({ status: "completed" }).eq("id", assignment.id)
      try {
        const total = await gradeSubmission(submission, assignment)
        return NextResponse.json({ id: submission.id, reviewStatus: "graded", total }, { status: 201 })
      } catch (gradeError) {
        return NextResponse.json({ id: submission.id, reviewStatus: "pending", message: "作业已保存，AI 初评暂未完成：" + errorMessage(gradeError) }, { status: 202 })
      }
    }

    if (access.role !== "owner") return NextResponse.json({ error: "只有负责人可以重试评分" }, { status: 403 })
    const { data: submission, error: submissionError } = await serviceClient.from("learning_submissions").select("id,workspace_id,assignment_id,learner_id,sources,findings,reasoning,reflection").eq("id", input.submissionId).eq("workspace_id", access.workspaceId).maybeSingle()
    if (submissionError) throw submissionError
    if (!submission) return NextResponse.json({ error: "提交不存在" }, { status: 404 })
    const { data: assignment, error: assignmentError } = await serviceClient.from("learning_assignments").select("id,title,brief,steps,created_by").eq("id", submission.assignment_id).eq("workspace_id", access.workspaceId).single()
    if (assignmentError) throw assignmentError
    const total = await gradeSubmission(submission, assignment)
    return NextResponse.json({ id: submission.id, reviewStatus: "graded", total })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}


export async function PATCH(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const access = await getWorkspaceAccess(user.id, "learning")
    if (!access || access.role !== "owner") return NextResponse.json({ error: "只有负责人可以管理学习任务" }, { status: 403 })
    const parsed = managementSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "请检查修改内容", details: parsed.error.flatten() }, { status: 400 })
    const input = parsed.data

    if (input.action === "update") {
      const { data: assignment, error: readError } = await serviceClient.from("learning_assignments")
        .select("id,status,archived_at").eq("id", input.assignmentId).eq("workspace_id", access.workspaceId).maybeSingle()
      if (readError) throw readError
      if (!assignment) return NextResponse.json({ error: "任务不存在" }, { status: 404 })
      if (assignment.archived_at) return NextResponse.json({ error: "请先从回收区恢复任务" }, { status: 409 })
      if (assignment.status !== "published") return NextResponse.json({ error: "已提交的任务不能修改评分依据" }, { status: 409 })
      const { data: submission, error: submissionError } = await serviceClient.from("learning_submissions")
        .select("id").eq("workspace_id", access.workspaceId).eq("assignment_id", input.assignmentId).limit(1).maybeSingle()
      if (submissionError) throw submissionError
      if (submission) return NextResponse.json({ error: "已提交的任务不能修改评分依据" }, { status: 409 })
      if (!await learnerIsAuthorized(access.workspaceId, input.learnerId)) return NextResponse.json({ error: "学员尚未获得学习页权限" }, { status: 400 })

      const steps = await generateSteps(input)
      const { data: lateSubmission, error: lateError } = await serviceClient.from("learning_submissions")
        .select("id").eq("workspace_id", access.workspaceId).eq("assignment_id", input.assignmentId).limit(1).maybeSingle()
      if (lateError) throw lateError
      if (lateSubmission) return NextResponse.json({ error: "学员已在修改期间提交，请刷新页面" }, { status: 409 })
      const { data: updated, error: updateError } = await serviceClient.from("learning_assignments").update({
        learner_id: input.learnerId,
        title: input.title,
        brief: input.brief,
        cadence: input.cadence,
        due_date: input.dueDate,
        steps,
        updated_at: new Date().toISOString(),
      }).eq("id", input.assignmentId).eq("workspace_id", access.workspaceId).eq("status", "published").is("archived_at", null).select("id").maybeSingle()
      if (updateError) throw updateError
      if (!updated) return NextResponse.json({ error: "任务状态已变化，请刷新页面" }, { status: 409 })
      return NextResponse.json({ id: updated.id, message: "任务已修改，AI 已重新拆解步骤。" })
    }

    const now = new Date().toISOString()
    let query = serviceClient.from("learning_assignments").update({
      archived_at: input.action === "archive" ? now : null,
      updated_at: now,
    }).eq("id", input.assignmentId).eq("workspace_id", access.workspaceId)
    query = input.action === "archive" ? query.is("archived_at", null) : query.not("archived_at", "is", null)
    const { data: changed, error } = await query.select("id").maybeSingle()
    if (error) throw error
    if (!changed) return NextResponse.json({ error: "任务不存在或状态已变化" }, { status: 404 })
    return NextResponse.json({
      id: changed.id,
      message: input.action === "archive" ? "任务已从学员页面删除，可在回收区恢复。" : "任务已恢复，学员可重新查看。",
    })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
