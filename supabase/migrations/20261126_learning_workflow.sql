-- Learning assignments and submissions are accessed only through server routes.
create table if not exists public.learning_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null,
  brief text not null,
  cadence text not null check (cadence in ('daily','weekly','extra')),
  due_date date,
  steps jsonb not null default '[]'::jsonb,
  status text not null default 'published' check (status in ('published','completed')),
  origin_submission_id uuid unique,
  created_at timestamptz not null default now()
);
create index if not exists learning_assignments_learner_idx on public.learning_assignments (workspace_id, learner_id, created_at desc);

create table if not exists public.learning_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  assignment_id uuid not null references public.learning_assignments(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  sources text not null,
  findings text not null,
  reasoning text not null,
  reflection text not null default '',
  review_status text not null default 'pending' check (review_status in ('pending','graded')),
  score jsonb,
  total_score integer check (total_score between 0 and 100),
  feedback text,
  next_plan jsonb,
  submitted_at timestamptz not null default now(),
  unique (assignment_id, learner_id)
);
create index if not exists learning_submissions_learner_idx on public.learning_submissions (workspace_id, learner_id, submitted_at desc);

alter table public.learning_assignments enable row level security;
alter table public.learning_submissions enable row level security;
revoke all on public.learning_assignments from anon, authenticated;
revoke all on public.learning_submissions from anon, authenticated;
grant select, insert, update, delete on table public.learning_assignments, public.learning_submissions to service_role;
