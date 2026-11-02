import { NextResponse } from "next/server"
import { requireUser } from "@/lib/supabase/require-user"
import { serviceClient } from "@/lib/supabase/service"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"
import { z } from "zod"

export const dynamic = "force-dynamic"
const itemSchema=z.object({project_id:z.string().uuid(),track:z.string().min(1).max(100),title:z.string().min(1).max(300),start_date:z.string().min(8).max(30),end_date:z.string().min(8).max(30),status:z.enum(["planned","active","completed","delayed","paused"]).optional(),content:z.string().max(20000).nullable().optional(),notes:z.string().max(20000).nullable().optional()})

export async function GET() {
  const { user, response } = await requireUser()
  if (response) return response
  const access = await requireWorkspaceAccess(user.id, "projects", "view")
  if (!access) return NextResponse.json({ error: "没有项目推进查看权限" }, { status: 403 })
  const ownerId = access.ownerId
  const { data, error } = await serviceClient.from("project_timeline_items").select("*").eq("user_id", ownerId).order("start_date", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] }, { headers: { "Cache-Control": "no-store" } })
}

/** Reset the owner's schedule before importing a new authoritative workbook. */
export async function DELETE(request: Request) {
  const { user, response } = await requireUser()
  if (response) return response
  const access = await requireWorkspaceAccess(user.id, "projects", "edit")
  if (!access) return NextResponse.json({ error: "没有项目推进编辑权限" }, { status: 403 })
  const ownerId = access.ownerId
  const id = new URL(request.url).searchParams.get("id")
  if (id) {
    const parsed = z.string().uuid().safeParse(id)
    if (!parsed.success) return NextResponse.json({ error: "排期编号无效" }, { status: 400 })
    const { error } = await serviceClient.from("project_timeline_items").delete().eq("id", parsed.data).eq("user_id", ownerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }
  const { error, count } = await serviceClient.from("project_timeline_items").delete({ count: "exact" }).eq("user_id", ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: count || 0 })
}

export async function POST(request:Request){
  const {user,response}=await requireUser();if(response)return response
  const access=await requireWorkspaceAccess(user.id,"projects","edit");if(!access)return NextResponse.json({error:"没有项目推进编辑权限"},{status:403})
  const body=await request.json().catch(()=>null);const values=Array.isArray(body)?body:[body];const parsed=z.array(itemSchema).min(1).max(1000).safeParse(values);if(!parsed.success)return NextResponse.json({error:"排期数据无效"},{status:400})
  const projectIds=[...new Set(parsed.data.map((item)=>item.project_id))];const {data:projects}=await serviceClient.from("projects").select("id").eq("user_id",access.ownerId).in("id",projectIds);if((projects||[]).length!==projectIds.length)return NextResponse.json({error:"包含无权访问的项目"},{status:403})
  const {data,error}=await serviceClient.from("project_timeline_items").insert(parsed.data.map((item)=>({...item,user_id:access.ownerId,status:item.status||"planned",content:item.content||null,notes:item.notes||null}))).select();if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({items:data||[]},{status:201})
}

export async function PATCH(request:Request){
  const {user,response}=await requireUser();if(response)return response
  const access=await requireWorkspaceAccess(user.id,"projects","edit");if(!access)return NextResponse.json({error:"没有项目推进编辑权限"},{status:403})
  const body=await request.json().catch(()=>null);const id=z.string().uuid().safeParse(body?.id);const parsed=itemSchema.partial().safeParse(body);if(!id.success||!parsed.success)return NextResponse.json({error:"排期数据无效"},{status:400})
  const {id:_ignored,...updates}=body as Record<string,unknown>;void _ignored;const safe=itemSchema.partial().parse(updates);const {data,error}=await serviceClient.from("project_timeline_items").update({...safe,updated_at:new Date().toISOString()}).eq("id",id.data).eq("user_id",access.ownerId).select().single();if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({item:data})
}
