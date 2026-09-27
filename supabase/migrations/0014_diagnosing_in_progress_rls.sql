-- Haven shared backend — assigned job → diagnosing or in_progress
-- Purpose: Allow assigned jobs to transition to 'diagnosing' or 'in_progress' under RLS.
-- Notes:
-- - Idempotent: drop policy if exists, then recreate it.
-- - Narrow: each policy permits only its own target status and requires pro_id is not null.
-- - Does not weaken claim / cancel / materials / decline / arrived / complete policies.
-- - SELECT visibility for 'diagnosing' and 'in_progress' already exists in 0007; unchanged here.
-- - Predecessor guard is 0015_tighten_diagnosing_in_progress_from_status.sql (applied
--   after this file). Re-applying this file restores the permissive USING only.
--   It does not drop the 0015 restrictive policy.

-- Ensure RLS is enabled (safe if already enabled)
alter table public.jobs enable row level security;

-- Update policy: assigned → diagnosing
drop policy if exists jobs_update_assigned_to_diagnosing on public.jobs;
create policy jobs_update_assigned_to_diagnosing
  on public.jobs
  for update
  to anon, authenticated
  using (
    pro_id is not null
  )
  with check (
    status = 'diagnosing'
  );

-- Update policy: assigned → in_progress
drop policy if exists jobs_update_assigned_to_in_progress on public.jobs;
create policy jobs_update_assigned_to_in_progress
  on public.jobs
  for update
  to anon, authenticated
  using (
    pro_id is not null
  )
  with check (
    status = 'in_progress'
  );
