import { NextResponse } from "next/server"
import { serviceClient } from "@/lib/supabase/service"
import { requireUser } from "@/lib/supabase/require-user"
import { requireWorkspaceAccess } from "@/lib/supabase/workspace-access"

function storagePath(notes:unknown){if(typeof notes!=="string")return"";try{return String(JSON.parse(notes)?.storage_path||"")}catch{return""}}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const {user,response}=await requireUser();if(response)return response
  const access=await requireWorkspaceAccess(user.id,"projects","view");if(!access)return NextResponse.json({error:"没有项目推进查看权限"},{status:403})
  const {id}=await params;const {data,error}=await serviceClient.from("project_files").select("notes").eq("id",id).eq("user_id",access.ownerId).single();if(error)return NextResponse.json({error:"文件不存在"},{status:404})
  const path=storagePath(data.notes);if(!path)return NextResponse.json({error:"该历史档案没有可下载的实体文件"},{status:404})
  const {data:signed,error:signedError}=await serviceClient.storage.from("content-files").createSignedUrl(path,60);if(signedError)return NextResponse.json({error:signedError.message},{status:500})
  return NextResponse.redirect(signed.signedUrl)
}
