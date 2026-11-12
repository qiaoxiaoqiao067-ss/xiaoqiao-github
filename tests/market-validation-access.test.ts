/** Real route handlers + real workspace permission resolver; isolated auth and in-memory DB.
 * No production tokens, member impersonation, permission changes or business writes. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {NextRequest,NextResponse} from 'next/server'
import {validationTasks,validationCalendar,validationBucket} from '../src/lib/market/validation-tasks'
import type {IdeaReviewPayload,IdeaReviewRecord} from '../src/lib/market/idea-review'

const require=createRequire(import.meta.url)
const OWNER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222'
const IDEA='33333333-3333-4333-8333-333333333333',LINK='44444444-4444-4444-8444-444444444444'
const OTHER_IDEA='55555555-5555-4555-8555-555555555555',OTHER_LINK='66666666-6666-4666-8666-666666666666'
const VERSION='2026-11-12T00:00:00.000Z'
type Row=Record<string,unknown>
let signedIn:string|null=null
let tables:Record<string,Row[]>
let writes=0
let researchReads=0
let beforeUpdate:(()=>void)|undefined
class Query {
 filters:((row:Row)=>boolean)[]=[];updates:Row|undefined;single=false;start=0;end=Infinity
 constructor(private table:string){}
 select(){return this}
 eq(key:string,value:unknown){this.filters.push(row=>key==='raw_rows->0->>active'?String((row.raw_rows as IdeaReviewPayload[])[0].active)===value:row[key]===value);return this}
 in(key:string,values:unknown[]){this.filters.push(row=>values.includes(row[key]));return this}
 order(){return this}
 limit(n:number){this.end=this.start+n-1;return this}
 range(start:number,end:number){this.start=start;this.end=end;return this}
 maybeSingle(){this.single=true;return this}
 update(updates:Row){this.updates=updates;return this}
 async result(){
  if(this.table==='market_data_imports')researchReads++
  if(this.updates&&beforeUpdate){const fn=beforeUpdate;beforeUpdate=undefined;fn()}
  const rows=(tables[this.table]||[]).filter(row=>this.filters.every(f=>f(row))).slice(this.start,this.end+1)
  if(this.updates)for(const row of rows){writes++;Object.assign(row,structuredClone(this.updates))}
  return {data:structuredClone(this.single?rows[0]||null:rows),error:null}
 }
 then(resolve:(value:Awaited<ReturnType<Query['result']>>)=>unknown,reject?:(reason:unknown)=>unknown){return this.result().then(resolve,reject)}
}
function mock(path:string,exports:unknown){const id=require.resolve(path);require.cache[id]={id,filename:id,loaded:true,exports} as NodeModule}
mock('../src/lib/supabase/service',{serviceClient:{from:(table:string)=>new Query(table)}})
mock('../src/lib/supabase/require-user',{requireUser:async()=>signedIn?{user:{id:signedIn},response:null}:{user:null,response:NextResponse.json({error:'Unauthorized'},{status:401})}})
// Deliberately do not mock workspace-access: the real module reads seeded membership/permission rows.
const tasksRoute=require('../src/app/api/tasks/validation/route') as typeof import('../src/app/api/tasks/validation/route')
const reviewRoute=require('../src/app/api/market-data/idea-reviews/route') as typeof import('../src/app/api/market-data/idea-reviews/route')
function payload(idea=IDEA):IdeaReviewPayload {return {kind:'idea-review',ideaId:idea,ideaTitle:'验证选题',reason:'核验',active:true,actor:OWNER,review:{id:'77777777-7777-4777-8777-777777777777',created_at:VERSION,updated_at:VERSION,payload:{kind:'monthly-review',period:'2026年10月',comparison:'2026年9月',findingId:'f',genre:'黑帮',fingerprint:'f',sources:[],evidence:[],actor:OWNER,confirmedAt:VERSION,conclusion:'等待验证',topicBrief:'核验内容',testPlan:'测试',revisit:'复核'}},actions:[{id:'content',title:'内容核验',description:'检查实际开场',status:'待验证',dueDate:'',result:'',updatedAt:VERSION,completedAt:null}]}}
function reset(){
 signedIn=null;writes=0;researchReads=0;beforeUpdate=undefined
 const identities=[['editor','collaborator','active'],['viewer','viewer','active'],['disabled','collaborator','disabled'],['projectOnly','collaborator','active'],['noEdit','collaborator','active'],['noView','collaborator','active']]
 tables={workspaces:[{id:'workspace-a',owner_id:OWNER},{id:'workspace-b',owner_id:OTHER}],workspace_members:identities.map(([user_id,role,status])=>({workspace_id:'workspace-a',user_id,role,status})),workspace_module_permissions:identities.flatMap(([user_id])=>['market_data','discover'].map(module_key=>({workspace_id:'workspace-a',user_id,module_key,can_view:user_id!=='projectOnly'&&!(user_id==='noView'&&module_key==='market_data'),can_edit:user_id!=='noEdit'}))),ideas:[{id:IDEA,user_id:OWNER,title:'当前选题标题'},{id:OTHER_IDEA,user_id:OTHER,title:'他人选题'}],market_data_imports:[{id:LINK,user_id:OWNER,source_name:'市场研究:idea-review',created_at:VERSION,updated_at:VERSION,raw_rows:[payload()]},{id:OTHER_LINK,user_id:OTHER,source_name:'市场研究:idea-review',created_at:VERSION,updated_at:VERSION,raw_rows:[payload(OTHER_IDEA)]}]}
}
function request(overrides:Record<string,unknown>={}){return new NextRequest('http://localhost/api/market-data/idea-reviews',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'validation',id:LINK,ideaId:IDEA,updated_at:VERSION,action:{...payload().actions[0],status:'验证中',dueDate:'2026-11-12',result:'已看片，仍需对照样本'},...overrides})})}
async function readAs(user:string,scope='tasks'){signedIn=user;const r=await tasksRoute.GET(new NextRequest(`http://localhost/api/tasks/validation?scope=${scope}`));assert.equal(r.status,200);return await r.json() as {records:IdeaReviewRecord[];canEdit:boolean;unavailable?:boolean;homeVisible:boolean}}

test('unauthenticated task reads and writes are 401, with no data changes',async()=>{reset();assert.equal((await tasksRoute.GET(new NextRequest('http://localhost/api/tasks/validation'))).status,401);assert.equal((await reviewRoute.PATCH(request())).status,401);assert.equal(writes,0)})
test('collaborator reads owner records; a viewer reads the same records without edit capability',async()=>{reset();const editor=await readAs('editor'),viewer=await readAs('viewer');assert.equal(editor.canEdit,true);assert.equal(viewer.canEdit,false);assert.equal(editor.records.length,1);assert.deepEqual(editor.records,viewer.records);assert.equal(editor.records[0].currentIdeaTitle,'当前选题标题');assert.equal(editor.records[0].id,LINK)})
test('editor deadline and result save reaches shared tasks with same stable identity',async()=>{reset();signedIn='editor';const r=await reviewRoute.PATCH(request());assert.equal(r.status,200);const saved=(await r.json()).record;assert.equal(saved.payload.actor,'editor');const owner=await readAs(OWNER),viewer=await readAs('viewer');assert.deepEqual(owner.records,viewer.records);const t=validationTasks(owner.records,new Date(2026,10,12));assert.equal(t.length,1);assert.equal(t[0].action.result,'已看片，仍需对照样本');assert.equal(validationBucket(t[0].action,new Date(2026,10,12)),'today');assert.equal(validationCalendar(t)[0].date,'2026-11-12');assert.equal(writes,1)})
test('read-only, disabled, project-only, missing edit/view and uninvited identities cannot PATCH',async()=>{for(const id of ['viewer','disabled','projectOnly','noEdit','noView','unknown']){reset();signedIn=id;assert.equal((await reviewRoute.PATCH(request())).status,403,id);assert.equal(writes,0,id)}})
test('no market view and no active membership yields no validation data',async()=>{for(const id of ['disabled','projectOnly','noView','unknown']){reset();const data=await readAs(id);assert.equal(data.unavailable,true,id);assert.equal(data.canEdit,false,id);assert.deepEqual(data.records,[],id)}})
test('changing an ID or owner field cannot write into another workspace',async()=>{for(const patch of [{id:OTHER_LINK,ideaId:OTHER_IDEA},{id:OTHER_LINK},{ideaId:OTHER_IDEA},{id:OTHER_LINK,ideaId:OTHER_IDEA,ownerId:OTHER}]){reset();signedIn='editor';assert.equal((await reviewRoute.PATCH(request(patch))).status,404);assert.equal(writes,0)}})
test('permissions revoked between GET and PATCH are checked again on the server',async()=>{reset();await readAs('editor');tables.workspace_members.find(r=>r.user_id==='editor')!.status='disabled';signedIn='editor';assert.equal((await reviewRoute.PATCH(request())).status,403);assert.equal(writes,0);const d=await readAs('editor');assert.deepEqual(d.records,[])})
test('concurrent owner/member update returns conflict without overwriting newer result',async()=>{reset();signedIn='editor';assert.equal((await reviewRoute.PATCH(request())).status,200);signedIn=OWNER;const stale=await reviewRoute.PATCH(request({action:{...payload().actions[0],result:'过期编辑'}}));assert.equal(stale.status,409);assert.match((await stale.json()).error,/当前输入保留/);assert.equal(writes,1)})
test('database compare-and-swap catches a write arriving after version precheck',async()=>{reset();signedIn='editor';beforeUpdate=()=>{tables.market_data_imports[0].updated_at='2026-11-12T01:00:00.000Z'};assert.equal((await reviewRoute.PATCH(request())).status,409);assert.equal(writes,0)})
test('completed verification requires a real result and disappears from active calendar only after save',async()=>{reset();signedIn='editor';const a={...payload().actions[0],status:'已完成',dueDate:'2026-11-12'};assert.equal((await reviewRoute.PATCH(request({action:a}))).status,400);assert.equal(writes,0);assert.equal((await reviewRoute.PATCH(request({action:{...a,result:'样本不足'}}))).status,200);const d=await readAs(OWNER),t=validationTasks(d.records);assert.equal(validationBucket(t[0].action),'completed');assert.deepEqual(validationCalendar(t),[]);assert.equal(t[0].action.outcome,undefined)})
test('inactive links and removed ideas stop being exposed as verification tasks',async()=>{reset();(tables.market_data_imports[0].raw_rows as IdeaReviewPayload[])[0].active=false;assert.deepEqual((await readAs('editor')).records,[]);signedIn='editor';assert.equal((await reviewRoute.PATCH(request())).status,400);reset();tables.ideas=tables.ideas.filter(r=>r.id!==IDEA);assert.deepEqual((await readAs('editor')).records,[]);assert.equal((await reviewRoute.PATCH(request())).status,404);assert.equal(writes,0)})


test('homepage scope rejects every non-owner before reading any verification record',async()=>{for(const user of ['editor','viewer','disabled','projectOnly','noEdit','noView','unknown']){reset();const d=await readAs(user,'home');assert.equal(d.homeVisible,false,user);assert.equal(d.canEdit,false,user);assert.equal(d.unavailable,true,user);assert.deepEqual(d.records,[],user);assert.equal(researchReads,0,user)}})
test('owner home includes same editable tasks; other workspace owner cannot see these records',async()=>{reset();const home=await readAs(OWNER,'home'),tasks=await readAs(OWNER);assert.equal(home.homeVisible,true);assert.equal(home.canEdit,true);assert.deepEqual(home.records,tasks.records);const other=await readAs(OTHER,'home');assert.equal(other.records.length,1);assert.equal(other.records[0].id,OTHER_LINK)})
test('homepage denial leaves authorized collaborator task center access unchanged',async()=>{reset();const home=await readAs('editor','home');assert.deepEqual(home.records,[]);const tasks=await readAs('editor');assert.equal(tasks.canEdit,true);assert.equal(tasks.homeVisible,false);assert.equal(tasks.records[0].id,LINK);signedIn='editor';assert.equal((await reviewRoute.PATCH(request())).status,200)})
test('home requires authentication and refuses unknown scopes',async()=>{reset();assert.equal((await tasksRoute.GET(new NextRequest('http://localhost/api/tasks/validation?scope=home'))).status,401);signedIn=OWNER;assert.equal((await tasksRoute.GET(new NextRequest('http://localhost/api/tasks/validation?scope=anything'))).status,400);assert.equal(researchReads,0)})

test('home reminder renders nothing while owner status is unknown or denied, even with stale tasks',()=>{
 const {ValidationReminder}=require('../src/components/tasks/validation-tasks') as typeof import('../src/components/tasks/validation-tasks')
 const records:IdeaReviewRecord[]=[{id:LINK,created_at:VERSION,updated_at:VERSION,payload:payload()}]
 for(const loading of [true,false])for(const error of ['', '读取失败']){
  const store={tasks:validationTasks(records),loading,error,canEdit:true,unavailable:false,homeVisible:false,load:async()=>{},replace:()=>{}}
  assert.equal(ValidationReminder({store}),null)
 }
})
