import { ProxyAgent, fetch as undiciFetch } from "undici"

/**
 * Server-side Supabase requests do not automatically inherit macOS proxy
 * settings. When a local proxy is configured, route these requests through it
 * so authentication keeps the same network path as the browser.
 */
const proxyUrl = process.env.SUPABASE_PROXY_URL
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

export const supabaseServerFetch: typeof fetch = async (input, init) => {
  if (!dispatcher) return fetch(input, init)

  try {
    return await undiciFetch(input as unknown as Parameters<typeof undiciFetch>[0], {
      ...init,
      dispatcher,
    } as unknown as Parameters<typeof undiciFetch>[1]) as unknown as Response
  } catch {
    // Local proxy processes may be unavailable or reject TLS intermittently.
    // Fall back to the normal network path so authentication remains usable.
    return fetch(input, init)
  }
}
