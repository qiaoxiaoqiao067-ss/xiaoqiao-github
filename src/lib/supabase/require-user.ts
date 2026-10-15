import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { getUserWithNetworkRetry } from "@/lib/supabase/get-user-with-retry"

export async function requireUser() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error,
  } = await getUserWithNetworkRetry(supabase)

  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  return { user, response: null }
}
