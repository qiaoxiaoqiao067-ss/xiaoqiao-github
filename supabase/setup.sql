-- ============================================================================
-- Personal Workbench — Supabase 初始化脚本
-- 用法：新建 Supabase 项目后，打开 Dashboard → SQL Editor → New query，
--       把整个文件粘贴进去，点 Run 即可。
-- 作用：重建全部 8 张表 + 外键 + 索引 + RLS 策略 + 用户档案自动同步触发器。
-- 说明：auth.users 由 Supabase 自动管理，这里不需要、也不要手动创建。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 建表
-- ----------------------------------------------------------------------------

create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text,
  avatar_url  text,
  created_at  timestamp default now() not null,
  updated_at  timestamp default now() not null
);

create table if not exists public.todos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id),
  title        text not null,
  description  text,
  completed    boolean default false not null,
  priority     integer default 0 not null,          -- 0=普通 1=高 2=紧急
  due_date     timestamp,
  tags         text[],
  created_at   timestamp default now() not null,
  updated_at   timestamp default now() not null,
  completed_at timestamp
);

create table if not exists public.daily_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id),
  date         text not null,                        -- YYYY-MM-DD
  content      text not null,
  summary      text,
  status       text not null default 'draft',        -- draft / final（代码需要此列）
  sent_to_lark boolean default false,
  created_at   timestamp default now() not null,
  updated_at   timestamp default now() not null
);

create table if not exists public.weekly_reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id),
  week_start text not null,                          -- YYYY-MM-DD
  week_end   text not null,                          -- YYYY-MM-DD
  content    text not null,
  summary    text,
  ppt_url    text,
  exported   boolean default false,
  created_at timestamp default now() not null,
  updated_at timestamp default now() not null
);

create table if not exists public.documents (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id),
  title              text not null,
  content            text,
  file_url           text,
  file_type          text,                           -- docx / pdf / md / txt
  category           text,                           -- 技术文档 / 会议纪要 / 日报 / 周报 / 其他
  tags               text[],
  standardized_title text,
  created_at         timestamp default now() not null,
  updated_at         timestamp default now() not null
);

create table if not exists public.ai_learnings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id),
  title      text not null,
  content    text not null,
  source     text,
  source_url text,
  category   text not null,                          -- 市场动态 / 提示词工程 / Skill开发 / Agent设计 / AI工具 / 模型原理
  difficulty integer default 1,                      -- 1=入门 2=进阶 3=实战
  date       text not null,                          -- YYYY-MM-DD
  notes      text,
  learned    boolean default false,
  created_at timestamp default now() not null
);

create table if not exists public.habits (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id),
  name              text not null,                   -- 如「写日报」「写TODO」「学习AI要点」
  frequency         text not null default 'daily',   -- daily / weekly
  weekdays          integer[] not null default '{}', -- 0=周日 ... 6=周六
  active            boolean not null default true,
  sort_order        integer not null default 0,
  streak            integer default 0,
  longest_streak    integer default 0,
  last_checked_date text,                            -- YYYY-MM-DD
  created_at        timestamp default now() not null,
  updated_at        timestamp default now() not null
);

create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  habit_id   uuid not null references public.habits(id),
  date       text not null,                          -- YYYY-MM-DD
  completed  boolean default false,
  created_at timestamp default now() not null
);

-- ----------------------------------------------------------------------------
-- 2. 常用查询索引
-- ----------------------------------------------------------------------------

create index if not exists idx_todos_user_id          on public.todos(user_id);
create index if not exists idx_daily_reports_user_date on public.daily_reports(user_id, date);
create index if not exists idx_weekly_reports_user     on public.weekly_reports(user_id);
create index if not exists idx_documents_user          on public.documents(user_id);
create index if not exists idx_ai_learnings_user_date  on public.ai_learnings(user_id, date);
create index if not exists idx_habits_user             on public.habits(user_id);
create index if not exists idx_habit_logs_habit_date   on public.habit_logs(habit_id, date);
create unique index if not exists idx_habit_logs_unique_day on public.habit_logs(habit_id, date);
create index if not exists idx_habits_user_active_order on public.habits(user_id, active, sort_order);

-- ----------------------------------------------------------------------------
-- 3. 用户档案自动同步触发器
--    注册（auth.users 插入）时自动在 public.users 建一行，id 保持一致，
--    这样其它表的 user_id = auth.uid() 外键才能成立。
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- （可选）如果 auth.users 里已经有用户，回填一次
insert into public.users (id, email, name, avatar_url)
select
  id,
  email,
  raw_user_meta_data ->> 'name',
  raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. RLS（行级安全）
--    - todos 由浏览器用 anon key 直接读写，必须有策略，否则登录后看不到/写不了。
--    - 其它表走服务端 service_role key（绕过 RLS），策略是防御性加固。
-- ----------------------------------------------------------------------------

