import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"

export const dynamic = "force-dynamic"

export async function GET() {
  const { user, response } = await requireUser()
  if (response) return response
  const access = await requireWorkspaceAccess(user.id, "market_data", "view")
  if (!access) return NextResponse.json({ error: "没有市场数据查看权限" }, { status: 403 })
  const { data, error } = await serviceClient.from("market_data_imports").select("*").eq("user_id", access.ownerId).order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imports: data || [] }, { headers: { "Cache-Control": "no-store" } })
}

const importSchema=z.object({source_name:z.string().trim().min(1).max(300),period_label:z.string().max(100).nullable().optional(),file_name:z.string().trim().min(1).max(500),row_count:z.number().int().min(0).max(1000000),columns:z.array(z.string().max(300)).max(500),raw_rows:z.array(z.record(z.string(),z.unknown())).max(10000)})
export async function POST(request:NextRequest){const {user,response}=await requireUser();if(response)return response;const access=await requireWorkspaceAccess(user.id,"market_data","edit");if(!access)return NextResponse.json({error:"没有市场数据编辑权限"},{status:403});const parsed=importSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"市场数据格式无效"},{status:400});const {data,error}=await serviceClient.from("market_data_imports").insert({...parsed.data,user_id:access.ownerId}).select().single();if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({import:data},{status:201})}
export async function DELETE(request:NextRequest){const {user,response}=await requireUser();if(response)return response;const access=await requireWorkspaceAccess(user.id,"market_data","edit");if(!access)return NextResponse.json({error:"没有市场数据编辑权限"},{status:403});const id=z.string().uuid().safeParse(request.nextUrl.searchParams.get("id"));if(!id.success)return NextResponse.json({error:"数据编号无效"},{status:400});const {error}=await serviceClient.from("market_data_imports").delete().eq("id",id.data).eq("user_id",access.ownerId);if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({success:true})}
