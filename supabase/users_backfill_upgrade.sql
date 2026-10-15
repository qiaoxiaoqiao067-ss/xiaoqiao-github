-- 为已存在但缺少业务档案的 Supabase Auth 用户补齐 public.users。
-- 新用户仍由 setup.sql 中的 on_auth_user_created 触发器自动同步。
insert into public.users (id, email, name, avatar_url)
select
  a.id,
  a.email,
  coalesce(a.raw_user_meta_data->>'name', split_part(a.email, '@', 1)),
  a.raw_user_meta_data->>'avatar_url'
from auth.users a
where not exists (
  select 1 from public.users u where u.id = a.id
);
