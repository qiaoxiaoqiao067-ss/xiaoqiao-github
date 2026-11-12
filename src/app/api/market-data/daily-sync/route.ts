import {NextResponse} from 'next/server'
import {requireUser} from '@/lib/supabase/require-user'
import {requireWorkspaceAccess} from '@/lib/supabase/workspace-access'
import {serviceClient} from '@/lib/supabase/service'
import {DAILY_SYNC_SOURCE} from '@/lib/adx/daily-board-sync'
export const dynamic='force-dynamic'
export async function GET(){
 const {user,response}=await requireUser();if(response)return response
 const access=await requireWorkspaceAccess(user.id,'market_data','view');if(!access)return NextResponse.json({error:'没有市场查看权限'},{status:403})
 const query=()=>serviceClient.from('market_data_imports').select('raw_rows').eq('user_id',access.ownerId).eq('source_name',DAILY_SYNC_SOURCE)
 const [latest,success]=await Promise.all([query().order('created_at',{ascending:false}).limit(1),query().eq('raw_rows->0->>state','synced').order('period_label',{ascending:false}).order('created_at',{ascending:false}).limit(1)])
 if(latest.error||success.error)return NextResponse.json({error:'日榜同步状态读取失败'},{status:503})
 return NextResponse.json({latest:latest.data?.[0]?.raw_rows?.[0]||null,success:success.data?.[0]?.raw_rows?.[0]||null},{headers:{'Cache-Control':'private, no-store'}})
}
