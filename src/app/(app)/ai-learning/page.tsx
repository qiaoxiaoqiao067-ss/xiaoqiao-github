"use client"

import { useState } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
import { useAILearning, type AILearning } from "@/hooks/use-ai-learning"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import {
  Brain, Sparkles, Loader2, BookOpen, CheckCircle, Lightbulb,
  ChevronRight, Zap, Filter, Calendar, Target, PenLine, Notebook, ExternalLink
} from "lucide-react"

const CATEGORIES = ["全部", "市场动态", "提示词工程", "Skill开发", "Agent设计", "AI工具", "模型原理"]
const CATEGORY_EMOJI: Record<string, string> = {
  "全部": "📚", "市场动态": "📰", "提示词工程": "💬", "Skill开发": "🛠️", "Agent设计": "🤖", "AI工具": "🔧", "模型原理": "🧠",
}
const DIFFICULTY_CONFIG: Record<number, { label: string; emoji: string; className: string }> = {
  1: { label: "入门", emoji: "🌱", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400" },
  2: { label: "进阶", emoji: "🔥", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400" },
  3: { label: "实战", emoji: "⚡", className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400" },
}

function SectionBlock({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <span className="text-base">{emoji}</span>
        <span>{title}</span>
      </h4>
      <div className="text-sm leading-relaxed text-muted-foreground pl-6 border-l-2 border-muted">
        {children}
      </div>
    </div>
  )
}

export default function AILearningPage() {
  const { learnings, todayLearning, loading, generating, error, generateToday, updateLearning, fetchLearnings } = useAILearning()
  const [filterCategory, setFilterCategory] = useState("全部")
  const [selectedLearning, setSelectedLearning] = useState<AILearning | null>(null)
  const [noteText, setNoteText] = useState("")

  const filtered = filterCategory === "全部" ? learnings : learnings.filter(l => l.category === filterCategory)
  const diff = todayLearning ? DIFFICULTY_CONFIG[todayLearning.difficulty] : null

  const handleSelect = (l: AILearning) => {
    setSelectedLearning(l)
    setNoteText(l.notes || "")
  }

  const handleSaveNote = async () => {
    if (!selectedLearning) return
    await updateLearning(selectedLearning.id, { notes: noteText })
  }

  const streak = calculateStreak(learnings)
  const learnedCount = learnings.filter(l => l.learned).length

  // Split content into sections for rendering
  const parseContentSections = (content: string) => {
    const sections: { emoji: string; title: string; body: string }[] = []
    const lines = content.split("\n")
    let current: { emoji: string; title: string; body: string } | null = null

    for (const line of lines) {
      const match = line.match(/^([📌📖💡🚀🛠️💬🤖📰🔧🧠🌱🔥⚡📋✅⚠️💪🎯])?\s*(.*)/)
      if (match && line.trim().length < 40 && /^[📌📖💡🚀🛠️💬🤖📰🔧🧠]/.test(line.trim())) {
        if (current) sections.push(current)
        current = { emoji: line.slice(0, 2).trim() || "📖", title: line.slice(2).trim(), body: "" }
      } else if (current) {
        current.body += (current.body ? "\n" : "") + line
      }
    }
    if (current) sections.push(current)
    return sections.length > 0 ? sections : [{ emoji: "📖", title: "", body: content }]
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHero eyebrow="AI短剧 · 每日学习" title="爆款与方法学习" description="每天拆解一个案例，持续积累责编、编剧与AI制作判断" action={
          <div className="flex items-center gap-3">
            {todayLearning ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle className="h-3 w-3" /> 今日已学习
              </Badge>
            ) : (
              <Button onClick={generateToday} disabled={generating} size="sm" className="gap-1.5 bg-[#c9f45a] text-[#102a21] hover:bg-[#d8ff76]">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                生成今日要点
              </Button>
            )}
          </div>
        } />

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Zap className="h-4 w-4 text-amber-500" />, value: `${streak} 天`, label: "连续学习", emoji: "🔥" },
            { icon: <BookOpen className="h-4 w-4 text-violet-500" />, value: `${learnedCount}/${learnings.length}`, label: "已学习", emoji: "📚" },
            { icon: <Target className="h-4 w-4 text-emerald-500" />, value: `${learnings.length}`, label: "知识库", emoji: "📊" },
          ].map((s, i) => (
            <Card key={i} className="border-muted">
              <CardContent className="py-3 flex items-center gap-3">
                <span className="text-lg">{s.emoji}</span>
                <div>
                  <p className="text-lg font-bold">{s.value}</p>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main: Today's Learning */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Content area */}
          <div className="lg:col-span-3 space-y-4">
            {todayLearning ? (
              <Card className="border-amber-200/60 bg-gradient-to-b from-amber-50/50 to-white dark:from-amber-950/20 dark:to-background">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    {diff && (
                      <Badge variant="outline" className={`text-[11px] gap-1 ${diff.className}`}>
                        {diff.emoji} {diff.label}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[11px] gap-1">
                      {CATEGORY_EMOJI[todayLearning.category] || "📚"} {todayLearning.category}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 ml-auto">
                      <Calendar className="h-3 w-3" /> {todayLearning.date}
                    </span>
                  </div>
                  <CardTitle className="text-xl leading-snug">{todayLearning.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Rendered sections */}
                  {parseContentSections(todayLearning.content).map((sec, i) => (
                    <SectionBlock key={i} emoji={sec.emoji} title={sec.title}>
                      <p className="whitespace-pre-wrap">{sec.body}</p>
                    </SectionBlock>
                  ))}

                  {/* Actions */}
                  <div className="flex items-center gap-4 pt-3 border-t">
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                      <Checkbox
                        checked={todayLearning.learned}
                        onCheckedChange={(v) => updateLearning(todayLearning.id, { learned: !!v })}
                      />
                      <span>{todayLearning.learned ? "✅ 已标记为学习完成" : "☐ 标记为已学习"}</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      来源：{todayLearning.source}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ) : loading ? (
              <Card><CardContent className="py-12 space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-20 w-full mt-4" />
              </CardContent></Card>
            ) : (
              <Card className="border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <span className="text-5xl mb-4">💡</span>
                  <p className="text-lg font-medium">今日学习内容</p>
                  <p className="text-sm text-muted-foreground mt-1.5 mb-5 max-w-xs">
                    点击「生成今日要点」获取今天的 AI 知识点，内容基于真实训练数据
                  </p>
                  <Button onClick={generateToday} disabled={generating} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    开始今天的学习
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Notes */}
            {selectedLearning && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Notebook className="h-4 w-4" /> 学习笔记
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    placeholder="记录你的思考和收获..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                  <Button size="sm" onClick={handleSaveNote}>
                    <PenLine className="h-3.5 w-3.5 mr-1" /> 保存笔记
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar: Knowledge list */}
          <div className="lg:col-span-2 space-y-4">
            {/* Category filter */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    filterCategory === cat
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background hover:bg-muted border-muted-foreground/20"
                  }`}
                >
                  {CATEGORY_EMOJI[cat]} {cat}
                </button>
              ))}
            </div>

            {/* List */}
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    还没有学习记录
                  </div>
                ) : (
                  <div className="max-h-[460px] overflow-y-auto divide-y">
                    {filtered.map(l => {
                      const diff = DIFFICULTY_CONFIG[l.difficulty]
                      return (
                        <button
                          key={l.id}
                          onClick={() => handleSelect(l)}
                          className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                            selectedLearning?.id === l.id ? "bg-muted/70 border-l-2 border-primary" : "border-l-2 border-transparent"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="text-xs shrink-0 mt-0.5">{diff?.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium leading-snug line-clamp-2">{l.title}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[10px] text-muted-foreground">{CATEGORY_EMOJI[l.category]} {l.category}</span>
                                <span className="text-[10px] text-muted-foreground">· {l.date}</span>
                                {l.learned && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function calculateStreak(learnings: AILearning[]): number {
  const dates = [...new Set(learnings.map(l => l.date))].sort().reverse()
  if (dates.length === 0) return 0
  const today = new Date().toISOString().slice(0, 10)
  if (dates[0] !== today) return 0
  let streak = 1, check = new Date(today)
  for (let i = 1; i < dates.length; i++) {
    const d = new Date(dates[i])
    const diff = Math.round((check.getTime() - d.getTime()) / 86400000)
    if (diff === 1) { streak++; check = d }
    else break
  }
  return streak
}
