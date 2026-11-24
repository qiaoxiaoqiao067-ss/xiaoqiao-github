-- The project schedule now uses the six project stages as responsibility lanes.
-- Keep legacy track values valid so existing schedule rows continue to work.
alter table public.project_timeline_items
  drop constraint if exists project_timeline_items_track_check;

alter table public.project_timeline_items
  add constraint project_timeline_items_track_check check (
    track in (
      '内容部',
      '制作部',
      '发行/运营',
      '其他',
      '合同中',
      '剧本开发',
      '本地化',
      '制作准备（美术资产、围读）',
      'AI制作',
      '发行投流'
    )
  );
