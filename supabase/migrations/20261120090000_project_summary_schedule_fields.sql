-- Keep the workbench project summary aligned with the Feishu project summary.
-- These are source fields, not values inferred from detailed timeline nodes.
alter table public.projects add column if not exists current_progress text;
alter table public.projects add column if not exists production_complete_date text;
alter table public.projects add column if not exists launch_date text;

