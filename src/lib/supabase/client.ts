import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase credentials not configured. Copy .env.local.example to .env.local and fill in your Supabase project URL and anon key."
    )
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
