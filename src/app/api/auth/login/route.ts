import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabase } from "@/lib/supabase/server"
import { serviceClient } from "@/lib/supabase/service"

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
})

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入有效的邮箱和密码。" }, { status: 400 })
  }

  const supabase = await createServerSupabase()

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email.toLowerCase(),
        password: parsed.data.password,
      })

      if (error) {
        const isConnectionError = error.status === 0 || error.message.toLowerCase().includes("fetch failed")
        if (isConnectionError && attempt < 7) {
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
          continue
        }
        const message = error.message.toLowerCase().includes("invalid login credentials")
          ? "邮箱或密码不匹配。"
          : isConnectionError ? "认证服务连接不稳定，请再试一次。" : error.message
        return NextResponse.json({ error: message }, { status: 401 })
      }

      if (data.user) {
        const { data: ownerWorkspace } = await serviceClient.from("workspaces").select("id").eq("owner_id", data.user.id).maybeSingle()
        if (!ownerWorkspace) {
          const { data: membership } = await serviceClient.from("workspace_members").select("status,role").eq("user_id", data.user.id).maybeSingle()
          if (!membership || (membership.status !== "active" && membership.role !== "owner")) {
            await supabase.auth.signOut()
            return NextResponse.json({ error: "账号已注册，但还没有获得工作台权限。请等待管理员授权后再登录。" }, { status: 403 })
          }
        }
        return NextResponse.json({ ok: true })
      }
    } catch {
      if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
    }
  }

  return NextResponse.json({ error: "认证服务连接不稳定，请再试一次。" }, { status: 503 })
}
