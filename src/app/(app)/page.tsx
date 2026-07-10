"use client"

import { useEffect, useState } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { useTodos } from "@/hooks/use-todos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { formatDate, isWorkday, getGreeting } from "@/lib/utils"
import {
  CheckSquare,
  FileText,
  BookOpen,
  Brain,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Plus,
  Sparkles,
  Calendar,
  Zap,
  ListTodo,
} from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const { todos, loading: todosLoading, toggleTodo } = useTodos()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!todosLoading) setLoading(false)
  }, [todosLoading])

  const todosCompleted = todos.filter((t) => t.completed).length
  const todoProgress = todos.length > 0 ? Math.round((todosCompleted / todos.length) * 100) : 0

  const today = new Date()
  const todayStr = formatDate(today)
  const isTodayWorkday = isWorkday(today)

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {todayStr} · {isTodayWorkday ? "工作日" : "休息日"} · {getGreeting()}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/todos">
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                新建任务
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="全部任务"
            value={loading ? null : `${todosCompleted}/${todos.length}`}
            description="已完成 / 总计"
            icon={CheckSquare}
            iconColor="text-emerald-500"
            iconBg="bg-emerald-500/10"
            loading={loading}
            footer={<Progress value={todoProgress} className="h-1.5 mt-2" />}
          />
          <StatsCard
            title="本周日报"
            value="0"
            description="日报模块开发中"
            icon={FileText}
            iconColor="text-blue-500"
            iconBg="bg-blue-500/10"
            loading={false}
          />
          <StatsCard
            title="知识文档"
            value="0"
            description="文档模块开发中"
            icon={BookOpen}
            iconColor="text-violet-500"
            iconBg="bg-violet-500/10"
            loading={false}
          />
          <StatsCard
            title="AI 学习"
            value="即将上线"
            description="AI 学习模块"
            icon={Brain}
            iconColor="text-amber-500"
            iconBg="bg-amber-500/10"
            loading={false}
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Tasks */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <ListTodo className="h-4 w-4 text-emerald-500" />
                  所有任务
                </CardTitle>
                <CardDescription>
                  {todos.filter((t) => !t.completed).length} 项待完成
                </CardDescription>
              </div>
              <Link href="/todos">
                <Button variant="ghost" size="sm">
                  查看全部
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : todos.length === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title="还没有任务"
                  description="点击「新建任务」开始规划你今天的工作"
                />
              ) : (
                <div className="space-y-1 max-h-[360px] overflow-y-auto">
                  {todos.slice(0, 8).map((todo) => (
                    <div
                      key={todo.id}
                      className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={todo.completed}
                        onCheckedChange={() => toggleTodo(todo.id)}
                        className="shrink-0"
                      />
                      <span
                        className={`text-sm flex-1 truncate ${
                          todo.completed ? "line-through text-muted-foreground" : ""
                        }`}
                      >
                        {todo.title}
                      </span>
                      {todo.priority > 0 && (
                        <Badge
                          variant={todo.priority === 2 ? "destructive" : "warning"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {todo.priority === 2 ? "紧急" : "重要"}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Sidebar */}
          <div className="space-y-4">
            {/* Risk Alert — basic version */}
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  风险预警
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!loading && todos.filter((t) => !t.completed && t.priority === 2).length > 0 ? (
                  <p className="text-sm text-amber-700">
                    {todos.filter((t) => !t.completed && t.priority === 2).length} 项紧急任务未完成
                  </p>
                ) : (
                  <EmptyState
                    icon={TrendingUp}
                    title="暂无风险"
                    description="所有任务都在正轨上"
                    size="sm"
                  />
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">快捷操作</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/todos" className="block">
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <ListTodo className="mr-2 h-4 w-4" />
                    管理任务
                  </Button>
                </Link>
                <Link href="/reports" className="block">
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <FileText className="mr-2 h-4 w-4" />
                    生成日报
                  </Button>
                </Link>
                <Link href="/docs" className="block">
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <BookOpen className="mr-2 h-4 w-4" />
                    上传文档
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor,
  iconBg,
  loading,
  footer,
}: {
  title: string
  value: string | null
  description: string
  icon: React.ElementType
  iconColor: string
  iconBg: string
  loading: boolean
  footer?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16 mb-1" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
        {footer}
      </CardContent>
    </Card>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  size = "md",
}: {
  icon: React.ElementType
  title: string
  description: string
  size?: "sm" | "md"
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="p-3 rounded-full bg-muted mb-3">
        <Icon className={size === "sm" ? "h-5 w-5" : "h-6 w-6"} />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  )
}
