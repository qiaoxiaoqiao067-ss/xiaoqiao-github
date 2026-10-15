"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  CheckSquare,
  BookOpen,
  Lightbulb,
  FileSearch,
  LibraryBig,
  Clapperboard,
  MessagesSquare,
  BarChart3,
  Languages,
  ChevronLeft,
  Sparkles,
  ClipboardList,
  FolderOpen,
  Brain,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

const NAV_ITEMS = [
  {
    title: "首页",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "项目推进",
    href: "/projects",
    icon: Clapperboard,
  },
  {
    title: "本地化交付",
    href: "/localization",
    icon: Languages,
  },
  {
    title: "收稿审稿",
    href: "/content",
    icon: BookOpen,
  },
  {
    title: "市场数据看板",
    href: "/market-data",
    icon: BarChart3,
  },
  {
    title: "选题情报",
    href: "/discover",
    icon: Lightbulb,
  },
  {
    title: "调研中心",
    href: "/research",
    icon: FileSearch,
  },
  {
    title: "会议与决策",
    href: "/meetings",
    icon: MessagesSquare,
  },
  {
    title: "内容知识库",
    href: "/knowledge",
    icon: LibraryBig,
  },
  {
    title: "任务中心",
    href: "/todos",
    icon: CheckSquare,
  },
  {
    title: "日报周报",
    href: "/reports",
    icon: ClipboardList,
  },
  {
    title: "文档中心",
    href: "/docs",
    icon: FolderOpen,
  },
  {
    title: "AI 学习",
    href: "/ai-learning",
    icon: Brain,
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col bg-sidebar transition-all duration-300 md:left-3 md:top-3 md:h-[calc(100vh-1.5rem)] md:rounded-[2rem]",
        mobileOpen ? "flex w-[240px] translate-x-0" : "hidden -translate-x-full md:flex md:translate-x-0",
        collapsed ? "md:w-[72px]" : "md:w-[240px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex h-20 items-center px-5",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {(!collapsed || mobileOpen) && (
          <Link href="/" className="flex items-center gap-3 font-semibold text-sidebar-foreground">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground"><Sparkles className="h-5 w-5" /></span>
            <span><span className="block text-sm tracking-[.16em]">云霞内容台</span><span className="block text-[10px] font-normal tracking-[.12em] text-sidebar-foreground/55">AI SHORT DRAMA</span></span>
          </Link>
        )}
        {collapsed && !mobileOpen && (
          <Sparkles className="w-5 h-5 text-sidebar-primary" />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn(
            "hidden h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent md:inline-flex",
            collapsed && "absolute -right-3 top-4 bg-sidebar border border-sidebar-border rounded-full shadow-sm"
          )}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_10px_28px_rgba(201,244,90,.16)]"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              title={collapsed ? item.title : undefined}
              onClick={onMobileClose}
            >
              <Icon className={cn("w-5 h-5 shrink-0", isActive && "drop-shadow-sm")} />
              {(!collapsed || mobileOpen) && <span>{item.title}</span>}
              {collapsed && !mobileOpen && isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-sidebar-primary rounded-r-full" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      {(!collapsed || mobileOpen) && (
        <div className="p-4">
          <Separator className="mb-4 bg-sidebar-border/60" />
          <div className="rounded-[1.25rem] border border-sidebar-border bg-sidebar-accent/50 p-3 text-xs leading-5 text-sidebar-foreground/60">
            <span className="font-editorial block text-[13px] text-sidebar-foreground">让一些好事的人</span>
            <span className="mt-1 flex items-center justify-between">把云霞摘下来吧。 <Badge variant="secondary" className="bg-sidebar-primary text-[9px] text-sidebar-primary-foreground">v0.3</Badge></span>
          </div>
        </div>
      )}
    </aside>
  )
}
