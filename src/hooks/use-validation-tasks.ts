"use client"
import {useCallback,useEffect,useRef,useState} from 'react'
import {marketJson} from '@/components/market/report-library'
import type {IdeaReviewRecord} from '@/lib/market/idea-review'
import {validationTasks} from '@/lib/market/validation-tasks'
import {watchValidationChanges} from '@/lib/market/validation-events'
export function useValidationTasks(scope:'tasks'|'home'='tasks'){
 const [records,setRecords]=useState<IdeaReviewRecord[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[canEdit,setCanEdit]=useState(false),[unavailable,setUnavailable]=useState(false),[homeVisible,setHomeVisible]=useState(false)
 const sequence=useRef(0)
 const load=useCallback(async()=>{
  const request=++sequence.current
  try {const data=await marketJson(`/api/tasks/validation?scope=${scope}`);if(request!==sequence.current)return;setRecords(data.records);setCanEdit(data.canEdit);setUnavailable(!!data.unavailable);setHomeVisible(data.homeVisible===true);setError('')}
  catch(e){if(request===sequence.current){setError((e as Error).message);if(scope==='home'){setHomeVisible(false);setRecords([]);setCanEdit(false)}}}
  finally{if(request===sequence.current)setLoading(false)}
 },[scope])
 useEffect(()=>{
  const invalidate=()=>{sequence.current++}
  // Initial request resolves asynchronously; later updates come from subscribed events.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void load()
  const refresh=()=>{if(document.visibilityState==='visible')void load()}
  const unwatch=watchValidationChanges(refresh)
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh)
  const timer=window.setInterval(refresh,60000)
  return ()=>{invalidate();unwatch();window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);clearInterval(timer)}
 },[load])
 const replace=(record:IdeaReviewRecord)=>{sequence.current++;setRecords(old=>old.map(r=>r.id===record.id?{...record,currentIdeaTitle:r.currentIdeaTitle}:r))}
 return {tasks:validationTasks(records),loading,error,canEdit,unavailable,homeVisible,load,replace}
}
export type ValidationTaskStore=ReturnType<typeof useValidationTasks>
