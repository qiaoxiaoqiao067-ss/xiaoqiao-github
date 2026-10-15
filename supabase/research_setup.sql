-- 调研中心：问题、证据、结论与下一步行动。
create table if not exists public.research_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  research_type text not null default '市场趋势'
    check (research_type in ('市场趋势', '爆款对标', '题材机会', '竞品平台', '制作可行性', '其他')),
  status text not null default '待调研'
    check (status in ('待调研', '调研中', '待结论', '已完成', '暂缓')),
  question text,
  target_market text,
  source_urls text[] not null default '{}',
  evidence text,
  conclusion text,
  next_action text,
  due_date text,
  linked_idea_id uuid references public.ideas(id) on delete set null,
  linked_project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_items_user_status on public.research_items(user_id, status, updated_at desc);
alter table public.research_items enable row level security;
grant select, insert, update, delete on public.research_items to authenticated;
drop policy if exists "research_items_own_all" on public.research_items;
create policy "research_items_own_all" on public.research_items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
