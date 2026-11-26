-- 在已有团队权限数据库中运行一次，加入独立的学员学习模块。
-- 此迁移只扩展可授权模块，不给现有非所有者成员自动授权。
alter table public.workspace_module_permissions
  drop constraint if exists workspace_module_permissions_module_key_check;

alter table public.workspace_module_permissions
  add constraint workspace_module_permissions_module_key_check
  check (module_key in ('content','projects','market_data','discover','learning'));

insert into public.workspace_module_permissions(workspace_id, user_id, module_key, can_view, can_edit)
select w.id, w.owner_id, 'learning', true, true
from public.workspaces w
on conflict (workspace_id, user_id, module_key)
do update set can_view = true, can_edit = true;
