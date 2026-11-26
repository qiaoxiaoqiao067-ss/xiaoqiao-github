-- Keep removed tasks recoverable and preserve submitted work.
alter table public.learning_assignments
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists learning_assignments_active_idx
  on public.learning_assignments (workspace_id, learner_id, created_at desc)
  where archived_at is null;
