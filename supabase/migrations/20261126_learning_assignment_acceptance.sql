-- Record an explicit acknowledgement after each learner reads the task.
alter table public.learning_assignments
  add column if not exists accepted_at timestamptz;

-- Treat work submitted before this acknowledgement feature as already received.
update public.learning_assignments as assignment
set accepted_at = submitted.first_submitted_at
from (
  select assignment_id, min(submitted_at) as first_submitted_at
  from public.learning_submissions
  group by assignment_id
) as submitted
where assignment.id = submitted.assignment_id
  and assignment.accepted_at is null;
