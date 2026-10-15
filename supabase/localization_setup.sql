create table if not exists public.localization_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  content_id uuid references public.contents(id) on delete set null,
  source_file_id uuid references public.content_files(id) on delete set null,
  title text not null,
  source_language text not null default '中文',
  target_language text not null default '英语',
  target_market text,
  mode text not null default 'standard' check (mode in ('quick','standard','refined')),
  status text not null default 'pending' check (status in ('pending','translating','draft_ready','reviewing','awaiting_confirmation','delivered','archived','failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  glossary text,
  style_notes text,
  output_options text[] not null default '{}',
  due_date text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  content_id uuid references public.contents(id) on delete set null,
  content_file_id uuid references public.content_files(id) on delete set null,
  category text not null default '其他附件',
  title text not null,
  version integer not null default 1,
  status text not null default 'active' check (status in ('active','final','delivered','archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_localization_jobs_user_status on public.localization_jobs(user_id, status, updated_at desc);
create index if not exists idx_project_files_project on public.project_files(user_id, project_id, created_at desc);

alter table public.localization_jobs enable row level security;
alter table public.project_files enable row level security;
grant select, insert, update, delete on public.localization_jobs to authenticated;
grant select, insert, update, delete on public.project_files to authenticated;
drop policy if exists "localization_jobs_own_all" on public.localization_jobs;
create policy "localization_jobs_own_all" on public.localization_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "project_files_own_all" on public.project_files;
create policy "project_files_own_all" on public.project_files for all using (user_id = auth.uid()) with check (user_id = auth.uid());
