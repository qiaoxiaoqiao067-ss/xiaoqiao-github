import { NextResponse } from "next/server"
import { requireUser } from "@/lib/supabase/require-user"
import { syncAdxExport } from "@/lib/adx/local-connector"
export const runtime = "nodejs"
export async function POST(request: Request) {
  try { const { response } = await requireUser(); if (response) return response; const body = (await request.json().catch(() => ({}))) as { rankType?: string }; return NextResponse.json(await syncAdxExport(body.rankType === "month" ? "month" : "week")) }
  catch (error) {
    const raw = error instanceof Error ? error.message : "ADX同步失败"
    const message = raw.includes("Timeout") || raw.includes("locator.") ? "ADX页面控件响应超时，请确认榜单加载完成后重试。" : raw
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
