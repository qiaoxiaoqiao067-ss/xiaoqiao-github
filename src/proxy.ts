import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getUserWithNetworkRetry } from "@/lib/supabase/get-user-with-retry"

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Skip auth if Supabase is not configured yet
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const protectedPaths = [
    "/",
    "/todos",
    "/reports",
    "/docs",
    "/content",
    "/ai-learning",
    "/projects",
    "/market-data",
    "/discover",
    "/research",
    "/meetings",
    "/knowledge",
    "/localization",
    "/settings",
  ]

  const isProtectedRoute = protectedPaths.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(path + "/")
  )

  // Public auth screens and callbacks do not need a remote session check.
  if (!isProtectedRoute) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // A protected route must never become an opaque browser-level load error
  // just because Supabase is temporarily unreachable. Treat a failed session
  // lookup as signed out and send the user to the public login screen.
  let user = null
  try {
    const result = await getUserWithNetworkRetry(supabase, 3)
    user = result.data.user
  } catch {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
