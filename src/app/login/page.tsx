"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sparkles, LogIn, Mail, Lock, Loader2, ArrowLeft, Send } from "lucide-react"

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes("invalid login credentials")) return "邮箱或密码不匹配。可以使用下方的“忘记密码”重新设置。"
  if (normalized.includes("email not confirmed")) return "邮箱尚未确认，请先打开注册邮件完成验证。"
  if (normalized.includes("rate limit")) return "操作过于频繁，请稍后再试。"
  return message
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [mode, setMode] = useState<"login" | "forgot">("login")
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "登录失败。")
      router.push("/")
      router.refresh()
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "登录失败。"
      setError(authErrorMessage(message))
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)

    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    })

    if (error) {
      setError(authErrorMessage(error.message))
    } else {
      setMessage("注册成功，请检查邮箱中的确认链接。")
    }
    setLoading(false)
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError("请先输入注册邮箱。")
      return
    }

    setLoading(true)
    setError(null)
    setMessage(null)
    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo })

    if (error) {
      setError(authErrorMessage(error.message))
    } else {
      setMessage("重置邮件已发送。请打开邮件中的链接设置新密码。")
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0e2f24] p-3 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#112f25] lg:grid-cols-[1.15fr_.85fr]">
        <div className="relative hidden overflow-hidden p-12 text-[#f7f4e9] lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-20 h-96 w-96 rounded-full bg-[#c9f45a]/15 blur-3xl" />
          <div className="relative flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#c9f45a] text-[#102a21]"><Sparkles className="h-5 w-5" /></span><div><p className="font-semibold tracking-wide">STORY DESK</p><p className="text-[10px] tracking-[.22em] text-white/45">AI SHORT DRAMA STUDIO</p></div></div>
          <div className="relative max-w-xl"><p className="font-editorial mb-5 text-xl text-[#c9f45a]">Your stories, in one place.</p><h1 className="display-title">把灵感、剧本与判断，沉淀为你的内容资产。</h1><p className="mt-8 max-w-md text-sm leading-7 text-white/55">从剧本上传、AI责编审核到项目开发，用一个安静、有秩序的空间承载每天的创作工作。</p></div>
          <div className="relative flex gap-2">{["CONTENT", "RESEARCH", "IDEAS", "TASKS"].map((item) => <span key={item} className="rounded-full border border-white/15 px-4 py-2 text-[10px] tracking-widest text-white/55">{item}</span>)}</div>
        </div>
        <div className="flex items-center justify-center bg-[#f4f1e7] p-5 sm:p-10">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground mb-4">
            <Sparkles className="w-8 h-8" />
          </div>
          <p className="font-editorial text-lg text-primary">Welcome back</p>
          <h1 className="text-4xl font-medium tracking-[-.06em]">登录你的工作台</h1>
          <p className="text-muted-foreground">继续今天的内容工作</p>
        </div>

        {/* Login Card */}
        <Card className="border-primary/10 bg-white/65 shadow-[0_24px_70px_rgba(18,59,45,.12)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {mode === "login" ? <LogIn className="w-5 h-5" /> : <Send className="w-5 h-5" />}
              {mode === "login" ? "登录" : "找回密码"}
            </CardTitle>
            <CardDescription>{mode === "login" ? "使用邮箱和密码登录你的工作台" : "我们会向你的注册邮箱发送重置链接"}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={mode === "login" ? handleLogin : handleResetPassword} className="space-y-4">
              {mode === "login" && <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  邮箱
                </label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  密码
                </label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="text-sm p-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                  {error}
                </div>
              )}

              {message && (
                <div className="rounded-xl border border-primary/15 bg-primary/8 p-3 text-sm leading-6 text-primary">
                  {message}
                </div>
              )}

              {mode === "login" ? <>
              <button type="button" className="text-sm text-primary underline-offset-4 hover:underline" onClick={() => { setMode("forgot"); setError(null); setMessage(null) }}>
                忘记密码？
              </button>
              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "登录"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSignUp}
                  disabled={loading}
                >
                  注册
                </Button>
              </div>
              </> : <div className="space-y-3">
                <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  发送重置邮件
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => { setMode("login"); setError(null); setMessage(null) }}>
                  <ArrowLeft className="h-4 w-4" />返回登录
                </Button>
              </div>}
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          纯个人工具 · 数据存储于 Supabase ·
          <Badge variant="secondary" className="ml-1 text-[10px]">v0.1</Badge>
        </p>
      </div></div>
      </div>
    </div>
  )
}
