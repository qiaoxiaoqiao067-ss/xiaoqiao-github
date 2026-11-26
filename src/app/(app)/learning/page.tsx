"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { BookOpen, CheckCircle2, ClipboardList, Sparkles } from "lucide-react"

type Step = { title: string; instructions: string; deliverable: string }
type Assignment = {
  id: string
  learner_id: string
  title: string
  brief: string
  cadence: "daily" | "weekly" | "extra"
  due_date: string | null
  steps: Step[]
  status: string
  created_at: string
}
type Score = { retrieval: number; evidence: number; reasoning: number; synthesis: number; reflection: number }
type Submission = {
  id: string
  assignment_id: string
  learner_id: string
  sources: string
  findings: string
  reasoning: string
  reflection: string
  review_status: "pending" | "graded"
  score: Score | null
  total_score: number | null
  feedback: string | null
  next_plan: { strengths?: string[]; improvements?: string[]; next_task?: { title: string; brief: string } } | null
  submitted_at: string
}
type Learner = { id: string; email: string; name: string | null }
type LearningData = { role: "owner" | "learner"; assignments: Assignment[]; submissions: Submission[]; learners?: Learner[] }
type Draft = { sources: string; findings: string; reasoning: string; reflection: string }
const emptyDraft: Draft = { sources: "", findings: "", reasoning: "", reflection: "" }
const cadenceLabel = { daily: "每日", weekly: "每周", extra: "临时" }
const scoreLabel: Record<keyof Score, string> = {
  retrieval: "信息检索", evidence: "证据质量", reasoning: "逻辑推理", synthesis: "综合迁移", reflection: "学习复盘",
}

const trainingTemplates = [
  { title: "第 1 周：建立短剧信息检索与证据台账", cadence: "weekly" as const, brief: "围绕一个具体短剧问题（例如某类题材为何近期受关注），至少检索 3 类独立来源：平台原始信息、行业报道或数据、创作者或观众反馈。记录链接、发布日期、检索日期、关键说法、可核验程度和来源之间的冲突。周末提交一页结论，明确事实、推断、反例与尚待验证的问题。" },
  { title: "第 2 周：拆解短剧开场与因果链", cadence: "weekly" as const, brief: "选择 2 部不同题材的短剧，观察各自前 3 集。逐集记录人物目标、障碍、冲突升级、情绪转折与结尾钩子。用具体场景作为证据，比较哪些设计更可能推动继续观看，提出至少 1 个相反解释，最后归纳可迁移的叙事原则。" },
  { title: "第 3 周：验证市场判断", cadence: "weekly" as const, brief: "选取一个短剧行业判断，例如题材热度、平台分发或变现模式。检索原始数据和不同立场的公开资料，标注样本范围与时间。写出支持与反对证据，区分相关性与因果性，给出有条件的结论与下一步验证方案。" },
  { title: "第 4 周：把研究方法迁移到新领域", cadence: "weekly" as const, brief: "选择短剧之外的一个相邻领域，如漫剧、短视频或网文。提出一个可验证的问题，独立设计检索词与来源清单，建立证据台账，比较至少 2 种解释，并写出结论、局限和可执行建议。复盘与短剧研究方法的共通点和差异。" },
  { title: "今日训练：核查一条短剧行业说法", cadence: "daily" as const, brief: "找出一条近期常见的短剧行业说法。追溯它最早可找到的出处，寻找至少 2 个独立来源和 1 个可能的反例。写清哪些是已核实事实、哪些是推断，并给出暂时结论与置信度。" },
]

