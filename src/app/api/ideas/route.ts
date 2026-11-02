import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"

export const dynamic = "force-dynamic"
const ideaSchema = z.object({ title:z.string().trim().min(1).max(300), source:z.string().max(500).nullable().optional(), market:z.string().max(100).nullable().optional(), genre:z.string().max(100).nullable().optional(), status:z.enum(["待评估","待推进","推进中","暂缓","不采用"]).optional(), notes:z.string().max(30000).nullable().optional() })

export async function GET() {
  const { user, response } = await requireUser()
  if (response) return response
  const access = await requireWorkspaceAccess(user.id, "discover", "view")
  if (!access) return NextResponse.json({ error: "没有选题情报查看权限" }, { status: 403 })
  const { data, error } = await serviceClient.from("ideas").select("*").eq("user_id", access.ownerId).order("updated_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ideas: data || [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request:NextRequest){const {user,response}=await requireUser();if(response)return response;const access=await requireWorkspaceAccess(user.id,"discover","edit");if(!access)return NextResponse.json({error:"没有选题情报编辑权限"},{status:403});const parsed=ideaSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"选题数据不完整"},{status:400});const {data,error}=await serviceClient.from("ideas").insert({...parsed.data,user_id:access.ownerId,status:parsed.data.status||"待评估"}).select().single();if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({idea:data},{status:201})}
export async function PATCH(request:NextRequest){const {user,response}=await requireUser();if(response)return response;const access=await requireWorkspaceAccess(user.id,"discover","edit");if(!access)return NextResponse.json({error:"没有选题情报编辑权限"},{status:403});const body=await request.json().catch(()=>null);const id=z.string().uuid().safeParse(body?.id);const parsed=ideaSchema.partial().safeParse(body);if(!id.success||!parsed.success)return NextResponse.json({error:"选题数据无效"},{status:400});const {id:_ignored,...updates}=body as Record<string,unknown>;void _ignored;const safe=ideaSchema.partial().parse(updates);const {data,error}=await serviceClient.from("ideas").update({...safe,updated_at:new Date().toISOString()}).eq("id",id.data).eq("user_id",access.ownerId).select().single();if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({idea:data})}
export async function DELETE(request:NextRequest){const {user,response}=await requireUser();if(response)return response;const access=await requireWorkspaceAccess(user.id,"discover","edit");if(!access)return NextResponse.json({error:"没有选题情报编辑权限"},{status:403});const id=z.string().uuid().safeParse(request.nextUrl.searchParams.get("id"));if(!id.success)return NextResponse.json({error:"选题编号无效"},{status:400});const {error}=await serviceClient.from("ideas").delete().eq("id",id.data).eq("user_id",access.ownerId);if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({success:true})}
