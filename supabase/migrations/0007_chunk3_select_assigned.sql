-- CHUNK 3 — RLS SELECT for assigned/active/terminal jobs
-- Purpose: Ensure UPDATE transitions (e.g., posted → en_route) succeed under RLS by
--          allowing SELECT of non-posted rows. Postgres requires the NEW row to be
--          visible by a SELECT policy after an UPDATE.
-- Notes:
-- - Idempotent: drops the policy if it exists, then recreates it.
-- - Keeps existing jobs_select_posted policy unchanged; policies are permissive (OR'ed).
-- - Do not weaken “one active job per pro” index; this only broadens SELECT visibility.

drop policy if exists jobs_select_assigned_or_active on public.jobs;
create policy jobs_select_assigned_or_active
  on public.jobs
  for select
  to anon, authenticated
  using (
    pro_id is not null
    or status in (
      'en_route','arrived','diagnosing',
      'materials_requested','materials_approved','in_progress',
      'inspection_completed','materials_declined','complete','cancelled'
    )
  );

