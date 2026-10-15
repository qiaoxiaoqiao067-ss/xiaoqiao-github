import { NextResponse } from "next/server"
import { requireUser } from "@/lib/supabase/require-user"
import { openAdxLogin } from "@/lib/adx/local-connector"
export const runtime = "nodejs"
export async function POST() {
  try { const { response } = await requireUser(); if (response) return response; return NextResponse.json({ ok: true, ...(await openAdxLogin()) }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ADX连接失败" }, { status: 500 }) }
}
