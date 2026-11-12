import type {IdeaReviewRecord, ValidationAction} from './idea-review'

export type ValidationTask = {id:string; href:string; record:IdeaReviewRecord; action:ValidationAction; ideaTitle:string}
export type ValidationBucket = 'overdue'|'today'|'week'|'later'|'undated'|'completed'
export const VALIDATION_BUCKET_LABELS:Record<ValidationBucket,string> = {overdue:'已逾期',today:'今日到期',week:'未来7天',later:'之后到期',undated:'日期待设置',completed:'已完成'}
export function localDay(date=new Date()) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
export function validationBucket(action:ValidationAction, now=new Date()):ValidationBucket {
 if(action.status==='已完成')return 'completed'
 if(!action.dueDate)return 'undated'
 const today=localDay(now), end=new Date(now);end.setDate(end.getDate()+7)
 if(action.dueDate<today)return 'overdue'
 if(action.dueDate===today)return 'today'
 return action.dueDate<=localDay(end)?'week':'later'
}
export function validationTasks(records:IdeaReviewRecord[],now=new Date()):ValidationTask[]{
 const latest=new Map<string,IdeaReviewRecord>()
 for(const record of records){const old=latest.get(record.id);if(!old||record.updated_at>old.updated_at)latest.set(record.id,record)}
 const tasks:ValidationTask[]=[]
 for(const record of latest.values()){
  if(!record.payload.active)continue
  const actions=new Map(record.payload.actions.map(action=>[action.id,action]))
  for(const action of actions.values()) {const id=`validation-${record.id}-${action.id}`;tasks.push({id,href:`/todos#${id}`,record,action,ideaTitle:record.currentIdeaTitle||record.payload.ideaTitle})}
 }
 const order:ValidationBucket[]=['overdue','today','week','undated','later','completed']
 return tasks.sort((a,b)=>order.indexOf(validationBucket(a.action,now))-order.indexOf(validationBucket(b.action,now))||(a.action.dueDate||'9999').localeCompare(b.action.dueDate||'9999')||a.id.localeCompare(b.id))
}
export function validationCalendar(tasks:ValidationTask[]){return tasks.filter(t=>t.action.status!=='已完成'&&t.action.dueDate).map(t=>({id:t.id,date:t.action.dueDate,title:t.action.title,detail:t.ideaTitle,type:'task' as const,href:t.href,time:'截止'}))}
