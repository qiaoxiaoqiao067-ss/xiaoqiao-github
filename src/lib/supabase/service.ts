import { createClient } from "@supabase/supabase-js"
import { supabaseServerFetch } from "./server-fetch"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Only use this client in server-side code (API routes, Server Components)
// It bypasses RLS — never expose to the browser
export const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
  global: {
    fetch: supabaseServerFetch,
  },
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
