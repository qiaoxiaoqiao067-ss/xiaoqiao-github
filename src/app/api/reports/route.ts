import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function GET() {
  try {
    const client = getClient()
    const { data, error } = await client
      .from("daily_reports")
      .select("*")
      .eq("status", "final")
      .order("date", { ascending: false })
      .limit(30)

    if (error) throw error
    return NextResponse.json({ reports: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, date, content, status, summary } = body

    if (!userId || !date || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const client = getClient()

    // Check existing
    const { data: existing } = await client
      .from("daily_reports")
      .select("id, status")
      .eq("date", date)
      .eq("user_id", userId)
      .eq("status", status || "draft")
      .maybeSingle()

    let result
    if (existing) {
      const { data, error } = await client
        .from("daily_reports")
        .update({ content, summary, status, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single()

      if (error) throw error
      result = data
    } else {
      const { data, error } = await client
        .from("daily_reports")
        .insert({ user_id: userId, date, content, summary, status: status || "draft" })
        .select()
        .single()

      if (error) throw error
      result = data
    }

    return NextResponse.json({ report: result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    const client = getClient()
    const { error } = await client.from("daily_reports").delete().eq("id", id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
