-- 团队访问最小版本：运行前请在 Supabase SQL Editor 备份一次数据库。
-- 先建立团队空间与成员权限，不改变现有个人数据归属。

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default '云霞内容台团队',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspaces_one_owner on public.workspaces(owner_id);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'collaborator' check (role in ('owner','collaborator','viewer')),
  status text not null default 'active' check (status in ('invited','active','disabled')),
  invited_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_module_permissions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null check (module_key in ('content','projects','market_data','discover')),
  can_view boolean not null default true,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, module_key)
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id, status);
create index if not exists workspace_permissions_user_idx on public.workspace_module_permissions(user_id, module_key);

-- 为当前已有账号创建个人团队空间；重复运行安全。
insert into public.workspaces(owner_id)
select id from auth.users
on conflict (owner_id) do nothing;

insert into public.workspace_members(workspace_id, user_id, role, status, invited_email)
select w.id, w.owner_id, 'owner', 'active', u.email
from public.workspaces w join auth.users u on u.id = w.owner_id
on conflict (workspace_id, user_id) do update set role='owner', status='active';

insert into public.workspace_module_permissions(workspace_id, user_id, module_key, can_view, can_edit)
select w.id, w.owner_id, module_key, true, true
from public.workspaces w
cross join (values ('content'),('projects'),('market_data'),('discover')) as modules(module_key)
on conflict (workspace_id, user_id, module_key) do update set can_view=true, can_edit=true;

create or replace function public.is_workspace_owner(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.workspaces where id = target_workspace and owner_id = auth.uid());
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_module_permissions enable row level security;

drop policy if exists workspace_owner_manage on public.workspaces;
create policy workspace_owner_manage on public.workspaces for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists workspace_member_read on public.workspace_members;
create policy workspace_member_read on public.workspace_members for select using (user_id = auth.uid() or public.is_workspace_owner(workspace_id));
drop policy if exists workspace_owner_write_members on public.workspace_members;
create policy workspace_owner_write_members on public.workspace_members for all using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));
drop policy if exists workspace_member_read_permissions on public.workspace_module_permissions;
create policy workspace_member_read_permissions on public.workspace_module_permissions for select using (user_id = auth.uid() or public.is_workspace_owner(workspace_id));
drop policy if exists workspace_owner_write_permissions on public.workspace_module_permissions;
create policy workspace_owner_write_permissions on public.workspace_module_permissions for all using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));

-- Supabase 新版 secret key 仍需显式拥有新建表的表级权限。
grant usage on schema public to service_role;
grant select, insert, update, delete on public.workspaces to service_role;
grant select, insert, update, delete on public.workspace_members to service_role;
grant select, insert, update, delete on public.workspace_module_permissions to service_role;
