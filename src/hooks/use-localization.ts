"use client"

import { useCallback, useEffect, useState } from "react"

export type LocalizationStatus = "pending" | "translating" | "draft_ready" | "reviewing" | "awaiting_confirmation" | "delivered" | "archived" | "failed"
export type LocalizationMode = "quick" | "standard" | "refined"
export type LocalizationJob = {
  id:string; user_id:string; project_id:string|null; content_id:string|null; source_file_id:string|null; title:string
  source_language:string; target_language:string; target_market:string|null; mode:LocalizationMode; status:LocalizationStatus
  progress:number; glossary:string|null; style_notes:string|null; output_options:string[]; due_date:string|null; error:string|null
  created_at:string; updated_at:string
}
export type LocalizationInput = Pick<LocalizationJob,"title"|"source_language"|"target_language"|"mode"> & Partial<Pick<LocalizationJob,"project_id"|"content_id"|"source_file_id"|"target_market"|"status"|"progress"|"glossary"|"style_notes"|"output_options"|"due_date"|"error">>

export type ProjectFile = {
  id:string; user_id:string; project_id:string; content_id:string|null; content_file_id:string|null; category:string; title:string
  version:number; status:"active"|"final"|"delivered"|"archived"; notes:string|null; created_at:string; updated_at:string
}
export type ProjectFileInput = Pick<ProjectFile,"project_id"|"title"|"category"> & Partial<Pick<ProjectFile,"content_id"|"content_file_id"|"version"|"status"|"notes">>

export function useLocalization() {
  const [jobs,setJobs] = useState<LocalizationJob[]>([])
  const [files,setFiles] = useState<ProjectFile[]>([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState<string|null>(null)
  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null)
    try{const response=await fetch("/api/localization",{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"加载失败");setJobs(data.jobs||[]);setFiles(data.files||[])}catch(caught){setError(caught instanceof Error?caught.message:"加载失败")}finally{setLoading(false)}
  },[])
  const addJob = useCallback(async (input:LocalizationInput) => {
    const response=await fetch("/api/localization",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:"job",data:{...input,output_options:input.output_options||[]}})});const data=await response.json();if(!response.ok)throw new Error(data.error||"创建失败");setJobs((current)=>[data.item as LocalizationJob,...current]);return data.item as LocalizationJob
  },[])
  const updateJob = useCallback(async (id:string,updates:Partial<LocalizationInput>) => {
    const response=await fetch("/api/localization",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:"job",id,updates})});const data=await response.json();if(!response.ok)throw new Error(data.error||"更新失败");setJobs((current)=>current.map((item)=>item.id===id?data.item as LocalizationJob:item));return data.item as LocalizationJob
  },[])
  const deleteJob = useCallback(async (id:string) => {
    const response=await fetch(`/api/localization?entity=job&id=${encodeURIComponent(id)}`,{method:"DELETE"});const data=await response.json();if(!response.ok)throw new Error(data.error||"删除失败");setJobs((current)=>current.filter((item)=>item.id!==id))
  },[])
  const addProjectFile = useCallback(async (input:ProjectFileInput) => {
    const response=await fetch("/api/localization",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:"file",data:input})});const data=await response.json();if(!response.ok)throw new Error(data.error||"保存失败");setFiles((current)=>[data.item as ProjectFile,...current]);return data.item as ProjectFile
  },[])
  const updateProjectFile = useCallback(async (id:string,updates:Partial<ProjectFileInput>) => {
    const response=await fetch("/api/localization",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:"file",id,updates})});const data=await response.json();if(!response.ok)throw new Error(data.error||"更新失败");setFiles((current)=>current.map((item)=>item.id===id?data.item as ProjectFile:item));return data.item as ProjectFile
  },[])
  useEffect(()=>{ const timer=window.setTimeout(()=>void fetchAll(),0);return()=>window.clearTimeout(timer) },[fetchAll])
  return {jobs,files,loading,error,addJob,updateJob,deleteJob,addProjectFile,updateProjectFile,refetch:fetchAll}
}
