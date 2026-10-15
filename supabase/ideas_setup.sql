create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  source text,
  market text,
  genre text,
  status text not null default '灵感',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ideas_user_status on public.ideas(user_id, status, updated_at desc);
alter table public.ideas enable row level security;
grant select, insert, update, delete on public.ideas to authenticated;
drop policy if exists "ideas_own_all" on public.ideas;
create policy "ideas_own_all" on public.ideas for all using (user_id = auth.uid()) with check (user_id = auth.uid());
