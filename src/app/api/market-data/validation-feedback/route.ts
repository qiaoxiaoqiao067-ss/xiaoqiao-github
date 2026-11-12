import {NextRequest,NextResponse} from 'next/server'
import {requireUser} from '@/lib/supabase/require-user'
import {requireWorkspaceAccess} from '@/lib/supabase/workspace-access'
import {monthKey} from '@/lib/market/monthly-history'
import {readFeedbackCandidates} from '@/lib/market/validation-feedback-server'
import {feedbackSummary} from '@/lib/market/validation-feedback'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function GET(req:NextRequest){try{const {user,response}=await requireUser();if(response)return response;const [market,ideas]=await Promise.all([requireWorkspaceAccess(user.id,'market_data','view'),requireWorkspaceAccess(user.id,'discover','view')]);if(!market||!ideas||market.ownerId!==ideas.ownerId)return NextResponse.json({error:'需要市场与选题查看权限'},{status:403});const period=req.nextUrl.searchParams.get('period')||'',genre=req.nextUrl.searchParams.get('genre')||'';if(!monthKey(period)||genre.length>100)return NextResponse.json({error:'请选择有效的反馈月份'},{status:400});const candidates=await readFeedbackCandidates(market.ownerId,period,genre);return NextResponse.json({candidates,summary:feedbackSummary(candidates,period)},{headers:{'Cache-Control':'private, no-store'}})}catch{return NextResponse.json({error:'建议验证结果读取失败，请重试；不会以缺失数据判断建议有效'},{status:503})}}
