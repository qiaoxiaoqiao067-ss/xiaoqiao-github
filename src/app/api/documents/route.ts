import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

const CATEGORIES = ["技术文档", "会议纪要", "日报", "周报", "制度文件", "模板", "其他"]
const TITLE_PATTERNS = [
  { pattern: /^([^-]+)-(.+)$/, format: (m: RegExpMatchArray) => `${m[1].trim()} - ${m[2].trim()}` },
  { pattern: /^(.+)_(.+)$/, format: (m: RegExpMatchArray) => `${m[1].trim()} - ${m[2].trim()}` },
]

function standardizeTitle(title: string): string {
  // Remove file extension
  let t = title.replace(/\.(docx|pdf|md|txt|pptx|xlsx)$/i, "")
  // Replace underscores and extra spaces
  t = t.replace(/_/g, " ").replace(/\s+/g, " ").trim()
  // Apply patterns
  for (const { pattern, format } of TITLE_PATTERNS) {
    const match = t.match(pattern)
    if (match) return format(match)
  }
  return t
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get("q")
    const category = searchParams.get("category")
    const id = searchParams.get("id")

    const client = getClient()

    if (id) {
      const { data, error } = await client.from("documents").select("*").eq("id", id).single()
      if (error) throw error
      return NextResponse.json({ document: data })
    }

    let query = client.from("documents").select("*").order("updated_at", { ascending: false }).limit(50)

    if (q) {
      query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`)
    }
    if (category) {
      query = query.eq("category", category)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ documents: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, title, content, category, tags, file_url, file_type } = body

    if (!userId || !title) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const standardizedTitle = standardizeTitle(title)
    const safeCategory = CATEGORIES.includes(category) ? category : "其他"
    const tagsArr = Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean) : [])

    const client = getClient()
    const { data, error } = await client
      .from("documents")
      .insert({
        user_id: userId,
        title,
        standardized_title: standardizedTitle,
        content: content || "",
        category: safeCategory,
        tags: tagsArr,
        file_url: file_url || null,
        file_type: file_type || "text",
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ document: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, title, content, category, tags } = body
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const client = getClient()
    const updates: any = { updated_at: new Date().toISOString() }
    if (title !== undefined) { updates.title = title; updates.standardized_title = standardizeTitle(title) }
    if (content !== undefined) updates.content = content
    if (category !== undefined) updates.category = category
    if (tags !== undefined) updates.tags = tags

    const { data, error } = await client
      .from("documents")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ document: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const client = getClient()
    const { error } = await client.from("documents").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
