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
  const { data, error } = await serviceClient.from("project_timeline_items").select("*").eq("user_id", ownerId).order("start_date", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] }, { headers: { "Cache-Control": "no-store" } })
}

/** Reset the owner's schedule before importing a new authoritative workbook. */
export async function DELETE() {
  const { user, response } = await requireUser()
  if (response) return response
  const ownerId = await getWorkspaceDataOwnerId(user.id)
  if (!ownerId) return NextResponse.json({ error: "账号尚未获得工作台授权" }, { status: 403 })
  if (ownerId !== user.id) return NextResponse.json({ error: "只有工作台所有者可以清空排期" }, { status: 403 })
  const { error, count } = await serviceClient.from("project_timeline_items").delete({ count: "exact" }).eq("user_id", ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: count || 0 })
}
