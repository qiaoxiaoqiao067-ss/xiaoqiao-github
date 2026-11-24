import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"

export const dynamic = "force-dynamic"
const SOURCE = "海外AI真人短剧日报"
const CONVERSATION_ID = "6aaf988e-3530-83eb-b276-bc6716d138c4"
const SHARE_URL = "https://chatgpt.com/share/6b001fd7-c938-83ec-a845-84e45e5fd4f2"

const reportSchema = z.object({
  date: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(100_000),
  source: z.string().trim().max(300).optional(),
  conversationId: z.string().trim().max(100).optional(),
  shareUrl: z.string().url().max(500).optional(),
})

export async function GET() {
  const { user, response } = await requireUser()
  if (response) return response
  const access = await requireWorkspaceAccess(user.id, "market_data", "view")
  if (!access) return NextResponse.json({ error: "没有市场数据查看权限" }, { status: 403 })
  const { data, error } = await serviceClient
    .from("market_data_imports")
    .select("id,period_label,raw_rows,created_at,updated_at")
    .eq("user_id", access.ownerId)
    .eq("source_name", SOURCE)
    .order("period_label", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const reports = (data || []).flatMap((item) => {
    const row = Array.isArray(item.raw_rows) ? item.raw_rows[0] : null
    if (!row || typeof row !== "object") return []
    return [{
      id: item.id,
      date: String(row.date || item.period_label || ""),
      title: String(row.title || `${item.period_label || ""} 海外AI真人短剧日报`),
      content: String(row.content || ""),
      source: String(row.source || "ChatGPT｜海外AI真人短剧日报"),
      conversationId: String(row.conversationId || CONVERSATION_ID),
      shareUrl: String(row.shareUrl || SHARE_URL),
      savedAt: item.updated_at || item.created_at,
    }]
  })
  return NextResponse.json({ reports }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser()
  if (response) return response
  const access = await requireWorkspaceAccess(user.id, "market_data", "edit")
  if (!access) return NextResponse.json({ error: "没有市场数据编辑权限" }, { status: 403 })
  const parsed = reportSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "日报格式无效" }, { status: 400 })
  const row = { ...parsed.data, source: parsed.data.source || "ChatGPT｜海外AI真人短剧日报", conversationId: parsed.data.conversationId || CONVERSATION_ID, shareUrl: parsed.data.shareUrl || SHARE_URL }
  const { data: existing, error: findError } = await serviceClient
    .from("market_data_imports")
    .select("id")
    .eq("user_id", access.ownerId)
    .eq("source_name", SOURCE)
    .eq("period_label", parsed.data.date)
    .limit(1)
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 })
  const payload = { file_name: `${parsed.data.date}_海外AI真人短剧日报.md`, row_count: 1, columns: ["date", "title", "content", "source", "conversationId", "shareUrl"], raw_rows: [row] }
  const query = existing?.[0]
    ? serviceClient.from("market_data_imports").update(payload).eq("id", existing[0].id).eq("user_id", access.ownerId)
    : serviceClient.from("market_data_imports").insert({ ...payload, user_id: access.ownerId, source_name: SOURCE, period_label: parsed.data.date })
  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: true })
}
