import { NextResponse } from "next/server"
import { requireUser } from "@/lib/supabase/require-user"
import { getAdxStatus } from "@/lib/adx/local-connector"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET() {
  const { user, response } = await requireUser(); if (response) return response
  const access = await requireWorkspaceAccess(user.id, "market_data", "view"); if (!access) return NextResponse.json({ error: "没有市场数据查看权限" }, { status: 403 })
  return NextResponse.json(await getAdxStatus())
}
