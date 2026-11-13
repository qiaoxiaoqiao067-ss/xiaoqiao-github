/** Render real module pages with isolated business fixtures and permission roles. */
import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
Object.assign(globalThis,{React})
function mock(id:string,exports:unknown){const p=require.resolve(id);require.cache[p]={id:p,filename:p,loaded:true,exports} as NodeJS.Module}
const noop=async()=>{}
mock('../src/lib/supabase/client',{createClient:()=>({auth:{}})})
mock('../src/components/layout/app-layout',{AppLayout:({children}:{children:React.ReactNode})=><main>{children}</main>})
mock('next/navigation',{useRouter:()=>({push:noop,refresh:noop}),usePathname:()=>'/content',useSearchParams:()=>new URLSearchParams()})
const now=new Date().toISOString(),project={id:'project1',title:'可读项目',stage:'剧本开发',progress:40,status:'active',project_no:1,created_at:now,updated_at:now,market:'北美',genre:'悬疑',next_action:'现有下一步',risk:null}
mock('../src/hooks/use-projects',{PROJECT_STAGES:require('../src/lib/projects/stages').PROJECT_STAGES,useProjects:()=>({projects:[project],loading:false,error:null,addProject:noop,updateProject:noop,deleteProject:noop,refetch:noop})})
mock('../src/hooks/use-project-timeline',{useProjectTimeline:()=>({items:[],loading:false,error:null,addItem:noop,addMany:noop,updateItem:noop,deleteItem:noop,clearAll:noop,refetch:noop}),displayTimelineTrack:(i:{track:string})=>i.track,TIMELINE_TRACKS:['内容部'],TIMELINE_STATUSES:['planned'],TIMELINE_STATUS_LABELS:{planned:'待开始'}})
mock('../src/hooks/use-research-items',{useResearchItems:()=>({items:[],addItem:noop})})
mock('../src/hooks/use-meetings',{useMeetings:()=>({meetings:[],addMeeting:noop})})
mock('../src/hooks/use-ideas',{IDEA_STATUSES:['待评估','待推进','推进中','暂缓','不采用'],useIdeas:()=>({ideas:[{id:'idea1',title:'可读选题',created_at:now,updated_at:now,status:'待推进',notes:'原有梗概'}],loading:false,error:null,addIdea:noop,updateIdea:noop,deleteIdea:noop,refetch:noop})})
mock('../src/hooks/use-contents',{useContents:()=>({contents:[{id:'content1',title:'可读稿件',content_type:'submission',status:'ready',created_at:now,updated_at:now,content_files:[{id:'file1',parse_status:'completed',version:1}],content_reviews:[]}],loading:false,error:null,fetchContents:noop,addContent:noop,uploadScripts:noop,deleteContent:noop,setContentStatus:noop})})
const permissions=require('../src/components/permissions/workspace-permissions') as typeof import('../src/components/permissions/workspace-permissions')
const {WorkspacePermissionsContext,mayEdit,EditOnly,ReadableAction,EditableSelect}=permissions
const keys=['content','projects','market_data','discover'] as const
const team=(role:string)=>({configured:true,role,status:'active',modules:keys.map(key=>({key,canView:true,canEdit:role==='collaborator'}))})
function render(node:React.ReactNode,value:import('../src/components/permissions/workspace-permissions').TeamPermissions){return renderToStaticMarkup(<WorkspacePermissionsContext.Provider value={value}>{node}</WorkspacePermissionsContext.Provider>)}
const Content=require('../src/app/(app)/content/page').default
const Projects=require('../src/app/(app)/projects/page').default
const Discover=require('../src/app/(app)/discover/discover-list-page').default
const {ProjectWorkflowPanel}=require('../src/components/projects/project-workflow-panel')

