"use client"
import {useCallback,useEffect,useState} from 'react'
import {monthKey} from '@/lib/market/monthly-history'
import type {MonthlyReviewRecord} from '@/lib/market/monthly-review'
export function useMonthlyReviews(period:string,comparison:string){
 const key=period+'|'+comparison
 const [state,setState]=useState<{key:string;records:MonthlyReviewRecord[];canEdit:boolean;loading:boolean;error:string}>({key:'',records:[],canEdit:false,loading:true,error:''})
 const [revision,setRevision]=useState(0)
 useEffect(()=>{let active=true;if(!monthKey(period))return;void (async()=>{try{const res=await fetch(`/api/market-data/monthly-reviews?period=${encodeURIComponent(period)}&comparison=${encodeURIComponent(comparison)}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});const data=await res.json().catch(()=>null);if(!res.ok||!data)throw new Error(data?.error||'联合研判读取失败');if(active)setState({key,records:data.records,canEdit:data.canEdit,loading:false,error:''})}catch(e){if(active)setState(old=>({...old,key,records:[],loading:false,error:(e as Error).message}))}})();return()=>{active=false}},[key,period,comparison,revision])
 const replace=useCallback((r:MonthlyReviewRecord)=>setState(old=>({...old,records:old.records.some(i=>i.id===r.id)?old.records.map(i=>i.id===r.id?r:i):[r,...old.records]})),[])
 return {...(state.key===key?state:{records:[],canEdit:false,loading:!!monthKey(period),error:''}),replace,refresh:()=>setRevision(v=>v+1)}
}
