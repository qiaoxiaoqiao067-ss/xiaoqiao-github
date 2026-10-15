"use client"
import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
export default function SettingsPage() {
  return <AppLayout><div className="space-y-6"><PageHero eyebrow="Your desk, your rules." title="Settings 设置" description="个性化工作台设置即将上线" /></div></AppLayout>
}