test('unknown, failed, disabled, viewer and missing module grants fail closed',()=>{
 for(const value of [null,{},team('viewer'),team('none'),{...team('collaborator'),status:'disabled'},{...team('collaborator'),modules:[]}])for(const key of keys)assert.equal(mayEdit(value,key),false)
 for(const key of keys){assert.equal(mayEdit(team('owner'),key),true);assert.equal(mayEdit(team('collaborator'),key),true)}
 assert.equal(mayEdit({...team('viewer'),modules:keys.map(key=>({key,canView:true,canEdit:true}))},'content'),false)
 assert.equal(mayEdit({...team('collaborator'),modules:[{key:'content',canView:false,canEdit:true}]},'content'),false)
})
test('cross-module action requires both grants; schedule and status remain readable without controls',()=>{
 const single={...team('collaborator'),modules:[{key:'content',canView:true,canEdit:true}]}
 assert.equal(render(<EditOnly module={['content','projects']}><button>建立项目</button></EditOnly>,single),'')
 const html=render(<><ReadableAction module="projects" onClick={()=>{}}>已排期节点</ReadableAction><EditableSelect module="discover" value="待推进"><option>待推进</option></EditableSelect></>,team('viewer'))
 assert.match(html,/已排期节点/);assert.match(html,/待推进/);assert.doesNotMatch(html,/<button|<select/)
})
test('real content page hides write actions but preserves search, filters and detail for viewer/loading',()=>{
 for(const role of [null,team('viewer')]){const h=render(<Content/>,role);assert.match(h,/可读稿件/);assert.match(h,/查看详情/);assert.match(h,/搜索/);for(const t of ['批量上传剧本','新建内容','开始审核','移入历史归档','删除可读稿件'])assert.ok(!(h.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)||[]).join('').includes(t),t)}
 for(const role of ['owner','collaborator']){const h=render(<Content/>,team(role));for(const t of ['批量上传剧本','新建内容','开始审核','移入历史归档','删除可读稿件'])assert.ok(h.includes(t),role+t)}
})
test('real projects page hides new/import/edit/archive/delete but preserves schedule navigation',()=>{
 const h=render(<Projects/>,team('viewer'));assert.match(h,/可读项目/);assert.match(h,/部门排期/);assert.match(h,/时间轴/);for(const t of ['新建项目','新增节点','导入排期','编辑项目','归档项目','删除项目'])assert.ok(!h.includes(t),t)
 const edit=render(<Projects/>,team('collaborator'));for(const t of ['新建项目','新增节点','导入排期','编辑项目','归档项目'])assert.ok(edit.includes(t),t)
})
test('real idea rows hide import/edit/delete/status controls; editors retain shared work but not private meeting/research actions',()=>{
 const view=render(<Discover/>,team('viewer'));for(const t of ['可读选题','原有梗概','待推进','依据与验证'])assert.ok(view.includes(t),t);for(const t of ['上传选题库','记录选题','编辑可读选题','删除可读选题','<select'])assert.ok(!view.includes(t),t)
 const edit=render(<Discover/>,team('collaborator'));for(const t of ['上传选题库','记录选题','编辑可读选题','删除可读选题','<select'])assert.ok(edit.includes(t),t);assert.ok(!edit.includes('>选题会<'))
})
test('project details retain stage and contract text with no interactive mutation controls for viewer',()=>{
 const props={project,files:[{id:'contract',category:'剧本采购合同',status:'active',contract_info:{party_a:'现有甲方',reviewed:false},title:'原合同'}],nodes:[],meetings:[],onUpdateFile:noop,onExtractContract:noop,onMilestone:noop,onStageChange:noop}
 const view=render(<ProjectWorkflowPanel {...props}/>,team('viewer'));for(const t of ['剧本开发','现有甲方','制作交接'])assert.ok(view.includes(t),t);for(const t of ['<input','<textarea','记录或上传资料','提取合同字段','人工确认</button>','点击设为当前阶段'])assert.ok(!view.includes(t),t)
 const edit=render(<ProjectWorkflowPanel {...props}/>,team('collaborator'));assert.match(edit,/记录或上传资料/);assert.match(edit,/提取合同字段/);assert.match(edit,/<input/)
})

test('real market page hides upload controls for viewer while retaining read-only view navigation',()=>{
 const Market=require('../src/app/(app)/market-data/page').default
 const view=render(<Market/>,team('viewer'))
 for(const t of ['市场数据看板','榜单与趋势','监测结论'])assert.ok(view.includes(t),t)
 assert.ok(!view.includes('采集 / 上传数据'))
 const edit=render(<Market/>,team('collaborator'));assert.ok(edit.includes('采集 / 上传数据'))
})
