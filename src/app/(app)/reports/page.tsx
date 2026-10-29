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
  type DailyReport,
  type ReportFormData,
} from "@/hooks/use-reports"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { formatDate } from "@/lib/utils"
import { WeeklyReportTab } from "@/components/reports/weekly-report-tab"
import { FileText, Send, Save, CheckCircle, XCircle, ChevronDown, ChevronUp, ChevronRight, History, Edit3, Trash2, Loader2, Sparkles, Calendar, AlertCircle, Copy, Eye, Wand2, ClipboardPaste } from "lucide-react"
import { DataError } from "@/components/ui/data-error"

export default function ReportsPage() {
  const { todayDraft, error, saveDraft, finalizeReport, deleteReport, markSentToLark, refetch } = useReports()
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
  const [historyReports, setHistoryReports] = useState<DailyReport[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [finalizedContent, setFinalizedContent] = useState("")
  const [finalizedReportId, setFinalizedReportId] = useState("")

  useEffect(() => {
    const baseUrl = window.location.origin
    fetch(`${baseUrl}/api/reports`)
      .then(r => r.json())
      .then(data => {
        console.log("[reports page] direct fetch got:", data.reports?.length, "items")
        setHistoryReports(data.reports || [])
        const receivedReports = (data.reports || []) as DailyReport[]
        const todayFinal = receivedReports.find((report) => report.date === new Date().toISOString().slice(0, 10) && report.status === "final")
        if (todayFinal?.content) {
          setFinalizedContent(todayFinal.content)
          setFinalizedReportId(todayFinal.id)
        }
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
      // Loading the persisted draft is the intended synchronization point.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const missingDailyFields = [
    !form.tomorrowPlan.trim() && "明日工作",
    !form.insight.trim() && "今日心得",
    !form.reflection.trim() && "复盘反思",
  ].filter(Boolean) as string[]
  const isCurrentVersionFinal = Boolean(finalizedContent && finalizedContent === reportContent)
  const summarizeWorkspace = async () => {
    setSaveMessage(null)
    try {
      const response = await fetch(`/api/reports/workspace-summary?date=${todayDateStr}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "汇总失败")
      const facts = (data.facts || []).map((item: { text: string }) => item.text)
      const plans = (data.plans || []).map((item: { text: string }) => item.text)
      if (!facts.length && !plans.length) { setSaveMessage("今天还没有可汇总的工作台记录"); return }
      setForm((current) => ({ ...current, todayWork: facts.join("\n") || current.todayWork, tomorrowPlan: plans.join("\n") || current.tomorrowPlan }))
      setSaveMessage(`已汇总 ${facts.length} 条事实和 ${plans.length} 条下一步，请补充心得与复盘`)
    } catch (error) {
      setSaveMessage(`汇总失败：${error instanceof Error ? error.message : "未知错误"}`)
    }
  }

  const handleSaveDraft = async () => {
    if (!hasContent) return
    setSaving(true)
    setSaveMessage(null)
    try {
      await saveDraft(todayDateStr, reportContent)
      setSaveMessage("草稿已保存")
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (error: unknown) {
      setSaveMessage(`保存失败: ${error instanceof Error ? error.message : "未知错误"}`)
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
      const finalReport = await finalizeReport(todayDateStr, reportContent)
      setFinalizedContent(reportContent)
      setFinalizedReportId(finalReport.id)
      setSaveMessage(`${todayDateStr} 日报已定稿归档`)
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (error: unknown) {
      setSaveMessage(`定稿失败: ${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setFinalizing(false)
    }
  }

  const handleSendToLark = async () => {
    if (!isCurrentVersionFinal) {
      setSaveMessage("请先定稿当前版本，再同步飞书")
      return
    }
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
        if (!finalizedReportId) throw new Error("未找到已定稿日报，请刷新后重试")
        await markSentToLark(finalizedReportId)
        setSaveMessage("已发送到飞书")
        setConfirmSend(false)
      } else {
        await navigator.clipboard.writeText(reportContent)
        setSaveMessage("已复制日报到剪切板（未配置飞书 Webhook）")
        setConfirmSend(false)
      }
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (error: unknown) {
      setSaveMessage(`发送失败: ${error instanceof Error ? error.message : "未知错误"}`)
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
      setFinalizedContent("")
      setSaveMessage(missingDailyFields.length ? `AI 已整理已有内容；${missingDailyFields.join("、")}仍需你补充` : "AI 已完善日报内容，请审核后保存")
      setTimeout(() => setSaveMessage(null), 4000)
    } catch (error: unknown) {
      setSaveMessage(`AI 生成失败: ${error instanceof Error ? error.message : "未知错误"}`)
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
        {error && <DataError error={error} onRetry={refetch} />}

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
              {missingDailyFields.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>生成前信息检查：还缺少{missingDailyFields.join("、")}。AI只整理已有信息，不会代替你编写真实感受或判断。</span>
                </div>
              )}
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
                <Textarea
                  placeholder="用2-4句话总结今日真实收获"
                  value={form.insight}
                  onChange={(e) => setForm({ ...form, insight: e.target.value })}
                  maxLength={220}
                  rows={3}
                  className="resize-none"
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {form.insight.length}/220
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
              <Button variant="default" onClick={handleFinalize} disabled={finalizing || !quality.pass}>
                {finalizing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />}
                确认定稿
              </Button>
            </>
          ) : (
            <Button variant="default" onClick={() => setConfirmFinalize(true)} disabled={!hasContent || !quality.pass}>
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
                  disabled={sending || !isCurrentVersionFinal}
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
                disabled={!isCurrentVersionFinal}
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
                  {historyReports.map((report) => (
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
        {tab === "weekly" && <WeeklyReportTab />}
      </div>
    </AppLayout>
  )
}
function HistoryItem({ report, onLoad, onDelete }: { report: DailyReport; onLoad: (content: string) => void; onDelete: (id: string) => void }) {
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
