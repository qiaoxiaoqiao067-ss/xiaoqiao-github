import { NextResponse } from "next/server"
import { requireUser } from "@/lib/supabase/require-user"
import { openAdxLogin } from "@/lib/adx/local-connector"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"
export const runtime = "nodejs"
export async function POST() {
  try { const { user, response } = await requireUser(); if (response) return response; const access=await requireWorkspaceAccess(user.id,"market_data","edit");if(!access)return NextResponse.json({error:"没有市场数据编辑权限"},{status:403});return NextResponse.json({ ok: true, ...(await openAdxLogin()) }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ADX连接失败" }, { status: 500 }) }
}
