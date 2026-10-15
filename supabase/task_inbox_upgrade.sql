-- AI 任务收件箱（第一期）
-- 可在 Supabase Dashboard → SQL Editor 中完整执行一次。
-- 只扩展既有 todos 表，不会删除任何历史任务。

alter table public.todos
  add column if not exists status text not null default 'todo',
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists category text,
  add column if not exists next_action text,
  add column if not exists waiting_for text,
  add column if not exists dependency text,
  add column if not exists ai_score numeric,
  add column if not exists ai_reason text,
  add column if not exists source text not null default 'manual',
  add column if not exists manual_override boolean not null default false,
  add column if not exists follow_up_date date;

-- 将旧的完成标记同步为新状态；其余旧任务全部保留为待处理。
update public.todos
set status = case when completed then 'completed' else 'todo' end
where status is null or status not in ('todo', 'in_progress', 'waiting', 'blocked', 'completed', 'cancelled');

alter table public.todos
  drop constraint if exists todos_status_check;
alter table public.todos
  add constraint todos_status_check
  check (status in ('todo', 'in_progress', 'waiting', 'blocked', 'completed', 'cancelled'));

create index if not exists idx_todos_user_status on public.todos(user_id, status);
create index if not exists idx_todos_user_due_date on public.todos(user_id, due_date);
create index if not exists idx_todos_project_id on public.todos(project_id);

create table if not exists public.task_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  raw_text text not null,
  parsed_result jsonb,
  status text not null default 'preview',
  created_at timestamp default now() not null,
  updated_at timestamp default now() not null,
  applied_at timestamp,
  constraint task_inbox_status_check check (status in ('preview', 'applied', 'failed', 'dismissed'))
);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  todo_id uuid references public.todos(id) on delete cascade,
  inbox_id uuid references public.task_inbox(id) on delete set null,
  event_type text not null,
  summary text not null,
  payload jsonb,
  created_at timestamp default now() not null
);

create index if not exists idx_task_inbox_user_created on public.task_inbox(user_id, created_at desc);
create index if not exists idx_task_events_todo_created on public.task_events(todo_id, created_at desc);

alter table public.task_inbox enable row level security;
alter table public.task_events enable row level security;

drop policy if exists "task_inbox_own" on public.task_inbox;
create policy "task_inbox_own" on public.task_inbox for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "task_events_own" on public.task_events;
create policy "task_events_own" on public.task_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
