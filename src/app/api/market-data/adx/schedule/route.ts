import { NextResponse } from "next/server"
import { requireUser } from "@/lib/supabase/require-user"
import { getAdxScheduleStatus, updateAdxSchedule } from "@/lib/adx/local-scheduler"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const { user, response } = await requireUser()
  if (response || !user) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await getAdxScheduleStatus(user.id))
}

export async function PUT(request: Request) {
  const { user, response } = await requireUser()
  if (response || !user) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const body = await request.json().catch(() => ({})) as { enabled?: unknown; rulesConfirmed?: unknown }
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled 必须是布尔值。" }, { status: 400 })
    if (body.rulesConfirmed !== undefined && typeof body.rulesConfirmed !== "boolean") return NextResponse.json({ error: "rulesConfirmed 必须是布尔值。" }, { status: 400 })
    const status = await updateAdxSchedule(user.id, body.enabled, body.rulesConfirmed === true)
    return NextResponse.json(status)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新 ADX 定时任务失败。" }, { status: 400 })
  }
}
