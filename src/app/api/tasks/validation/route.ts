import {NextRequest,NextResponse} from 'next/server'
import {requireUser} from '@/lib/supabase/require-user'
import {requireWorkspaceAccess} from '@/lib/supabase/workspace-access'
import {readActiveIdeaReviews} from '@/lib/market/validation-feedback-server'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function GET(request:NextRequest){
 try {
  const {user,response}=await requireUser();if(response)return response
  const scope=request.nextUrl.searchParams.get('scope')||'tasks'
  if(!['tasks','home'].includes(scope))return NextResponse.json({error:'无效的验证任务视图'},{status:400})
  const [market,discover]=await Promise.all([requireWorkspaceAccess(user.id,'market_data','view'),requireWorkspaceAccess(user.id,'discover','view')])
  if(!market||!discover||market.ownerId!==discover.ownerId)return NextResponse.json({records:[],canEdit:false,unavailable:true,homeVisible:false},{headers:{'Cache-Control':'private, no-store'}})
  const homeVisible=market.ownerId===user.id&&market.role==='owner'&&discover.role==='owner'
  // Home reminders are personal to the owner. Team task permissions remain separate.
  if(scope==='home'&&!homeVisible)return NextResponse.json({records:[],canEdit:false,unavailable:true,homeVisible:false},{headers:{'Cache-Control':'private, no-store'}})
  return NextResponse.json({homeVisible,records:await readActiveIdeaReviews(market.ownerId),canEdit:discover.canEdit},{headers:{'Cache-Control':'private, no-store'}})
 }catch{return NextResponse.json({error:'验证任务读取失败，请重试；其他任务不受影响'},{status:503})}
}
