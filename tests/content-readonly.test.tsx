/** Real detail render: only loaded data/auth are isolated, view components stay real. */
import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
Object.assign(globalThis,{React})
function mock(id:string,exports:unknown){const p=require.resolve(id);require.cache[p]={id:p,filename:p,loaded:true,exports} as NodeJS.Module}
const content={id:'script',title:'完整可读稿件',content_type:'submission',status:'reviewed',logline:'原有梗概',content_files:[{id:'file',file_name:'剧本.txt',version:1,parse_status:'ready',created_at:'2026-11-13',extracted_text:'保留完整剧本正文'}],content_reviews:[{id:'human',reviewer_type:'human',status:'completed',score:80,result:{verdict:'审核通过',notes:'已保存的责编意见'},is_final:true,created_at:'2026-11-13'}]}
let calls=0
const actualReact=require('react')
mock('react',{...actualReact,useState:(initial:unknown)=>{const n=calls++;return actualReact.useState(n===0?content:n===1?false:initial)}})
mock('next/navigation',{useParams:()=>({id:'script'}),useRouter:()=>({push:()=>{}})})
mock('../src/components/layout/app-layout',{AppLayout:({children}:{children:React.ReactNode})=><main>{children}</main>})
mock('../src/hooks/use-projects',{useProjects:()=>({projects:[],addProject:()=>{},updateProject:()=>{}})})
const {WorkspacePermissionsContext}=require('../src/components/permissions/workspace-permissions')
const Detail=require('../src/app/(app)/content/[id]/page').default
function render(role:string){calls=0;return renderToStaticMarkup(<WorkspacePermissionsContext.Provider value={{configured:true,role,status:'active',modules:['content','projects'].map(key=>({key,canView:true,canEdit:role==='collaborator'}))}}><Detail/></WorkspacePermissionsContext.Provider>)}
test('readonly detail retains title, verdict, original text and downloads, hides all mutation forms',()=>{
 const h=render('viewer')
 for(const t of ['完整可读稿件','原有梗概','已保存的责编意见','保留完整剧本正文','/api/contents/files/file/download'])assert.ok(h.includes(t),t)
 for(const t of ['上传新版本','删除剧本','导入外部AI审核草稿','<textarea','人工评分','>建立项目<','保存最终判断','更新最终判断'])assert.ok(!h.includes(t),t)
})
test('editable member retains detail writes and development actions',()=>{
 const h=render('collaborator')
 for(const t of ['上传新版本','删除剧本','导入外部AI审核草稿','<textarea','人工评分','建立项目','更新最终判断'])assert.ok(h.includes(t),t)
})
