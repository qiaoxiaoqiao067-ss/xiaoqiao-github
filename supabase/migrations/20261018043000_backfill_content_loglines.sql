-- Backfill only empty historical loglines from an existing completed AI review.
-- Manually edited loglines are never overwritten.
with latest_hooks as (
  select distinct on (content_id)
    content_id,
    left(trim(result ->> 'one_line_hook'), 160) as hook
  from public.content_reviews
  where status = 'completed'
    and coalesce(trim(result ->> 'one_line_hook'), '') <> ''
  order by content_id, created_at desc
)
update public.contents as content
set logline = latest_hooks.hook,
    updated_at = content.updated_at
from latest_hooks
where content.id = latest_hooks.content_id
  and coalesce(trim(content.logline), '') = '';
