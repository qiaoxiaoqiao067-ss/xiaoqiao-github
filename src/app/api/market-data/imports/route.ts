import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser()
  if (response) return response
  const access = await requireWorkspaceAccess(user.id, "market_data", "view")
  if (!access) return NextResponse.json({ error: "没有市场数据查看权限" }, { status: 403 })
  const id = request.nextUrl.searchParams.get("id")
  if (id) {
    const parsedId = z.string().uuid().safeParse(id)
    const offset = Number(request.nextUrl.searchParams.get("offset") || 0)
    if (!parsedId.success || !Number.isInteger(offset) || offset < 0 || offset > 10000) return NextResponse.json({error:"无效的榜单分页参数"},{status:400})
    const {data,error}=await serviceClient.from("market_data_imports").select("raw_rows,updated_at").eq("id",parsedId.data).eq("user_id",access.ownerId).single()
    if(error || !data) return NextResponse.json({error:error?.message||"榜单不存在"},{status:404})
    const rows=Array.isArray(data.raw_rows)?data.raw_rows:[]
    const page = rows.slice(offset,offset+5000)
    // Bound bytes as well as rows; Chinese text and variable-length cells vary greatly.
    while (page.length > 1 && Buffer.byteLength(JSON.stringify(page),"utf8") > 2_000_000) page.length=Math.ceil(page.length/2)
    if (Buffer.byteLength(JSON.stringify(page),"utf8") > 2_000_000) return NextResponse.json({error:"单条榜单记录过大，请检查导入文件。"},{status:413})
    return NextResponse.json({rows:page,total:rows.length,updated_at:data.updated_at},{headers:{"Cache-Control":"no-store"}})
  }
  const { data, error } = await serviceClient.from("market_data_imports").select("id,user_id,source_name,period_label,file_name,row_count,columns,created_at,updated_at").eq("user_id", access.ownerId).order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imports: data || [] }, { headers: { "Cache-Control": "no-store" } })
}

const importSchema=z.object({source_name:z.string().trim().min(1).max(300),period_label:z.string().max(100).nullable().optional(),file_name:z.string().trim().min(1).max(500),row_count:z.number().int().min(0).max(1000000),columns:z.array(z.string().max(300)).max(500),raw_rows:z.array(z.record(z.string(),z.unknown())).max(10000)})
export async function POST(request:NextRequest){const {user,response}=await requireUser();if(response)return response;const access=await requireWorkspaceAccess(user.id,"market_data","edit");if(!access)return NextResponse.json({error:"没有市场数据编辑权限"},{status:403});const parsed=importSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"市场数据格式无效"},{status:400});const {data,error}=await serviceClient.from("market_data_imports").insert({...parsed.data,user_id:access.ownerId}).select().single();if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({import:data},{status:201})}
export async function DELETE(request:NextRequest){const {user,response}=await requireUser();if(response)return response;const access=await requireWorkspaceAccess(user.id,"market_data","edit");if(!access)return NextResponse.json({error:"没有市场数据编辑权限"},{status:403});const id=z.string().uuid().safeParse(request.nextUrl.searchParams.get("id"));if(!id.success)return NextResponse.json({error:"数据编号无效"},{status:400});const {error}=await serviceClient.from("market_data_imports").delete().eq("id",id.data).eq("user_id",access.ownerId);if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({success:true})}
