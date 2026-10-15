import { NextResponse } from "next/server"
import { requireUser } from "@/lib/supabase/require-user"
import { getAdxStatus } from "@/lib/adx/local-connector"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET() {
  const { response } = await requireUser(); if (response) return response
  return NextResponse.json(await getAdxStatus())
}
