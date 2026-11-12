"use client"
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {Button} from '@/components/ui/button'
import {ValidationEditor} from '@/components/market/idea-reviews'
import {MonthlyReviewDetails} from '@/components/market/monthly-review'
import {useValidationTasks,type ValidationTaskStore} from '@/hooks/use-validation-tasks'
import {VALIDATION_BUCKET_LABELS,validationBucket,type ValidationBucket,type ValidationTask} from '@/lib/market/validation-tasks'

const filters=[['pending','待跟进'],['overdue','已逾期'],['today','今日到期'],['week','未来7天'],['undated','未设日期'],['completed','已完成'],['all','全部']] as const
type Filter=typeof filters[number][0]
function matches(task:ValidationTask,filter:Filter){return filter==='all'||(filter==='pending'?task.action.status!=='已完成':validationBucket(task.action)===filter)}
function Deadline({task}:{task:ValidationTask}){const bucket=validationBucket(task.action);return <span className={`rounded-full px-2 py-1 text-[11px] ${bucket==='overdue'?'bg-amber-100 text-amber-900':'bg-[#e7efdf] text-[#24513e]'}`}>{VALIDATION_BUCKET_LABELS[bucket]}{task.action.dueDate&&` · ${task.action.dueDate}`}</span>}

export function ValidationTasksPanel(){
 const store=useValidationTasks(),[filter,setFilter]=useState<Filter>('pending'),[editing,setEditing]=useState(''),[message,setMessage]=useState(''),[target,setTarget]=useState('')
 useEffect(()=>{
  const read=()=>{const hash=window.location.hash.slice(1);if(hash.startsWith('validation-')&&hash!=='validation-tasks'){setTarget(hash);setFilter('all')}}
  read();window.addEventListener('hashchange',read);return ()=>window.removeEventListener('hashchange',read)
 },[])
 useEffect(()=>{if(target&&!store.loading)document.getElementById(target)?.scrollIntoView({block:'center'})},[target,store.loading])
 if(store.unavailable)return null
 const visible=store.tasks.filter(t=>matches(t,filter))
 return <section id="validation-tasks" aria-label="选题验证任务" className="scroll-mt-20 overflow-hidden rounded-2xl border border-[#b8cfa8] bg-[#fafcf5]">
  <div className="space-y-2 border-b border-[#dce7cf] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold text-[#173f31]">选题验证任务 <span className="text-sm font-normal">· {store.tasks.filter(t=>t.action.status!=='已完成').length} 项待跟进</span></h2><Button size="sm" variant="outline" onClick={()=>void store.load()}>刷新验证任务</Button></div><p className="text-xs leading-5 text-muted-foreground">来自已关联选题的月度建议。截止日期、验证结果与选题同步；完成后可供后续月度研判复核。解除选题关联后停止提醒。</p>
   <div className="flex flex-wrap gap-1.5" aria-label="验证任务筛选">{filters.map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)} className={`rounded-full px-3 py-1.5 text-xs ${filter===key?'bg-[#173f31] text-[#d4f875]':'border border-[#d3dfc7] bg-white text-[#355a46]'}`}>{label} {store.tasks.filter(t=>matches(t,key)).length}</button>)}</div></div>
  {store.error&&<p role="alert" className="p-4 text-sm text-red-700">{store.error}</p>}{store.loading&&<p role="status" className="p-4 text-sm">正在读取验证任务…</p>}{message&&<p role="status" className="px-4 pt-3 text-xs text-[#24513e]">{message}</p>}
  {!store.loading&&!store.error&&!visible.length&&<p className="p-4 text-sm text-muted-foreground">{store.tasks.length?'此范围没有验证任务。':'还没有已关联选题的验证建议。在市场研判中关联已有选题后，会自动显示在这里。'}</p>}
  <div className="divide-y divide-[#dce7cf]">{visible.map(task=><article id={task.id} key={task.id} aria-label={`验证任务：${task.action.title}`} className={`scroll-mt-24 space-y-2 p-4 ${target===task.id?'bg-[#eff6e5]':''}`}>
   <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold text-[#173f31]">{task.action.title}</h3><p className="mt-1 break-words text-xs text-muted-foreground">{task.ideaTitle}</p></div><div className="flex flex-wrap gap-1.5"><span className="py-1 text-[11px] text-[#315b43]">{task.action.status}</span><Deadline task={task}/></div></div>
   <p className="text-[11px] text-muted-foreground">来源：{task.record.payload.review.payload.period} 月度研判 · {task.record.payload.review.payload.genre}</p>
   {editing===task.id?<ValidationEditor record={task.record} action={task.action} onCancel={()=>setEditing('')} onSaved={record=>{store.replace(record);setEditing('');setMessage('验证进度已保存，选题与首页提醒同步更新。')}}/>:<>
    <p className="whitespace-pre-wrap break-words text-xs leading-6">{task.action.description}</p>
    {task.action.result&&<p className="whitespace-pre-wrap break-words rounded-lg bg-white p-2 text-xs leading-6"><strong>实际结果：</strong>{task.action.result}</p>}
    {task.action.status==='已完成'&&<p className="whitespace-pre-wrap break-words text-xs leading-6">建议效果：{task.action.outcome||'未评估'}{task.action.outcomeNote&&` · ${task.action.outcomeNote}`}</p>}
    {store.canEdit?<Button size="sm" variant="outline" disabled={!!editing} onClick={()=>{setEditing(task.id);setMessage('')}}>更新截止日期与验证结果</Button>:<p className="text-xs text-muted-foreground">当前为只读；编辑需要选题编辑权限。</p>}
   </>}
   <details className="text-xs leading-6"><summary className="cursor-pointer font-medium text-[#315f4a]">查看原建议与依据</summary><p className="my-2 whitespace-pre-wrap break-words">用于此选题：{task.record.payload.reason}</p><p className="text-muted-foreground">保留关联时的依据版本；最新来源请回市场数据看板核对。</p><MonthlyReviewDetails record={task.record.payload.review}/><Link href="/market-data" className="font-semibold text-[#24513e] underline">进入市场数据看板</Link></details>
  </article>)}</div>
 </section>
}

