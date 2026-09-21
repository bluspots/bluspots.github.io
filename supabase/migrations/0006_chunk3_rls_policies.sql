-- Haven shared backend — CHUNK 3 RLS policies
-- Purpose: prototype UPDATE policies enabling claim and terminal transitions
-- Notes:
-- - Idempotent via DROP POLICY IF EXISTS followed by CREATE POLICY
-- - Keep semantics identical to earlier draft; ownership/auth checks will replace these later
-- - Requires enum value 'materials_declined' to already exist (0004), and grants to be applied (0005)

-- Ensure RLS is enabled (already enabled in 0002; safe to re-run)
alter table public.jobs enable row level security;

-- 1) Claim policy — allow accepting a job:
--    Only when the CURRENT row is posted and unassigned,
--    and the NEW row becomes en_route with a pro assigned.
drop policy if exists jobs_update_claim_posted_to_en_route on public.jobs;
create policy jobs_update_claim_posted_to_en_route
  on public.jobs
  for update
  to anon, authenticated
  using (
    status = 'posted'
    and pro_id is null
  )
  with check (
    status = 'en_route'
    and pro_id is not null
  );

-- 2) Terminal writes for demo — allow setting assigned jobs to:
--    - inspection_completed (diagnosis decline path), or
--    - materials_declined (standard decline path).
--    Narrow: requires the row is already assigned; only permits those terminal statuses.
drop policy if exists jobs_update_assigned_to_decline_terminals on public.jobs;
create policy jobs_update_assigned_to_decline_terminals
  on public.jobs
  for update
  to anon, authenticated
  using (
    pro_id is not null
  )
  with check (
    status in ('inspection_completed','materials_declined')
  );

