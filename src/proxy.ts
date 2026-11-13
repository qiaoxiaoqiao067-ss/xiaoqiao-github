import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getUserWithNetworkRetry } from "@/lib/supabase/get-user-with-retry"

import {getWorkspaceAccess,requireWorkspaceAccess} from "@/lib/supabase/workspace-access"
import {routeAccess,SHARED_PAGES} from "@/lib/supabase/route-access"

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Skip auth if Supabase is not configured yet
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const policy=routeAccess(request.nextUrl.pathname)
  if(policy==='public')return supabaseResponse
  const isApi=request.nextUrl.pathname.startsWith('/api/')
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
    if(isApi)return NextResponse.json({error:"认证服务暂时不可用"},{status:503})
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (!user) {
    if(isApi)return NextResponse.json({error:"Unauthorized"},{status:401})
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  try {
    const access=policy==='owner'?await getWorkspaceAccess(user.id,'content'):await requireWorkspaceAccess(user.id,SHARED_PAGES[policy],'view')
    const allowed=policy==='owner'?access?.role==='owner'&&access.ownerId===user.id:!!access
    if(!allowed){
      if(isApi)return NextResponse.json({error:'此功能仅工作台所有者可使用'},{status:403,headers:{'Cache-Control':'private, no-store'}})
      let destination='/access-denied'
      if(request.nextUrl.pathname==='/')for(const [path,key] of Object.entries(SHARED_PAGES)){if(await requireWorkspaceAccess(user.id,key,'view')){destination=path;break}}
      const url=request.nextUrl.clone();url.pathname=destination;url.search='';return NextResponse.redirect(url)
    }
  } catch {return NextResponse.json({error:'权限检查暂时不可用，请重试'},{status:503})}
  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
