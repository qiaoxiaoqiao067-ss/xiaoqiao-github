import test from 'node:test'
import assert from 'node:assert/strict'
import {localDay,validationBucket,validationCalendar,validationTasks} from '../src/lib/market/validation-tasks'
import {updateValidation,type IdeaReviewRecord,type ValidationAction} from '../src/lib/market/idea-review'
const action=(dueDate='',status:ValidationAction['status']='待验证'):ValidationAction=>({id:'test',title:'核验开场',description:'对照两组素材',dueDate,status,result:'',completedAt:null,updatedAt:'2026-11-12'})
const record=():IdeaReviewRecord=>({id:'link1',updated_at:'2026-11-12',created_at:'2026-11-12',payload:{active:true,kind:'idea-review',ideaId:'idea1',ideaTitle:'旧标题',reason:'测试',actor:'owner',actions:[action()],review:{id:'r1',created_at:'2026-11-12',updated_at:'2026-11-12',payload:{kind:'monthly-review',period:'2026年11月',comparison:'2026年10月',findingId:'f1',genre:'黑帮',fingerprint:'f',sources:[],evidence:[],actor:'owner',confirmedAt:'2026-11-12',conclusion:'观察',topicBrief:'测试',testPlan:'测试',revisit:'观察'}}}})
test('local calendar dates, exact seven-day boundary and month/year rollover',()=>{
 const now=new Date(2026,10,30,0,5)
 assert.equal(localDay(now),'2026-11-30')
 for(const [date,bucket] of [['','undated'],['2026-11-29','overdue'],['2026-11-30','today'],['2026-12-01','week'],['2026-12-07','week'],['2026-12-08','later']])assert.equal(validationBucket(action(date),now),bucket)
 assert.equal(validationBucket(action('2027-01-06'),new Date(2026,11,30)),'week')
 assert.equal(validationBucket(action('2028-02-29'),new Date(2028,1,28)),'week')
 assert.equal(validationBucket(action('2026-01-01','已完成'),now),'completed')
})
test('same linked action yields one stable task without copying data; current month included',()=>{
 const r=record(),tasks=validationTasks([r,r])
 assert.equal(tasks.length,1);assert.equal(tasks[0].action,r.payload.actions[0]);assert.equal(tasks[0].href,'/todos#validation-link1-test')
 const newer={...r,updated_at:'2026-11-13',currentIdeaTitle:'新标题',payload:{...r.payload,actions:[action('2026-12-01')]}}
 const updated=validationTasks([newer,r]);assert.equal(updated.length,1);assert.equal(updated[0].id,tasks[0].id);assert.equal(updated[0].ideaTitle,'新标题');assert.equal(updated[0].action.dueDate,'2026-12-01')
})
test('unlink removes task and reminder; restoring retains identity, result and deadline',()=>{
 const r=record();r.payload.actions[0]={...action('2026-11-20'),result:'尚未获得足够样本'}
 const first=validationTasks([r])[0]
 assert.deepEqual(validationTasks([{...r,payload:{...r.payload,active:false}}]),[])
 assert.deepEqual(validationTasks([r])[0],first)
 const inactive={...r,updated_at:'2026-11-13',payload:{...r.payload,active:false}};assert.deepEqual(validationTasks([inactive,r]),[])
})
test('calendar only contains dated unfinished tasks and points to exact source task',()=>{
 const r=record();assert.deepEqual(validationCalendar(validationTasks([r])),[])
 r.payload.actions[0]=action('2026-11-12');const t=validationTasks([r]);assert.deepEqual(validationCalendar(t),[{id:t[0].id,date:'2026-11-12',title:'核验开场',detail:'旧标题',type:'task',href:t[0].href,time:'截止'}])
 r.payload.actions[0].status='已完成';assert.deepEqual(validationCalendar(validationTasks([r])),[])
})
test('actual result remains required and completed validation never invents effectiveness',()=>{
 const r=record();assert.throws(()=>updateValidation(r.payload,{...action(),'status':'已完成'},'owner','2026-11-12'))
 const payload=updateValidation(r.payload,{...action('2026-11-12','已完成'),result:'样本不足'},'owner','2026-11-12')
 const task=validationTasks([{...r,payload}])[0];assert.equal(validationBucket(task.action),'completed');assert.equal(task.action.outcome,undefined);assert.equal(task.action.result,'样本不足')
})
test('urgent tasks sort before undated and later work',()=>{
 const dates=['2026-12-25','','2026-11-19','2026-11-12','2026-11-11'];const rows=dates.map((date,index)=>{const r=record();return {...r,id:String(index),payload:{...r.payload,actions:[action(date)]}}})
 assert.deepEqual(validationTasks(rows,new Date(2026,10,12)).map(t=>validationBucket(t.action,new Date(2026,10,12))),['overdue','today','week','undated','later'])
})
