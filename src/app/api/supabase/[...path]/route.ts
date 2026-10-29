import type { NextRequest } from "next/server"
import { supabaseServerFetch } from "@/lib/supabase/server-fetch"

type RouteContext = { params: Promise<{ path: string[] }> }

async function forward(request: NextRequest, context: RouteContext) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 })
  }

  const { path } = await context.params
  const target = new URL(`/${path.join("/")}`, supabaseUrl)
  target.search = request.nextUrl.search

  const headers = new Headers(request.headers)
  for (const name of ["host", "connection", "content-length", "accept-encoding"]) {
    headers.delete(name)
  }

  try {
    const upstream = await supabaseServerFetch(target, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      redirect: "manual",
    })
    const responseHeaders = new Headers(upstream.headers)
    for (const name of ["connection", "content-encoding", "content-length", "transfer-encoding"]) {
      responseHeaders.delete(name)
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch {
    return Response.json(
      { error: "数据服务暂时不可用，请稍后重试。" },
      { status: 503 },
    )
  }
}

export const GET = forward
export const POST = forward
export const PUT = forward
export const PATCH = forward
export const DELETE = forward
export const HEAD = forward
