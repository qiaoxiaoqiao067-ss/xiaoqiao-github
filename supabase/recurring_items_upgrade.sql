-- 固定事项升级：在已有 habits / habit_logs 上补充频率、星期、启停与排序。
alter table public.habits add column if not exists frequency text not null default 'daily';
alter table public.habits add column if not exists weekdays integer[] not null default '{}';
alter table public.habits add column if not exists active boolean not null default true;
alter table public.habits add column if not exists sort_order integer not null default 0;
alter table public.habits add column if not exists updated_at timestamp not null default now();

create unique index if not exists idx_habit_logs_unique_day on public.habit_logs(habit_id, date);
create index if not exists idx_habits_user_active_order on public.habits(user_id, active, sort_order);
