-- AI 短剧 Content 模块：剧本、文件版本、审核结果与私有文件桶。
-- 在 Supabase SQL Editor 中人工执行；脚本可重复运行。

create table if not exists public.contents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  content_type text not null default 'submission'
    check (content_type in ('submission', 'development', 'benchmark', 'original')),
  status text not null default 'pending'
    check (status in ('pending', 'parsing', 'ready', 'reviewing', 'reviewed', 'developing', 'archived')),
  source text,
  market text,
  language text,
  genre text,
  logline text,
  priority integer not null default 0 check (priority between 0 and 2),
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_files (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes integer,
  version integer not null default 1,
  extracted_text text,
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'processing', 'ready', 'failed')),
  parse_error text,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (content_id, version)
);

create table if not exists public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  reviewer_type text not null default 'ai' check (reviewer_type in ('ai', 'human')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  score integer check (score between 0 and 100),
  result jsonb,
  model text,
  prompt_version text,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contents_user_status on public.contents(user_id, status);
create index if not exists idx_content_files_content on public.content_files(content_id, version desc);
create index if not exists idx_content_reviews_content on public.content_reviews(content_id, created_at desc);

alter table public.contents enable row level security;
alter table public.content_files enable row level security;
alter table public.content_reviews enable row level security;

drop policy if exists "contents_own_all" on public.contents;
create policy "contents_own_all" on public.contents for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "content_files_own_all" on public.content_files;
create policy "content_files_own_all" on public.content_files for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "content_reviews_own_all" on public.content_reviews;
create policy "content_reviews_own_all" on public.content_reviews for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-files',
  'content-files',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "content_files_storage_select" on storage.objects;
create policy "content_files_storage_select" on storage.objects for select to authenticated
  using (bucket_id = 'content-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "content_files_storage_insert" on storage.objects;
create policy "content_files_storage_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'content-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "content_files_storage_update" on storage.objects;
create policy "content_files_storage_update" on storage.objects for update to authenticated
  using (bucket_id = 'content-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'content-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "content_files_storage_delete" on storage.objects;
create policy "content_files_storage_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'content-files' and (storage.foldername(name))[1] = auth.uid()::text);
