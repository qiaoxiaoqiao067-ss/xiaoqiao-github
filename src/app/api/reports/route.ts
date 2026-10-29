import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireUser } from "@/lib/supabase/require-user"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误"
}

export async function GET(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const client = getClient()
    const { searchParams } = new URL(request.url)
    const requestedStatus = searchParams.get("status") || "final"
    const requestedDate = searchParams.get("date")
    let query = client
      .from("daily_reports")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", requestedStatus)
      .order("date", { ascending: false })
      .limit(30)
    if (requestedDate) query = query.eq("date", requestedDate)
    const { data, error } = await query

    if (error) throw error
    return NextResponse.json({ reports: data || [] })
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const body = await request.json()
    const { date, content, status, summary } = body

    if (!date || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const client = getClient()

    // Check existing
    const { data: existing } = await client
      .from("daily_reports")
      .select("id, status")
      .eq("date", date)
      .eq("user_id", user.id)
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
        .insert({ user_id: user.id, date, content, summary, status: status || "draft" })
        .select()
        .single()

      if (error) throw error
      result = data
    }

    if ((status || "draft") === "final") {
      await client
        .from("daily_reports")
        .delete()
        .eq("user_id", user.id)
        .eq("date", date)
        .eq("status", "draft")
    }

    return NextResponse.json({ report: result })
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const { id, sentToLark } = await request.json()
    if (!id || sentToLark !== true) return NextResponse.json({ error: "Missing required fields" }, { status: 400 })

    const client = getClient()
    const { data, error } = await client
      .from("daily_reports")
      .update({ sent_to_lark: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "final")
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ report: data })
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    const client = getClient()
    const { error } = await client.from("daily_reports").delete().eq("id", id).eq("user_id", user.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
