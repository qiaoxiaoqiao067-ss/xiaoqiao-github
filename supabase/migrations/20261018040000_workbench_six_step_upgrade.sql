-- Incremental, non-destructive upgrade for the six-step workbench refinement.
alter table public.contents add column if not exists archived_at timestamptz;
alter table public.projects add column if not exists project_no integer;

with ranked as (
  select id, row_number() over (partition by user_id order by created_at, id)::integer as number
  from public.projects
)
update public.projects p set project_no = ranked.number from ranked
where p.id = ranked.id and p.project_no is null;

create unique index if not exists idx_projects_user_project_no
  on public.projects(user_id, project_no) where project_no is not null;

alter table public.meetings add column if not exists meeting_file_name text;
alter table public.meetings add column if not exists meeting_storage_path text;
alter table public.meetings add column if not exists meeting_parse_status text;
alter table public.meetings add column if not exists meeting_uploaded_at timestamptz;

alter table public.knowledge_items add column if not exists primary_genre text;
alter table public.knowledge_items add column if not exists genre_tags text[];
alter table public.knowledge_items add column if not exists logline text;
alter table public.knowledge_items add column if not exists relationships text;
alter table public.knowledge_items add column if not exists attachment_name text;
alter table public.knowledge_items add column if not exists attachment_path text;
