create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  item_type text not null default 'AI短剧学习',
  category text,
  content text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_knowledge_items_user_type on public.knowledge_items(user_id, item_type, updated_at desc);
alter table public.knowledge_items enable row level security;
grant select, insert, update, delete on public.knowledge_items to authenticated;
drop policy if exists "knowledge_items_own_all" on public.knowledge_items;
create policy "knowledge_items_own_all" on public.knowledge_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
