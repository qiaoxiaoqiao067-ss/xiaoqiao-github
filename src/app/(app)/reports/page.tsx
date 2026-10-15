"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
import {
  useReports,
  generateReportContent,
  parseReportContent,
  checkReportQuality,
  isTodayWorkday,
  type ReportFormData,
} from "@/hooks/use-reports"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { formatDate } from "@/lib/utils"
import { useTodos } from "@/hooks/use-todos"
import { useProjects } from "@/hooks/use-projects"
import { FileText, Send, Save, CheckCircle, XCircle, ChevronDown, ChevronUp, ChevronRight, History, Edit3, Trash2, Loader2, Sparkles, Calendar, AlertCircle, Copy, Eye, Wand2, ClipboardPaste } from "lucide-react"

export default function ReportsPage() {
  const { reports, todayDraft, loading, error, saveDraft, finalizeReport, deleteReport } = useReports()
  const { todos } = useTodos()
  const { projects } = useProjects()
  const [form, setForm] = useState<ReportFormData>({
    todayWork: "",
    tomorrowPlan: "",
    insight: "",
    reflection: "",
  })
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [historyReports, setHistoryReports] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    const baseUrl = window.location.origin
    fetch(`${baseUrl}/api/reports`)
      .then(r => r.json())
      .then(data => {
        console.log("[reports page] direct fetch got:", data.reports?.length, "items")
        setHistoryReports(data.reports || [])
        setHistoryLoading(false)
      })
      .catch(e => {
        console.error("[reports page] fetch error:", e)
        setHistoryLoading(false)
      })
  }, [])
  const [showPastePanel, setShowPastePanel] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(true)

  // Load today's draft on mount
  useEffect(() => {
    if (todayDraft?.content) {
      const parsed = parseReportContent(todayDraft.content)
      setForm(parsed)
      setShowPreview(true)
    }
  }, [todayDraft])
  const [aiGenerating, setAiGenerating] = useState(false)
  const [tab, setTab] = useState<"daily" | "weekly">("daily")

  const today = new Date()
  const todayDateStr = today.toISOString().slice(0, 10)
  const workday = isTodayWorkday()
  const reportContent = generateReportContent(form)
  const quality = checkReportQuality(reportContent)
  const hasContent = form.todayWork.trim() || form.tomorrowPlan.trim()
  const summarizeWorkspace = () => {
    const completed = todos.filter((item) => item.completed).slice(0, 8).map((item) => item.title)
    const active = projects.filter((item) => item.status === "active").slice(0, 5).map((item) => `${item.title}：${item.stage}${item.next_action ? `，下一步${item.next_action}` : ""}`)
    const lines = [...completed, ...active]
    if (!lines.length) { setSaveMessage("今天还没有可汇总的任务或项目记录"); return }
    setForm((current) => ({ ...current, todayWork: lines.join("\n") }))
    setSaveMessage(`已汇总 ${lines.length} 条工作记录，可继续编辑后生成日报`)
  }

  const handleSaveDraft = async () => {
    if (!hasContent) return
    setSaving(true)
    setSaveMessage(null)
    try {
      await saveDraft(todayDateStr, reportContent)
      setSaveMessage("草稿已保存")
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (e: any) {
      setSaveMessage(`保存失败: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = async () => {
    if (!hasContent) return
    setFinalizing(true)
    setSaveMessage(null)
    setConfirmFinalize(false)
    try {
      await finalizeReport(todayDateStr, reportContent)
      setSaveMessage(`${todayDateStr} 日报已定稿归档`)
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (e: any) {
      setSaveMessage(`定稿失败: ${e.message}`)
    } finally {
      setFinalizing(false)
    }
  }

  const handleSendToLark = async () => {
    setSending(true)
    setSaveMessage(null)
    try {
      // Try Lark webhook
      const webhookUrl = process.env.NEXT_PUBLIC_LARK_WEBHOOK_URL
      if (webhookUrl) {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            msg_type: "text",
            content: { text: reportContent },
          }),
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        setSaveMessage("已发送到飞书")
        setConfirmSend(false)
      } else {
        await navigator.clipboard.writeText(reportContent)
        setSaveMessage("已复制日报到剪切板（未配置飞书 Webhook）")
        setConfirmSend(false)
      }
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (e: any) {
      setSaveMessage(`发送失败: ${e.message}`)
    } finally {
      setSending(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reportContent)
    setSaveMessage("已复制到剪切板")
    setTimeout(() => setSaveMessage(null), 2000)
  }

  const handleAIGenerate = async () => {
    if (!form.todayWork.trim()) {
      setSaveMessage("请先在「今日工作」中填写简要内容")
      setTimeout(() => setSaveMessage(null), 3000)
      return
    }
    setAiGenerating(true)
    setSaveMessage(null)
    try {
      const briefInput = [
        form.todayWork && `今日工作：${form.todayWork}`,
        form.tomorrowPlan && `明日计划：${form.tomorrowPlan}`,
        form.insight && `心得：${form.insight}`,
        form.reflection && `反思：${form.reflection}`,
      ].filter(Boolean).join("\n")

      const resp = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefInput }),
      })

      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || "生成失败")

      // Parse AI response back into form fields
      const report = data.report
      const todayWorkMatch = report.match(/一、今日工作\n([\s\S]*?)(?:\n\n二、|\n二、)/)
      const tomorrowMatch = report.match(/二、明日工作\n([\s\S]*?)(?:\n\n三、|\n三、)/)
      const insightMatch = report.match(/三、今日心得\n([\s\S]*?)(?:\n\n四、|\n四、)/)
      const reflectionMatch = report.match(/四、复盘反思\n([\s\S]*)$/)

      setForm({
        todayWork: todayWorkMatch?.[1]?.replace(/^\d+\./gm, "").trim() || form.todayWork,
        tomorrowPlan: tomorrowMatch?.[1]?.replace(/^\d+\./gm, "").trim() || form.tomorrowPlan,
        insight: insightMatch?.[1]?.trim() || form.insight,
        reflection: reflectionMatch?.[1]?.trim() || form.reflection,
      })
      setShowPreview(true)
      setSaveMessage("AI 已完善日报内容，请审核后保存")
      setTimeout(() => setSaveMessage(null), 4000)
    } catch (e: any) {
      setSaveMessage(`AI 生成失败: ${e.message}`)
      setTimeout(() => setSaveMessage(null), 5000)
    } finally {
      setAiGenerating(false)
    }
  }

  const handleLoadReport = (content: string) => {
    // Parse content back into form
    const todayWorkMatch = content.match(/一、今日工作\n([\s\S]*?)(?:\n\n二、)/)
    const tomorrowMatch = content.match(/二、明日工作\n([\s\S]*?)(?:\n\n三、)/)
    const insightMatch = content.match(/三、今日心得\n([\s\S]*?)(?:\n\n四、)/)
    const reflectionMatch = content.match(/四、复盘反思\n([\s\S]*)$/)

    setForm({
      todayWork: todayWorkMatch?.[1]?.replace(/^\d+\./gm, "").trim() || "",
      tomorrowPlan: tomorrowMatch?.[1]?.replace(/^\d+\./gm, "").trim() || "",
      insight: insightMatch?.[1]?.trim() || "",
      reflection: reflectionMatch?.[1]?.trim() || "",
    })
    setShowHistory(false)
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHero eyebrow="Reflect, refine, repeat." title="Reports 工作复盘" description={<>
              {formatDate(today)} ·{" "}
              {workday ? (
                <Badge variant="success" className="text-[10px]">工作日</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">休息日</Badge>
              )}
            </>} action={
          tab === "daily" ? (
              <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)} className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                <History className="mr-1 h-4 w-4" />
                历史
                {showHistory ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
              </Button>
          ) : null
        } />
        <div className="inline-flex rounded-full border bg-card p-1 shadow-sm">
          {(["daily", "weekly"] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${tab === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{item === "daily" ? "日报" : "周报"}</button>)}
        </div>

        {/* Daily Report Tab */}
        {tab === "daily" && (<>
          {/* Weekend Notice */}
        {!workday && (
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="py-3 flex items-center gap-2 text-sm text-amber-700">
              <Calendar className="h-4 w-4" />
              今天是休息日，日报将在下周一 18:30 发送。你也可以提前填写。
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Save Message */}
        {saveMessage && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-600 text-sm">
            <CheckCircle className="h-4 w-4" />
            {saveMessage}
          </div>
        )}

        {/* Main: Form + Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Edit3 className="h-4 w-4" />
                填写日报
                <Button variant="outline" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={summarizeWorkspace}><Sparkles className="h-3 w-3" />从工作台汇总</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowPastePanel(!showPastePanel)}
                >
                  <ClipboardPaste className="h-3 w-3" />
                  {showPastePanel ? "关闭" : "粘贴导入"}
                </Button>
              </CardTitle>
              <CardDescription>
                {todayDraft ? (
                  <span className="flex items-center gap-1.5">
                    <Badge variant="warning" className="text-[10px] px-1.5 py-0">草稿</Badge>
                    已加载今日草稿，可继续编辑
                  </span>
                ) : (
                  "逐项填写今日工作内容"
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Paste Import Panel */}
              {showPastePanel && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">粘贴导入</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText()
                          if (text.trim()) setPasteText(text)
                        } catch {}
                      }}
                    >
                      从剪切板读取
                    </Button>
                  </div>
                  <Textarea
                    placeholder="在此粘贴日报内容，可直接编辑修改，然后点「导入」&#10;&#10;支持标准日报格式（含一、今日工作等标题）自动解析填充&#10;也支持普通文本直接导入到今日工作"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={8}
                    className="resize-none text-sm font-mono"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPasteText(""); setShowPastePanel(false) }}
                    >
                      关闭
                    </Button>
                    <Button
                      size="sm"
                      disabled={!pasteText.trim()}
                      onClick={() => {
                        const hasFormat = /一、今日工作|二、明日工作/.test(pasteText)
                        if (hasFormat) {
                          const parsed = parseReportContent(pasteText)
                          setForm(parsed)
                          setSaveMessage("已解析并自动填充")
                        } else {
                          setForm((f) => ({ ...f, todayWork: pasteText.trim() }))
                          setSaveMessage("已导入到今日工作")
                        }
                        setShowPreview(true)
                        setTimeout(() => setSaveMessage(null), 2000)
                      }}
                    >
                      导入
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">一、今日工作</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAIGenerate}
                    disabled={aiGenerating || !form.todayWork.trim()}
                    className="h-7 text-xs gap-1 text-violet-500 hover:text-violet-600 hover:bg-violet-50"
                  >
                    {aiGenerating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    AI 完善
                  </Button>
                </div>
                <Textarea
                  placeholder="每行一条工作事项&#10;例：推进管培生培养体系2.0文档修订"
                  value={form.todayWork}
                  onChange={(e) => setForm({ ...form, todayWork: e.target.value })}
                  rows={4}
                  className="resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">二、明日计划</label>
                <Textarea
                  placeholder="每行一条计划事项"
                  value={form.tomorrowPlan}
                  onChange={(e) => setForm({ ...form, tomorrowPlan: e.target.value })}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">三、今日心得</label>
                <Input
                  placeholder="1-2句话总结今日收获"
                  value={form.insight}
                  onChange={(e) => setForm({ ...form, insight: e.target.value })}
                  maxLength={100}
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {form.insight.length}/100
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">四、复盘反思</label>
                <Textarea
                  placeholder="问题：...&#10;改进：..."
                  value={form.reflection}
                  onChange={(e) => setForm({ ...form, reflection: e.target.value })}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  预览
                </CardTitle>
                <CardDescription>格式检查与效果预览</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CardHeader>
            {showPreview && (
              <CardContent className="space-y-4">
                {/* Quality Checks */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground mb-2">质量检查</p>
                  {quality.checks.map((check, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {check.ok ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      )}
                      <span className={check.ok ? "text-muted-foreground" : "text-destructive"}>
                        {check.label}
                      </span>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Rendered Preview */}
                <div className="rounded-lg bg-muted/50 p-4">
                  <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                    {reportContent}
                  </pre>
                </div>

                <p className="text-[10px] text-muted-foreground text-right">
                  {reportContent.replace(/\s/g, "").length} 字
                </p>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={handleCopy} disabled={!hasContent}>
            <Copy className="mr-1 h-4 w-4" />
            复制
          </Button>
          <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="mr-1 h-4 w-4" />
            {showPreview ? "隐藏预览" : "查看预览"}
          </Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving || !hasContent}>
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            保存草稿
          </Button>
          {confirmFinalize ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirmFinalize(false)}>
                取消
              </Button>
              <Button variant="default" onClick={handleFinalize} disabled={finalizing}>
                {finalizing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />}
                确认定稿
              </Button>
            </>
          ) : (
            <Button variant="default" onClick={() => setConfirmFinalize(true)} disabled={!hasContent}>
              <CheckCircle className="mr-1 h-4 w-4" />
              定稿归档
            </Button>
          )}
          {confirmSend ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmSend(false)}
                >
                  取消
                </Button>
                <Button
                  variant="default"
                  onClick={handleSendToLark}
                  disabled={sending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {sending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1 h-4 w-4" />
                  )}
                  确认发送
                </Button>
              </>
            ) : (
              <Button
                variant="default"
                onClick={() => setConfirmSend(true)}
                disabled={!hasContent}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="mr-1 h-4 w-4" />
                发送飞书
              </Button>
            )}
        </div>

        {/* History */}
        {showHistory && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                日报历史 ({historyReports.length})
              </CardTitle>
              <CardDescription>最近 30 条日报记录 | loading: {String(historyLoading)}</CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : historyReports.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">暂无日报记录</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {historyReports.map((report: any) => (
                    <HistoryItem
                      key={report.id}
                      report={report}
                      onLoad={handleLoadReport}
                      onDelete={deleteReport}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
        </> )}

        {/* Weekly Tab */}
        {tab === "weekly" && <WeeklyTab />}
      </div>
    </AppLayout>
  )
}

function HistoryItem({ report, onLoad, onDelete }: { report: any; onLoad: (content: string) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
          <span className="text-sm font-medium">{report.date} 日报</span>
          {report.sent_to_lark && <Badge variant="success" className="text-[10px]">已发送</Badge>}
        </div>
        <div className="flex gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onLoad(report.content)} title="加载到编辑器">
            <Edit3 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(report.id)} title="删除">
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t">
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed mt-3 bg-muted/30 p-3 rounded-md">{report.content}</pre>
        </div>
      )}
    </div>
  )
}

function WeeklyTab() {
  const [weekStart, setWeekStart] = useState(getMonday())
  const weekEnd = getFriday(weekStart)
  const [dailyReports, setDailyReports] = useState<any[]>([])
  const [loadingAgg, setLoadingAgg] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [weeklyContent, setWeeklyContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [weeklyHistory, setWeeklyHistory] = useState<any[]>([])
  const [showWeeklyHistory, setShowWeeklyHistory] = useState(false)

  // Load weekly history on mount
  useEffect(() => {
    const baseUrl = window.location.origin
    fetch(`${baseUrl}/api/weekly-report`)
      .then(r => r.json())
      .then(data => setWeeklyHistory(data.reports || []))
      .catch(() => {})
  }, [])

  const handleAggregate = async () => {
    setLoadingAgg(true)
    setMessage("")
    try {
      const baseUrl = window.location.origin
      const resp = await fetch(`${baseUrl}/api/weekly-report?start=${weekStart}&end=${weekEnd}`)
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error)
      setDailyReports(data.reports || [])
      if (data.reports?.length === 0) setMessage("本周暂无日报记录")
      else setMessage(`已加载 ${data.reports.length} 篇日报`)
    } catch (e: any) {
      setMessage(`加载失败: ${e.message}`)
    } finally {
      setLoadingAgg(false)
    }
  }

  const handleGenerate = async () => {
    if (dailyReports.length === 0) {
      setMessage("请先加载日报")
      return
    }
    setGenerating(true)
    setMessage("")
    try {
      const baseUrl = window.location.origin
      const resp = await fetch(`${baseUrl}/api/weekly-report`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyContents: dailyReports.map((r: any) => r.content),
          weekStart,
          weekEnd,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error)
      setWeeklyContent(data.report)
      setMessage("周报已生成，请审核修改后保存")
    } catch (e: any) {
      setMessage(`生成失败: ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!weeklyContent.trim()) return
    setSaving(true)
    setMessage("")
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("未登录")

      const baseUrl = window.location.origin
      const summary = `${weekStart} - ${weekEnd} 周报`
      const resp = await fetch(`${baseUrl}/api/weekly-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.user.id,
          weekStart,
          weekEnd,
          content: weeklyContent,
          summary,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error)
      setMessage("周报已保存")
    } catch (e: any) {
      setMessage(`保存失败: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const weekLabel = `${weekStart} 至 ${weekEnd}`

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">生成本周周报</CardTitle>
          <CardDescription>自动聚合本周日报，AI 生成周报初稿</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Week selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">周区间：</span>
            <Input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="w-40"
            />
            <span className="text-sm text-muted-foreground">至</span>
            <span className="text-sm font-medium">{weekEnd}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleAggregate} disabled={loadingAgg}>
              {loadingAgg ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}
              聚合日报
            </Button>
            <Button onClick={handleGenerate} disabled={generating || dailyReports.length === 0} className="text-violet-600">
              {generating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
              AI 生成周报
            </Button>
            <Button variant="default" onClick={handleSave} disabled={saving || !weeklyContent.trim()}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              保存周报
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowWeeklyHistory(!showWeeklyHistory)}>
              <History className="mr-1 h-4 w-4" />
              历史 ({weeklyHistory.length})
            </Button>
          </div>

          {message && (
            <div className={`text-sm p-2 rounded ${message.includes("失败") ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}`}>
              {message}
            </div>
          )}

          {/* Daily reports list */}
          {dailyReports.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                本周日报 ({dailyReports.length} 篇)
              </summary>
              <div className="mt-2 space-y-1 pl-4 border-l-2 border-muted">
                {dailyReports.map((r: any) => (
                  <div key={r.id} className="text-xs text-muted-foreground">
                    <span className="font-medium">{r.date}</span>: {r.content.slice(0, 60).replace(/\n/g, " ")}...
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Weekly Report Preview/Editor */}
      {weeklyContent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{weekLabel} 周报</CardTitle>
            <CardDescription>审核修改后保存</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={weeklyContent}
              onChange={(e) => setWeeklyContent(e.target.value)}
              rows={20}
              className="resize-none font-mono text-sm"
            />
          </CardContent>
        </Card>
      )}

      {/* Weekly History */}
      {showWeeklyHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              周报历史 ({weeklyHistory.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无周报记录</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {weeklyHistory.map((r: any) => (
                  <WeeklyHistoryItem key={r.id} report={r} onLoad={(c) => setWeeklyContent(c)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function WeeklyHistoryItem({ report, onLoad }: { report: any; onLoad: (c: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
          <span className="text-sm font-medium">{report.week_start} - {report.week_end} 周报</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onLoad(report.content) }} title="加载到编辑器">
          <Edit3 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t">
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed mt-3 bg-muted/30 p-3 rounded-md">{report.content}</pre>
        </div>
      )}
    </div>
  )
}

function getMonday(d = new Date()) {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return monday.toISOString().slice(0, 10)
}

function getFriday(mondayStr: string) {
  const monday = new Date(mondayStr)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  return friday.toISOString().slice(0, 10)
}
