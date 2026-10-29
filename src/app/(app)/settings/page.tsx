"use client"

import { useEffect, useState } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Mail, UserMinus, Users } from "lucide-react"

const MODULES = [["content", "责编审稿"], ["projects", "项目推进"], ["market_data", "市场数据看板"], ["discover", "选题情报"]] as const
type TeamState = { configured: boolean; workspace?: { name: string }; role?: string; members?: Array<{ user_id: string; role: string; status: string; invited_email?: string; profile?: { email?: string; name?: string } | null; permissions?: Array<{ module_key: string; can_edit: boolean }> }>; error?: string }

export default function SettingsPage() {
  const [team, setTeam] = useState<TeamState | null>(null)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"collaborator" | "viewer">("viewer")
  const [modules, setModules] = useState<string[]>(MODULES.map(([key]) => key))
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const load = async () => { setLoading(true); const response = await fetch("/api/team", { cache: "no-store" }); const data = await response.json(); setTeam(data); setLoading(false) }
  useEffect(() => { void load() }, [])
  const toggle = (key: string) => setModules((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  const invite = async () => { if (!email.trim() || !modules.length) return; setSending(true); setMessage(""); const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role: "viewer", modules }) }); const data = await response.json(); setMessage(response.ok ? `已授权：${data.email}` : (data.error || "授权失败")); if (response.ok) { setEmail(""); await load() } setSending(false) }
  const removeMember = async (member: NonNullable<TeamState["members"]>[number]) => {
    const name = member.profile?.name || member.profile?.email || member.invited_email || member.user_id
    if (!window.confirm(`确认移除成员“${name}”？移除后将立即失去工作台登录和模块权限。`)) return
    setRemoving(member.user_id); setMessage("")
    try {
      const response = await fetch("/api/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: member.user_id }) })
      const data = await response.json().catch(() => ({}))
      setMessage(response.ok ? `已移除成员：${name}` : (data.error || "移除成员失败"))
      if (response.ok) await load()
    } finally { setRemoving(null) }
  }
  const toggleMember = async (member: NonNullable<TeamState["members"]>[number]) => {
    const name = member.profile?.name || member.profile?.email || member.invited_email || member.user_id
    const nextStatus = member.status === "active" ? "suspended" : "active"
    const action = nextStatus === "suspended" ? "暂时关闭" : "恢复访问"
    if (!window.confirm(`确认${action}成员“${name}”？`)) return
    setRemoving(member.user_id); setMessage("")
    try {
      const response = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: member.user_id, status: nextStatus }) })
      const data = await response.json().catch(() => ({}))
      setMessage(response.ok ? `${action}成功：${name}` : (data.error || `${action}失败`))
      if (response.ok) await load()
    } finally { setRemoving(null) }
  }
  return <AppLayout><div className="space-y-5"><PageHero eyebrow="Team access" title="团队与权限" description="邀请成员，只开放责编审稿、项目推进、市场数据看板和选题情报。" />
    {loading ? <Card><CardContent className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4" />正在读取团队权限…</CardContent></Card> : team?.role !== "owner" ? <Card><CardContent className="py-16 text-center"><p className="font-semibold">此页面仅管理员可见</p><p className="mt-2 text-sm text-muted-foreground">你的账号只有被授权的只读模块。</p></CardContent></Card> : team?.configured !== true ? <Card className="border-amber-300/50 bg-amber-50/50"><CardContent className="space-y-2 p-5"><p className="font-semibold">团队权限尚未初始化</p><p className="text-sm text-muted-foreground">{team?.error || "请在 Supabase SQL Editor 运行项目中的 supabase/team_access_mvp.sql，再回来刷新此页面。"}</p></CardContent></Card> : <>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" />授权团队成员</CardTitle><CardDescription>成员先在登录页注册；你输入同一个邮箱并点击授权后，他才能登录，只读查看所选模块。未注册邮箱不会发送邮件邀请。</CardDescription></CardHeader><CardContent className="space-y-4"><Input type="email" placeholder="已注册成员邮箱" value={email} onChange={(event) => setEmail(event.target.value)} /><div className="flex flex-wrap gap-2">{MODULES.map(([key, label]) => <button type="button" key={key} onClick={() => toggle(key)} className={`rounded-full border px-3 py-1.5 text-xs ${modules.includes(key) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>{label}</button>)}</div><div className="flex flex-wrap items-center gap-3"><span className="rounded-full border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">权限：只读</span><Button disabled={sending || !email.trim() || !modules.length} onClick={() => void invite()}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}授权访问</Button></div>{message && <p className="text-sm text-primary">{message}</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />团队成员</CardTitle></CardHeader><CardContent>{team?.members?.length ? <div className="space-y-2">{team.members.map((member) => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"><div><p className="text-sm font-medium">{member.profile?.name || member.profile?.email || member.invited_email || member.user_id}</p><p className="text-xs text-muted-foreground">{member.status === "invited" ? "待接受邀请" : member.status === "suspended" ? "已暂时关闭" : "已加入"}</p></div><div className="flex items-center gap-1"><Badge variant="secondary">{member.role === "owner" ? "所有者" : member.role === "viewer" ? "只读" : "协作者"}</Badge>{member.status === "suspended" && <Badge variant="outline" className="border-amber-400 text-amber-700">已关闭</Badge>}{member.permissions?.map((permission) => <Badge key={permission.module_key} variant="outline">{MODULES.find(([key]) => key === permission.module_key)?.[1]}</Badge>)}{member.role !== "owner" && <><Button variant="ghost" size="sm" className="ml-2" disabled={removing === member.user_id} onClick={() => void toggleMember(member)}>{removing === member.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : member.status === "suspended" ? "恢复访问" : "暂时关闭"}</Button><Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={removing === member.user_id} onClick={() => void removeMember(member)}><UserMinus className="mr-1 h-4 w-4" />移除</Button></>}</div></div>)}</div> : <p className="text-sm text-muted-foreground">还没有团队成员。</p>}</CardContent></Card>
    </>}</div></AppLayout>
}
