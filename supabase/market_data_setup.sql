-- 市场数据看板：保存用户导入的 ADX / 榜单数据原始行，便于后续聚合与展示。
create table if not exists public.market_data_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_name text not null default 'ADX',
  period_label text,
  file_name text not null,
  row_count integer not null default 0,
  columns text[] not null default '{}',
  raw_rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_market_data_imports_user_created on public.market_data_imports(user_id, created_at desc);
alter table public.market_data_imports enable row level security;
grant select, insert, update, delete on public.market_data_imports to authenticated;
drop policy if exists "market_data_imports_own_all" on public.market_data_imports;
create policy "market_data_imports_own_all" on public.market_data_imports for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
