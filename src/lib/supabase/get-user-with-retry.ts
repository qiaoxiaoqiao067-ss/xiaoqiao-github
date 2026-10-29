import type { SupabaseClient } from "@supabase/supabase-js"

export async function getUserWithNetworkRetry(supabase: SupabaseClient, attempts = 8) {
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await supabase.auth.getUser()
      // Supabase reports many network failures as an error result instead of
      // throwing. The former implementation returned that first failure
      // immediately, making a transient connection look like a signed-out
      // user and leaving the dashboard empty after refresh.
      if (!result.error) return result
      // A missing session is a normal signed-out state, not a network
      // failure. Return it immediately so middleware can redirect to login.
      if (result.error.name === "AuthSessionMissingError" || /auth session missing/i.test(result.error.message)) {
        return result
      }
      lastError = result.error
    } catch (error) {
      lastError = error
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)))
    }
  }

  throw lastError
}
