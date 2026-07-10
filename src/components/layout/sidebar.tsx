"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  BookOpen,
  Brain,
  Settings,
  ChevronLeft,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

const NAV_ITEMS = [
  {
    title: "仪表盘",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "任务中心",
    href: "/todos",
    icon: CheckSquare,
  },
  {
    title: "日报周报",
    href: "/reports",
    icon: FileText,
  },
  {
    title: "文档中心",
    href: "/docs",
    icon: BookOpen,
  },
  {
    title: "AI 学习",
    href: "/ai-learning",
    icon: Brain,
  },
  {
    title: "设置",
    href: "/settings",
    icon: Settings,
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 flex flex-col",
        collapsed ? "w-[70px]" : "w-[240px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex items-center h-16 px-4 border-b border-sidebar-border",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2 font-semibold text-sidebar-foreground">
            <Sparkles className="w-5 h-5 text-sidebar-primary" />
            <span className="text-sm">工作台</span>
          </Link>
        )}
        {collapsed && (
          <Sparkles className="w-5 h-5 text-sidebar-primary" />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn(
            "h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent",
            collapsed && "absolute -right-3 top-4 bg-sidebar border border-sidebar-border rounded-full shadow-sm"
          )}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              title={collapsed ? item.title : undefined}
            >
              <Icon className={cn("w-5 h-5 shrink-0", isActive && "drop-shadow-sm")} />
              {!collapsed && <span>{item.title}</span>}
              {collapsed && isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-sidebar-primary rounded-r-full" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-4">
          <Separator className="mb-4 bg-sidebar-border" />
          <div className="flex items-center justify-between text-xs text-sidebar-foreground/60">
            <span>Personal Workbench</span>
            <Badge variant="secondary" className="text-[10px] bg-sidebar-accent">v0.1</Badge>
          </div>
        </div>
      )}
    </aside>
  )
}
