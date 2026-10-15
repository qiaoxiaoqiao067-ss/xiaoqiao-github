import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { serviceClient } from "@/lib/supabase/service"
import { requireUser } from "@/lib/supabase/require-user"
import { startReviewWorker } from "@/lib/reviews/review-runner"

export const dynamic = "force-dynamic"
export const revalidate = 0

const contentTypes = ["submission", "development", "benchmark", "original"] as const
const contentStatuses = ["pending", "parsing", "ready", "reviewing", "reviewed", "developing", "archived"] as const

const createContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  contentType: z.enum(contentTypes).default("submission"),
  status: z.enum(contentStatuses).default("pending"),
  source: z.string().trim().max(500).nullish(),
  market: z.string().trim().max(100).nullish(),
  language: z.string().trim().max(100).nullish(),
  genre: z.string().trim().max(100).nullish(),
  logline: z.string().trim().max(2000).nullish(),
  priority: z.number().int().min(0).max(2).default(0),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
})

const updateContentSchema = createContentSchema.partial().extend({
  id: z.string().uuid(),
})

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error"
}

export async function GET(request: NextRequest) {
  try {
    startReviewWorker()
    const { user, response } = await requireUser()
    if (response) return response

    const id = request.nextUrl.searchParams.get("id")
    const status = request.nextUrl.searchParams.get("status")
    const q = request.nextUrl.searchParams.get("q")?.trim()

    if (id) {
      const { data, error } = await serviceClient
        .from("contents")
        .select("*, content_files(*), content_reviews(*)")
        .eq("id", id)
        .eq("user_id", user.id)
        .single()

      if (error) throw error
      return NextResponse.json({ content: data })
    }

    let query = serviceClient
      .from("contents")
      .select("*, content_files(id, file_name, version, parse_status, is_primary, created_at), content_reviews(id, reviewer_type, status, score, is_final, result, created_at)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(100)

    if (status && contentStatuses.includes(status as (typeof contentStatuses)[number])) {
      query = query.eq("status", status)
    }
    if (q) {
      const safeQuery = q.replace(/[,()%]/g, " ").slice(0, 100)
      query = query.or(`title.ilike.%${safeQuery}%,logline.ilike.%${safeQuery}%`)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(
      { contents: data || [] },
      { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
    )
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const parsed = createContentSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid content data", details: parsed.error.flatten() }, { status: 400 })
    }

    const input = parsed.data
    const { data, error } = await serviceClient
      .from("contents")
      .insert({
        user_id: user.id,
        title: input.title,
        content_type: input.contentType,
        status: input.status,
        source: input.source || null,
        market: input.market || null,
        language: input.language || null,
        genre: input.genre || null,
        logline: input.logline || null,
        priority: input.priority,
        tags: input.tags,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ content: data }, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const parsed = updateContentSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid content data", details: parsed.error.flatten() }, { status: 400 })
    }

    const { id, contentType, ...input } = parsed.data
    const updates = {
      ...input,
      ...(contentType !== undefined ? { content_type: contentType } : {}),
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await serviceClient
      .from("contents")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ content: data })
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const id = request.nextUrl.searchParams.get("id")
    if (!id || !z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const { data: files, error: filesError } = await serviceClient
      .from("content_files")
      .select("storage_path")
      .eq("content_id", id)
      .eq("user_id", user.id)

    if (filesError) throw filesError
    const paths = (files || []).map((file) => file.storage_path).filter(Boolean)
    if (paths.length > 0) {
      const { error: storageError } = await serviceClient.storage.from("content-files").remove(paths)
      if (storageError) throw storageError
    }

    const { error } = await serviceClient
      .from("contents")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
