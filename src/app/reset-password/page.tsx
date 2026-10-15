"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { KeyRound, Loader2, Sparkles } from "lucide-react"

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    let active = true

    const prepareRecoverySession = async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = hash.get("access_token")
      const refreshToken = hash.get("refresh_token")

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (!active) return
        if (sessionError) {
          setError("重置链接已失效，请重新生成恢复链接。")
          return
        }
        window.history.replaceState({}, "", window.location.pathname)
        setSessionReady(true)
        setError(null)
        return
      }

      const { data } = await supabase.auth.getSession()
      if (!active) return
      if (data.session) {
        setSessionReady(true)
        setError(null)
      } else {
        setError("重置链接已失效，请重新生成恢复链接。")
      }
    }

    void prepareRecoverySession()
    return () => { active = false }
  }, [supabase])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!sessionReady) {
      setError("恢复会话尚未准备好，请稍等后重试。")
      return
    }
    if (password.length < 8) {
      setError("新密码至少需要 8 位。")
      return
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。")
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message === "Auth session missing!" ? "重置链接已失效，请返回登录页重新发送邮件。" : error.message)
      setLoading(false)
      return
    }

    setDone(true)
    setLoading(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0e2f24] p-4">
      <div className="w-full max-w-md rounded-[2rem] bg-[#f4f1e7] p-5 shadow-2xl sm:p-8">
        <div className="mb-7 text-center">
          <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground"><Sparkles className="h-6 w-6" /></span>
          <p className="font-editorial text-primary">A fresh start.</p>
          <h1 className="mt-1 text-4xl font-medium tracking-[-.06em]">设置新密码</h1>
        </div>
        <Card className="border-primary/10 bg-white/65">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />更新密码</CardTitle>
            <CardDescription>请输入一个至少 8 位的新密码</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input type="password" placeholder="新密码" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading || done || !sessionReady} autoComplete="new-password" />
              <Input type="password" placeholder="再次输入新密码" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={loading || done || !sessionReady} autoComplete="new-password" />
              {error && <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              {done && <div className="rounded-xl border border-primary/15 bg-primary/8 p-3 text-sm text-primary">密码已更新成功。请返回登录页，使用正确邮箱和新密码登录。</div>}
              <Button type="submit" className="w-full" disabled={loading || done || !sessionReady}>
                {loading || !sessionReady ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {sessionReady ? "保存新密码" : "正在验证重置链接…"}
              </Button>
              {done && <Button type="button" variant="outline" className="w-full" onClick={() => router.push("/login")}>返回登录</Button>}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
