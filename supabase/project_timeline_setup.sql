-- 项目时间轴：一条节点对应一个项目、轨道与日期区间。
create table if not exists public.project_timeline_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  track text not null default '内容部' check (track in ('内容部', '制作部', '发行/运营', '其他')),
  title text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'delayed', 'paused')),
  content text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
alter table public.project_timeline_items add column if not exists content text;
create index if not exists idx_project_timeline_items_project_date on public.project_timeline_items(project_id, start_date);
alter table public.project_timeline_items enable row level security;
grant select, insert, update, delete on public.project_timeline_items to authenticated;
drop policy if exists "project_timeline_items_own_all" on public.project_timeline_items;
create policy "project_timeline_items_own_all" on public.project_timeline_items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
