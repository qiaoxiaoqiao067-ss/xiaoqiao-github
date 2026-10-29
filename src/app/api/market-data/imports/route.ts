import { NextResponse } from "next/server"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { getWorkspaceDataOwnerId } from "@/lib/supabase/workspace-access"

export const dynamic = "force-dynamic"

export async function GET() {
  const { user, response } = await requireUser()
  if (response) return response
  const ownerId = await getWorkspaceDataOwnerId(user.id)
  if (!ownerId) return NextResponse.json({ error: "账号尚未获得工作台授权" }, { status: 403 })
  const { data, error } = await serviceClient.from("market_data_imports").select("*").eq("user_id", ownerId).order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imports: data || [] }, { headers: { "Cache-Control": "no-store" } })
}
