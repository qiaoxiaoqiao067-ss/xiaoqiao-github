create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  meeting_type text not null default '选题会',
  meeting_date text,
  source_url text,
  transcript text,
  summary text,
  decisions text,
  next_actions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_meetings_user_date on public.meetings(user_id, meeting_date desc);
alter table public.meetings enable row level security;
grant select, insert, update, delete on public.meetings to authenticated;
drop policy if exists "meetings_own_all" on public.meetings;
create policy "meetings_own_all" on public.meetings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
