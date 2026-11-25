import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BookOpen, ClipboardList, MessageSquareText } from "lucide-react"

const sections = [
  { title: "今日学习", icon: BookOpen, description: "学习目标和参考资料将在这里显示。" },
  { title: "我的任务", icon: ClipboardList, description: "每天的检索、分析和交付要求将在这里显示。" },
  { title: "作业与反馈", icon: MessageSquareText, description: "提交记录、评分和修改建议将在这里显示。" },
]

export default function LearningPage() {
  return (
    <AppLayout>
      <div className="max-w-5xl space-y-6">
        <PageHero
          eyebrow="Yunxia Learning"
          title="我的学习空间"
          description="在这里完成短剧研究训练，并查看每天的学习任务。"
        />
        <div className="grid gap-4 md:grid-cols-3">
          {sections.map(({ title, icon: Icon, description }) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-5 w-5 text-primary" />{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            学习任务尚未发布。发布后会出现在这个页面。
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