export default function LearningPage() {
  const [data, setData] = useState<LearningData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [learnerId, setLearnerId] = useState("")
  const [title, setTitle] = useState("")
  const [brief, setBrief] = useState("")
  const [cadence, setCadence] = useState<Assignment["cadence"]>("daily")
  const [dueDate, setDueDate] = useState("")
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const refresh = useCallback(async () => {
    const response = await fetch("/api/learning", { cache: "no-store" })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "学习任务加载失败")
    setData(body as LearningData)
    if (body.learners?.length) setLearnerId((current) => current || body.learners[0].id)
  }, [])

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message)).finally(() => setLoading(false))
  }, [refresh])

  async function post(payload: Record<string, unknown>) {
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "操作失败")
      await refresh()
      setMessage(body.message || (body.reviewStatus === "graded" ? "作业已提交，AI 初评已生成，明日练习已发布。" : "任务已发布。"))
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ok = await post({ action: "publish", learnerId, title, brief, cadence, dueDate: dueDate || null })
    if (ok) { setTitle(""); setBrief(""); setDueDate("") }
  }

  function updateDraft(id: string, key: keyof Draft, value: string) {
    setDrafts((old) => ({ ...old, [id]: { ...(old[id] || emptyDraft), [key]: value } }))
  }

  async function submit(event: FormEvent<HTMLFormElement>, assignmentId: string) {
    event.preventDefault()
    const ok = await post({ action: "submit", assignmentId, ...(drafts[assignmentId] || emptyDraft) })
    if (ok) setDrafts((old) => { const next = { ...old }; delete next[assignmentId]; return next })
  }

  const owner = data?.role === "owner"
  const assignments = data?.assignments || []
  const submissions = data?.submissions || []
  const learners = data?.learners || []

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6 pb-12">
        <PageHero
          eyebrow="Yunxia Learning"
          title={owner ? "学习任务管理" : "我的学习空间"}
          description={owner ? "发布训练任务，查看学员的检索、分析与成长记录。" : "按步骤自主检索和思考，提交依据、推理与复盘。"}
        />
        {message && <div role="status" className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3 text-sm">{message}</div>}
        {loading && <p className="text-sm text-muted-foreground">正在加载学习任务…</p>}

        {owner && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" />发布学习任务</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={publish} className="space-y-4">
                <label className="block space-y-2 text-sm">可选训练模板
                  <select className="flex h-10 w-full rounded-full border border-input bg-card px-4" defaultValue="" onChange={(event) => { const item = event.target.value === "" ? undefined : trainingTemplates[Number(event.target.value)]; if (item) { setTitle(item.title); setBrief(item.brief); setCadence(item.cadence) } }}>
                    <option value="">自行填写任务，或选择模板</option>
                    {trainingTemplates.map((item, index) => <option key={item.title} value={index}>{item.title}</option>)}
                  </select>
                </label>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="space-y-2 text-sm">学员
                    <select className="flex h-10 w-full rounded-full border border-input bg-card px-4" value={learnerId} onChange={(event) => setLearnerId(event.target.value)} required>
                      {learners.length === 0 && <option value="">暂无已授权学员</option>}
                      {learners.map((learner) => <option key={learner.id} value={learner.id}>{learner.name || learner.email}</option>)}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm">任务类型
                    <select className="flex h-10 w-full rounded-full border border-input bg-card px-4" value={cadence} onChange={(event) => setCadence(event.target.value as Assignment["cadence"])}>
                      <option value="daily">每日任务</option><option value="weekly">每周任务</option><option value="extra">临时任务</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm">截止日期
                    <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                  </label>
                </div>
                <label className="block space-y-2 text-sm">任务标题
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例：比较两部短剧前 3 集的留存钩子" maxLength={120} required />
                </label>
                <label className="block space-y-2 text-sm">任务目标与要求
                  <Textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="写清目标、范围和交付标准。AI 会把任务拆成可执行的检索与分析步骤。" rows={5} maxLength={4000} required />
                </label>
                <Button type="submit" disabled={busy || !learnerId}>{busy ? "正在拆解并发布…" : "AI 拆解并发布"}</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardContent className="flex items-center gap-4 py-5"><BookOpen className="h-6 w-6 text-primary" /><div><div className="text-2xl font-semibold">{assignments.length}</div><div className="text-sm text-muted-foreground">已发布任务</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-4 py-5"><ClipboardList className="h-6 w-6 text-primary" /><div><div className="text-2xl font-semibold">{assignments.filter((item) => !submissions.some((entry) => entry.assignment_id === item.id)).length}</div><div className="text-sm text-muted-foreground">待提交</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-4 py-5"><CheckCircle2 className="h-6 w-6 text-primary" /><div><div className="text-2xl font-semibold">{submissions.filter((item) => item.review_status === "graded").length}</div><div className="text-sm text-muted-foreground">已初评</div></div></CardContent></Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">{owner ? "任务与作业" : "我的任务"}</h2>
          {!loading && assignments.length === 0 && (
            <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">学习任务尚未发布。发布后会出现在这里。</CardContent></Card>
          )}
          {assignments.map((assignment) => {
            const submission = submissions.find((item) => item.assignment_id === assignment.id)
            const learner = learners.find((item) => item.id === assignment.learner_id)
            const draft = drafts[assignment.id] || emptyDraft
            return (
              <Card key={assignment.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-primary">{cadenceLabel[assignment.cadence]}任务 · {assignment.due_date ? "截止 " + assignment.due_date : "未设截止日期"}{owner && learner ? " · " + (learner.name || learner.email) : ""}</div>
                      <CardTitle className="text-lg">{assignment.title}</CardTitle>
                    </div>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs">{submission ? (submission.review_status === "graded" ? "已初评" : "待初评") : "待提交"}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 text-sm">
                  <p className="whitespace-pre-wrap leading-7">{assignment.brief}</p>
                  <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
                    <h3 className="font-medium">执行步骤</h3>
                    {(assignment.steps || []).map((step, index) => (
                      <div key={index} className="border-t border-border pt-3 first:border-0 first:pt-0">
                        <div className="font-medium">{index + 1}. {step.title}</div>
                        <div className="mt-1 text-muted-foreground">{step.instructions}</div>
                        <div className="mt-1 text-xs text-primary">交付：{step.deliverable}</div>
                      </div>
                    ))}
                  </div>
                  {submission ? (
                    <div className="space-y-4 border-t border-border pt-5">
                      <h3 className="font-semibold">提交与反馈</h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div><div className="font-medium">来源与链接</div><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{submission.sources}</p></div>
                        <div><div className="font-medium">检索发现</div><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{submission.findings}</p></div>
                        <div><div className="font-medium">判断与推理</div><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{submission.reasoning}</p></div>
                        <div><div className="font-medium">学习复盘</div><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{submission.reflection || "未填写"}</p></div>
                      </div>
                      {submission.review_status === "graded" ? (
                        <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                          <div className="text-lg font-semibold">AI 初评：{submission.total_score}/100</div>
                          {submission.score && <div className="flex flex-wrap gap-2">{(Object.keys(scoreLabel) as (keyof Score)[]).map((key) => <span key={key} className="rounded-full bg-card px-3 py-1 text-xs">{scoreLabel[key]} {submission.score?.[key]}</span>)}</div>}
                          <p className="whitespace-pre-wrap leading-7">{submission.feedback}</p>
                          {submission.next_plan?.improvements?.length ? <div><div className="font-medium">下一步改进</div><ul className="mt-1 list-inside list-disc space-y-1">{submission.next_plan.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
                          {submission.next_plan?.next_task && <div className="text-primary">明日练习已发布：{submission.next_plan.next_task.title}</div>}
                          <p className="text-xs text-muted-foreground">AI 初评仅根据提交内容判断，外部来源尚未核验。</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>作业已保存，等待 AI 初评。</span>
                          {owner && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => post({ action: "retry_grade", submissionId: submission.id })}>重试初评</Button>}
                        </div>
                      )}
                    </div>
                  ) : !owner ? (
                    <form onSubmit={(event) => submit(event, assignment.id)} className="space-y-4 border-t border-border pt-5">
                      <h3 className="font-semibold">提交作业</h3>
                      <label className="block space-y-2">来源与链接（注明发布时间、检索日期和可信度）
                        <Textarea value={draft.sources} onChange={(event) => updateDraft(assignment.id, "sources", event.target.value)} rows={4} minLength={20} required />
                      </label>
                      <label className="block space-y-2">检索发现（具体事实、数据和出处）
                        <Textarea value={draft.findings} onChange={(event) => updateDraft(assignment.id, "findings", event.target.value)} rows={4} minLength={30} required />
                      </label>
                      <label className="block space-y-2">判断与推理（区分事实、推断、反例和结论）
                        <Textarea value={draft.reasoning} onChange={(event) => updateDraft(assignment.id, "reasoning", event.target.value)} rows={5} minLength={30} required />
                      </label>
                      <label className="block space-y-2">学习复盘（哪里还不确定、下次怎么查）
                        <Textarea value={draft.reflection} onChange={(event) => updateDraft(assignment.id, "reflection", event.target.value)} rows={3} />
                      </label>
                      <Button type="submit" disabled={busy}>{busy ? "正在提交与初评…" : "提交作业"}</Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </AppLayout>
  )
}
