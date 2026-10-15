import { NextResponse } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser()
  if (response) return response

  const parsed = z.string().uuid().safeParse((await context.params).id)
  if (!parsed.success) return NextResponse.json({ error: "Invalid file id" }, { status: 400 })

  const { data: file, error } = await serviceClient.from("content_files").select("storage_path").eq("id", parsed.data).eq("user_id", user.id).single()
  if (error || !file) return NextResponse.json({ error: "File not found" }, { status: 404 })

  const { data, error: signedError } = await serviceClient.storage.from("content-files").createSignedUrl(file.storage_path, 60)
  if (signedError) return NextResponse.json({ error: signedError.message }, { status: 500 })
  return NextResponse.redirect(data.signedUrl)
}
