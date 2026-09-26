-- Haven shared backend — CHUNK 3 RLS (complete terminal)
-- Purpose: Allow assigned jobs to transition to 'complete' under RLS.
-- Notes:
-- - Idempotent: drop policy if exists, then recreate it.
-- - Narrow: only permits status = 'complete' and requires pro_id is not null.
-- - Does not weaken claim / cancel / materials / decline policies.
-- - SELECT visibility for 'complete' already exists in 0007; unchanged here.

-- Ensure RLS is enabled (safe if already enabled)
alter table public.jobs enable row level security;

-- Update policy: assigned → complete
drop policy if exists jobs_update_assigned_to_complete_terminal on public.jobs;
create policy jobs_update_assigned_to_complete_terminal
  on public.jobs
  for update
  to anon, authenticated
  using (
    pro_id is not null
  )
  with check (
    status = 'complete'
  );

