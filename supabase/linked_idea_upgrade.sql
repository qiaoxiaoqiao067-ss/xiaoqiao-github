-- 会议与项目关联选题：从 [关联选题ID]/[来源选题ID] 魔法字符串迁移到真外键。
-- 在 Supabase SQL Editor 中执行；幂等，可重复运行。

-- 1. 增加外键字段（选题被删除时自动置空，不级联删除会议/项目）
alter table public.meetings
  add column if not exists linked_idea_id uuid references public.ideas(id) on delete set null;

alter table public.projects
  add column if not exists linked_idea_id uuid references public.ideas(id) on delete set null;

-- 2. 回填现有数据：从 transcript / notes 里的魔法字符串提取选题 ID。
--    仅迁移格式合法的 uuid，避免脏数据导致整条 update 失败。
update public.meetings
  set linked_idea_id = (regexp_match(transcript, '\[关联选题ID:([0-9a-fA-F-]{36})\]'))[1]::uuid
  where transcript ~ '\[关联选题ID:[0-9a-fA-F-]{36}\]'
    and linked_idea_id is null;

update public.projects
  set linked_idea_id = (regexp_match(notes, '\[来源选题ID:([0-9a-fA-F-]{36})\]'))[1]::uuid
  where notes ~ '\[来源选题ID:[0-9a-fA-F-]{36}\]'
    and linked_idea_id is null;

-- 3. 清理旧魔法字符串文本（外键已就位，transcript/notes 不再承载关联信息）
update public.meetings
  set transcript = regexp_replace(transcript, '\n?\[关联选题ID:[0-9a-fA-F-]{36}\]', '', 'g')
  where transcript ~ '\[关联选题ID:[0-9a-fA-F-]{36}\]';

update public.projects
  set notes = regexp_replace(notes, '\n?\[来源选题ID:[0-9a-fA-F-]{36}\]', '', 'g')
  where notes ~ '\[来源选题ID:[0-9a-fA-F-]{36}\]';

-- 4. 索引（可选，便于按选题反查会议/项目）
create index if not exists idx_meetings_linked_idea on public.meetings(linked_idea_id);
create index if not exists idx_projects_linked_idea on public.projects(linked_idea_id);