-- todos（浏览器直连，必需）
alter table public.todos enable row level security;
drop policy if exists "todos_select_own" on public.todos;
create policy "todos_select_own" on public.todos for select using (user_id = auth.uid());
drop policy if exists "todos_insert_own" on public.todos;
create policy "todos_insert_own" on public.todos for insert with check (user_id = auth.uid());
drop policy if exists "todos_update_own" on public.todos;
create policy "todos_update_own" on public.todos for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "todos_delete_own" on public.todos;
create policy "todos_delete_own" on public.todos for delete using (user_id = auth.uid());

-- users
alter table public.users enable row level security;
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users for select using (id = auth.uid());
drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users for update using (id = auth.uid()) with check (id = auth.uid());

-- daily_reports
alter table public.daily_reports enable row level security;
drop policy if exists "daily_reports_select_own" on public.daily_reports;
create policy "daily_reports_select_own" on public.daily_reports for select using (user_id = auth.uid());
drop policy if exists "daily_reports_insert_own" on public.daily_reports;
create policy "daily_reports_insert_own" on public.daily_reports for insert with check (user_id = auth.uid());
drop policy if exists "daily_reports_update_own" on public.daily_reports;
create policy "daily_reports_update_own" on public.daily_reports for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "daily_reports_delete_own" on public.daily_reports;
create policy "daily_reports_delete_own" on public.daily_reports for delete using (user_id = auth.uid());

-- weekly_reports
alter table public.weekly_reports enable row level security;
drop policy if exists "weekly_reports_select_own" on public.weekly_reports;
create policy "weekly_reports_select_own" on public.weekly_reports for select using (user_id = auth.uid());
drop policy if exists "weekly_reports_insert_own" on public.weekly_reports;
create policy "weekly_reports_insert_own" on public.weekly_reports for insert with check (user_id = auth.uid());
drop policy if exists "weekly_reports_update_own" on public.weekly_reports;
create policy "weekly_reports_update_own" on public.weekly_reports for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "weekly_reports_delete_own" on public.weekly_reports;
create policy "weekly_reports_delete_own" on public.weekly_reports for delete using (user_id = auth.uid());

-- documents
alter table public.documents enable row level security;
drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own" on public.documents for select using (user_id = auth.uid());
drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own" on public.documents for insert with check (user_id = auth.uid());
drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own" on public.documents for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own" on public.documents for delete using (user_id = auth.uid());

-- ai_learnings
alter table public.ai_learnings enable row level security;
drop policy if exists "ai_learnings_select_own" on public.ai_learnings;
create policy "ai_learnings_select_own" on public.ai_learnings for select using (user_id = auth.uid());
drop policy if exists "ai_learnings_insert_own" on public.ai_learnings;
create policy "ai_learnings_insert_own" on public.ai_learnings for insert with check (user_id = auth.uid());
drop policy if exists "ai_learnings_update_own" on public.ai_learnings;
create policy "ai_learnings_update_own" on public.ai_learnings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ai_learnings_delete_own" on public.ai_learnings;
create policy "ai_learnings_delete_own" on public.ai_learnings for delete using (user_id = auth.uid());

-- habits
alter table public.habits enable row level security;
drop policy if exists "habits_select_own" on public.habits;
create policy "habits_select_own" on public.habits for select using (user_id = auth.uid());
drop policy if exists "habits_insert_own" on public.habits;
create policy "habits_insert_own" on public.habits for insert with check (user_id = auth.uid());
drop policy if exists "habits_update_own" on public.habits;
create policy "habits_update_own" on public.habits for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "habits_delete_own" on public.habits;
create policy "habits_delete_own" on public.habits for delete using (user_id = auth.uid());

-- habit_logs（无 user_id，通过 habits 间接校验）
alter table public.habit_logs enable row level security;
drop policy if exists "habit_logs_select_own" on public.habit_logs;
create policy "habit_logs_select_own" on public.habit_logs for select
  using (exists (select 1 from public.habits h where h.id = habit_logs.habit_id and h.user_id = auth.uid()));
drop policy if exists "habit_logs_insert_own" on public.habit_logs;
create policy "habit_logs_insert_own" on public.habit_logs for insert with check
  (exists (select 1 from public.habits h where h.id = habit_logs.habit_id and h.user_id = auth.uid()));
drop policy if exists "habit_logs_update_own" on public.habit_logs;
create policy "habit_logs_update_own" on public.habit_logs for update
  using (exists (select 1 from public.habits h where h.id = habit_logs.habit_id and h.user_id = auth.uid()));
drop policy if exists "habit_logs_delete_own" on public.habit_logs;
create policy "habit_logs_delete_own" on public.habit_logs for delete
  using (exists (select 1 from public.habits h where h.id = habit_logs.habit_id and h.user_id = auth.uid()));

-- ============================================================================
-- 完成。核对方式：运行下面这句应返回 8 行（8 张表）。
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name in
--     ('users','todos','daily_reports','weekly_reports','documents','ai_learnings','habits','habit_logs');
-- ============================================================================
