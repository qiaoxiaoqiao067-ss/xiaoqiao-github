import { Suspense } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { StatisticsWorkspace } from "@/components/statistics/statistics-workspace"

export default function LocalizationPage() {
  return <AppLayout><Suspense fallback={<div className="h-56 animate-pulse rounded-2xl bg-muted" aria-label="正在打开字数统计" />}><StatisticsWorkspace /></Suspense></AppLayout>
}
