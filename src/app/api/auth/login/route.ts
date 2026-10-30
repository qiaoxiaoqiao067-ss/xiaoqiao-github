import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabase } from "@/lib/supabase/server"
import { serviceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"
export const revalidate = 0

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
})

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入有效的邮箱和密码。" }, { status: 400, headers: { "Cache-Control": "no-store" } })
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
        return NextResponse.json({ error: message }, { status: 401, headers: { "Cache-Control": "no-store" } })
      }

      if (data.user) {
        // 权限校验必须和认证分开处理：权限表短暂不可用时，不能把合法账号
        // 误判为“未授权”。同时用 limit(1) 避免历史重复成员记录触发 maybeSingle 的
        // PGRST116 错误，导致用户无法登录。
        const { data: ownerWorkspace, error: ownerError } = await serviceClient
          .from("workspaces")
          .select("id")
          .eq("owner_id", data.user.id)
          .limit(1)
          .maybeSingle()
        if (ownerError) {
          return NextResponse.json({ error: "权限服务暂时不可用，请稍后重试。" }, { status: 503, headers: { "Cache-Control": "no-store" } })
        }
        if (!ownerWorkspace) {
          const { data: membership, error: membershipError } = await serviceClient
            .from("workspace_members")
            .select("status,role")
            .eq("user_id", data.user.id)
            .eq("status", "active")
            .limit(1)
            .maybeSingle()
          if (membershipError) {
            return NextResponse.json({ error: "权限服务暂时不可用，请稍后重试。" }, { status: 503, headers: { "Cache-Control": "no-store" } })
          }
          if (!membership) {
            await supabase.auth.signOut()
            return NextResponse.json({ error: "账号已注册，但还没有获得工作台权限。请等待管理员授权后再登录。" }, { status: 403, headers: { "Cache-Control": "no-store" } })
          }
        }
        return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
      }
    } catch {
      if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
    }
  }

  return NextResponse.json({ error: "认证服务连接不稳定，请再试一次。" }, { status: 503, headers: { "Cache-Control": "no-store" } })
}
