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
  retrieval: "信息获取", evidence: "实践与证据", reasoning: "逻辑与思考", synthesis: "迁移应用", reflection: "开放复盘",
}

const trainingTemplates = [
  { title: "AI 工具实操：用两种方法完成同一交付", cadence: "weekly" as const, brief: "选择一项真实短剧工作，例如整理选题情报、生成角色小传或制作片段分镜。至少尝试一种 AI 工具和一种不用该工具的做法；记录提示词、输入资料、关键操作、输出版本、失败与修正。提交可查看的作品或过程记录，并比较效率、质量、错误风险与适用边界。最后说明你会如何改进工作流。" },
  { title: "短剧市场观察：多看剧并形成自己的判断", cadence: "weekly" as const, brief: "一周内完整观看至少 3 部不同题材、不同平台或不同受众定位的短剧，记录剧名、平台、集数、观看日期与可查来源。观察开场、题材、人群、宣发和商业模式，检索必要的市场资料。区分实际看到的内容、平台公开数据、行业传闻和个人判断；比较作品差异，提出一个可验证的市场结论及反例。" },
  { title: "内容拆解：人物、人性与世界观", cadence: "weekly" as const, brief: "选择 2 部价值观或题材不同的短剧，认真观看并拆解前 3 集及一个关键转折。逐段记录人物欲望、恐惧、关系、选择、代价、冲突因果、情绪钩子与作品默认的世界规则。引用具体场景，不只复述剧情。分别站在不同角色、不同观众和文化背景下解释同一冲突，说明你认同与不认同的地方及依据。" },
  { title: "动手产出：从观察到可交付作品", cadence: "weekly" as const, brief: "从本周看片或市场观察中选一个洞察，制作一份可被他人使用的短剧交付物：一卡、人物关系图、前三集节拍表、短场景剧本或分镜样稿，任选其一。提交初稿、收到或自拟的反馈、修改稿和改动理由。说明哪些判断来自证据，哪些是创作选择，并列出下一轮验证办法。" },
  { title: "多元思考：同一故事的不同解释", cadence: "weekly" as const, brief: "选一个容易产生分歧的短剧人物或情节，至少从 3 种不同立场理解它，例如人物自身、对立角色、不同年龄或文化背景的观众。先准确复述各方最有力的理由，再指出各方可能忽略的事实与代价。寻找剧情场景和观众反馈作为依据，提出两个不同的改写方向，并评估各自会影响哪些受众。" },
  { title: "今日看片：一集里的选择与代价", cadence: "daily" as const, brief: "观看一部你此前没看过的短剧至少 2 集，记录剧名、平台、观看日期和两个具体场景。写出主角想要什么、遇到什么阻碍、做了什么选择、付出什么代价。再从另一位角色或另一类观众的角度解释同一场景，最后提出一个你想继续验证的问题。" },
  { title: "今日 AI 实操：做一版并复盘", cadence: "daily" as const, brief: "选用一个 AI 工具完成一个小型短剧工作交付，例如 100 字卖点、一张人物关系表或一段分镜说明。保留提示词、关键输入、原始输出和修改后版本。指出至少 2 个工具做对或做错的地方，说明你如何核查和修改，并给出下一次更好的操作步骤。" },
]

export default function LearningPage() {
  const [data, setData] = useState<LearningData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [learnerId, setLearnerId] = useState("")
  const [title, setTitle] = useState("")
  const [brief, setBrief] = useState("")
  const [taskMode, setTaskMode] = useState<"custom" | "template">("custom")
  const [templateIndex, setTemplateIndex] = useState("")
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

  function chooseCustom() {
    setTaskMode("custom")
    setTemplateIndex("")
    setTitle("")
    setBrief("")
    setCadence("daily")
    setDueDate("")
  }

  function chooseTemplate(value: string) {
    setTemplateIndex(value)
    const item = trainingTemplates[Number(value)]
    if (value !== "" && item) { setTitle(item.title); setBrief(item.brief); setCadence(item.cadence) }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ok = await post({ action: "publish", learnerId, title, brief, cadence, dueDate: dueDate || null })
    if (ok) { setTitle(""); setBrief(""); setDueDate(""); setTemplateIndex(""); setTaskMode("custom") }
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
          description={owner ? "自定义任务或选用训练模板，覆盖 AI 工具、市场、内容、动手与多元思考。" : "多看剧、多动手，记录观察、作品、判断与复盘。"}
        />
        {message && <div role="status" className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3 text-sm">{message}</div>}
        {loading && <p className="text-sm text-muted-foreground">正在加载学习任务…</p>}

        {owner && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" />发布学习任务</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={publish} className="space-y-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="任务创建方式">
                    <Button type="button" variant={taskMode === "custom" ? "default" : "outline"} onClick={chooseCustom}>自行编写任务</Button>
                    <Button type="button" variant={taskMode === "template" ? "default" : "outline"} onClick={() => setTaskMode("template")}>从训练模板开始</Button>
                  </div>
                  {taskMode === "template" ? (
                    <label className="block space-y-2 text-sm">选择训练方向
                      <select className="flex h-10 w-full rounded-full border border-input bg-card px-4" value={templateIndex} onChange={(event) => chooseTemplate(event.target.value)}>
                        <option value="">选择一个模板后，仍可在下方改写</option>
                        {trainingTemplates.map((item, index) => <option key={item.title} value={index}>{item.title}</option>)}
                      </select>
                    </label>
                  ) : (
                    <p className="rounded-2xl bg-primary/5 px-4 py-3 text-sm text-muted-foreground">直接在下方填写标题和具体要求；AI 会根据你写的内容拆解，不限制任务主题。</p>
                  )}
                </div>
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
                <label className="block space-y-2 text-sm">任务标题（可自行填写）
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：观看三部不同题材短剧并做人物选择分析" maxLength={120} required />
                </label>
                <label className="block space-y-2 text-sm">任务目标与要求（可自行填写）
                  <Textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="写清要看什么剧、使用什么 AI 工具、动手做什么、从哪些视角思考，以及希望提交什么成果。AI 会按你的要求拆解步骤。" rows={5} maxLength={4000} required />
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
                        <div><div className="font-medium">资料与过程</div><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{submission.sources}</p></div>
                        <div><div className="font-medium">观察或作品</div><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{submission.findings}</p></div>
                        <div><div className="font-medium">分析与判断</div><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{submission.reasoning}</p></div>
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
                      <label className="block space-y-2">参考资料、观看记录或工具使用过程（附链接或关键输入）
                        <Textarea value={draft.sources} onChange={(event) => updateDraft(assignment.id, "sources", event.target.value)} rows={4} minLength={20} required />
                      </label>
                      <label className="block space-y-2">观察结果或动手作品（写清具体内容与交付链接）
                        <Textarea value={draft.findings} onChange={(event) => updateDraft(assignment.id, "findings", event.target.value)} rows={4} minLength={30} required />
                      </label>
                      <label className="block space-y-2">分析与判断（人物动机、因果、证据、不同解释）
                        <Textarea value={draft.reasoning} onChange={(event) => updateDraft(assignment.id, "reasoning", event.target.value)} rows={5} minLength={30} required />
                      </label>
                      <label className="block space-y-2">学习复盘（错误、其他视角和下一次改进）
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
