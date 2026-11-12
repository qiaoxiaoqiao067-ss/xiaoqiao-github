import {serviceClient} from '@/lib/supabase/service'
import {isBoardImport,requestedImports} from './import-scope'
import {activeMonthlySources,monthKey} from './monthly-history'
import {boardSamples,compareBoards} from './board-analysis'
import {buildMarketResearch} from './research'
export async function monthlyResearch(owner:string,period:string,comparison:string){
 const res=await serviceClient.from('market_data_imports').select('id,source_name,file_name,columns,created_at,updated_at,period_label').eq('user_id',owner).in('period_label',[period,comparison]);if(res.error)throw res.error
 const directory=(res.data||[]).filter(i=>isBoardImport(i)||i.source_name.startsWith('市场版本:'))
 const requested=requestedImports(directory,period,comparison);if(!requested.length)throw new Error('本期没有榜单')
 const rows=await serviceClient.from('market_data_imports').select('*').eq('user_id',owner).in('id',requested.map(i=>i.id));if(rows.error)throw rows.error
 if(rows.data?.length!==requested.length||rows.data.some(r=>!requested.some(i=>i.id===r.id&&i.updated_at===r.updated_at)))throw new Error('榜单在读取时更新，请刷新')
 const all=directory.map(i=>({...i,raw_rows:[],...rows.data.find(r=>r.id===i.id)}))
 const current=boardSamples(activeMonthlySources(all,monthKey(period)!),'month'),previous=boardSamples(activeMonthlySources(all,monthKey(comparison)||''),'month')
 return {directory,research:buildMarketResearch(current,compareBoards(current,previous))}
}
