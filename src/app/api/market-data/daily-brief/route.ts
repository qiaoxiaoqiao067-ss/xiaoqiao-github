import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { requireWorkspaceAccess } from '@/lib/supabase/workspace-access'
import { serviceClient } from '@/lib/supabase/service'
import { DAILY_BRIEF_SOURCE, dailyBriefState, type DailyBrief } from '@/lib/adx/daily-brief'
export const dynamic='force-dynamic'
export async function GET(){
  const {user,response}=await requireUser();if(response)return response
  const access=await requireWorkspaceAccess(user.id,'market_data','view')
  if(!access)return NextResponse.json({error:'没有市场数据查看权限'},{status:403})
  const query=()=>serviceClient.from('market_data_imports').select('raw_rows').eq('user_id',access.ownerId).eq('source_name',DAILY_BRIEF_SOURCE)
  // Fetch the last successful report independently; prolonged failures must never evict it.
  const [lastAttempt,lastReport]=await Promise.all([query().order('created_at',{ascending:false}).limit(1),query().not('raw_rows->0->>report','is',null).order('period_label',{ascending:false}).order('created_at',{ascending:false}).limit(1)])
  if(lastAttempt.error||lastReport.error)return NextResponse.json({error:'ADX日报读取失败，请重试'},{status:503})
  const runs=[...(lastAttempt.data||[]),...(lastReport.data||[])].flatMap(r=>Array.isArray(r.raw_rows)?r.raw_rows:[]).filter((r):r is DailyBrief=>!!r&&typeof r.runKey==='string'&&typeof r.collectedAt==='string'&&Array.isArray(r.signals))
  const state=dailyBriefState(runs)
  return NextResponse.json({...state,latest:state.latest?{...state.latest,report:null,signals:[]}:null},{headers:{'Cache-Control':'private, no-store'}})
}
