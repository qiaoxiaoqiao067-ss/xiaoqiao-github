import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase credentials not configured. Copy .env.local.example to .env.local and fill in your Supabase project URL and anon key."
    )
  }

  const configuredOrigin = new URL(supabaseUrl).origin
  const browserFetch: typeof fetch = (input, init) => {
    if (typeof window === "undefined") return fetch(input, init)

    const sourceUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const target = new URL(sourceUrl)
    if (target.origin !== configuredOrigin) return fetch(input, init)

    const proxyUrl = new URL(
      `/api/supabase${target.pathname}${target.search}`,
      window.location.origin,
    )
    const proxiedInput =
      typeof input === "string" || input instanceof URL
        ? proxyUrl
        : new Request(proxyUrl, input)

    return fetch(proxiedInput, init)
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: browserFetch },
  })
}