export function ValidationReminder({store}:{store:ValidationTaskStore}){
 if(store.unavailable)return null
 const pending=store.tasks.filter(t=>t.action.status!=='已完成')
 const groups:ValidationBucket[]=['overdue','today','week','undated']
 return <section aria-label="选题验证提醒" className="rounded-2xl border border-[#b8cfa8] bg-[#f7faf1] px-4 py-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-[#173f31]">选题验证提醒 <span className="font-normal">· {pending.length} 项待跟进</span></h2><Link href="/todos#validation-tasks" className="text-xs font-semibold text-[#24513e]">查看全部验证任务 →</Link></div>
  {store.loading?<p role="status" className="mt-2 text-xs">正在读取验证提醒…</p>:store.error?<div className="mt-2 flex flex-wrap gap-2 text-xs"><p role="alert" className="text-red-700">{store.error}</p><button onClick={()=>void store.load()} className="underline">重新读取验证提醒</button></div>:<>
   <div className="my-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#45604f]">{groups.map(group=><span key={group} className={group==='overdue'&&pending.some(t=>validationBucket(t.action)===group)?'font-semibold text-amber-800':''}>{VALIDATION_BUCKET_LABELS[group]} <strong>{pending.filter(t=>validationBucket(t.action)===group).length}</strong></span>)}</div>
   {pending.length?<div className="divide-y divide-[#dde7d2]">{pending.slice(0,3).map(task=><Link key={task.id} href={task.href} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:opacity-75"><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#173f31]">{task.action.title}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{task.ideaTitle}</span></span><Deadline task={task}/></Link>)}</div>:<p className="text-xs text-muted-foreground">暂无待跟进的验证建议。关联选题后在这里提醒。</p>}
  </>}
 </section>
}
