-- Haven shared backend — CHUNK 4: allow customer cancel on posted jobs
-- Purpose: narrow UPDATE policy enabling posted → cancelled when unclaimed
-- Notes:
-- - Idempotent via DROP POLICY IF EXISTS followed by CREATE POLICY
-- - Does not weaken one_active_job_per_pro or claim policies
-- - WITH CHECK allows setting cancelled_at in the same update

-- Ensure RLS is enabled (safe to re-run)
alter table public.jobs enable row level security;

-- Posted → Cancelled (unassigned only)
drop policy if exists jobs_update_posted_to_cancelled on public.jobs;
create policy jobs_update_posted_to_cancelled
  on public.jobs
  for update
  to anon, authenticated
  using (
    status = 'posted'
    and pro_id is null
  )
  with check (
    status = 'cancelled'
    and pro_id is null
  );

