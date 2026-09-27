-- Haven shared backend — assigned job → arrived
-- Purpose: Allow assigned jobs to transition to 'arrived' under RLS.
-- Notes:
-- - Idempotent: drop policy if exists, then recreate it.
-- - Narrow: only permits status = 'arrived' and requires pro_id is not null.
-- - Does not weaken claim / cancel / materials / decline / complete policies.
-- - SELECT visibility for 'arrived' already exists in 0007; unchanged here.

-- Ensure RLS is enabled (safe if already enabled)
alter table public.jobs enable row level security;

-- Update policy: assigned → arrived
drop policy if exists jobs_update_assigned_to_arrived on public.jobs;
create policy jobs_update_assigned_to_arrived
  on public.jobs
  for update
  to anon, authenticated
  using (
    pro_id is not null
  )
  with check (
    status = 'arrived'
  );
