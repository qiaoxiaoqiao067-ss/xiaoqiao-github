create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  content_id uuid references public.contents(id) on delete set null,
  title text not null,
  market text,
  genre text,
  stage text not null default '立项选题',
  progress integer not null default 0 check (progress between 0 and 100),
  status text not null default 'active' check (status in ('active', 'deferred', 'paused', 'completed', 'archived')),
  next_action text,
  due_date text,
  risk text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_user_status on public.projects(user_id, status, updated_at desc);
alter table public.projects enable row level security;
grant select, insert, update, delete on public.projects to authenticated;
drop policy if exists "projects_own_all" on public.projects;
create policy "projects_own_all" on public.projects for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
