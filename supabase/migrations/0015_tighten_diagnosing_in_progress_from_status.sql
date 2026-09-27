-- Haven shared backend — require arrived before diagnosing / in_progress
-- Purpose: Stop an assigned job from entering 'diagnosing' or 'in_progress'
--          unless it is already at the correct predecessor status.
-- Notes:
-- - Additive follow-up to 0014 (already applied live). Do not rewrite 0014.
-- - Idempotent: drop policy if exists, then recreate it.
-- - 0012 / 0013 (and 0006) treat USING as the current row and WITH CHECK as the
--   new row. That split is right for one policy. Postgres then ORs every
--   permissive USING together, and separately ORs every permissive WITH CHECK.
--   They are not paired. 0013 arrived, 0012 complete, and 0006 decline all use
--   USING (pro_id is not null), which is true for an en_route row, while
--   WITH CHECK (status = 'diagnosing') is true for the new row. The OR of
--   those two clauses still allows en_route → diagnosing. Tightening only
--   these two USING clauses does not return 42501.
-- - The restrictive policy below is AND-ed with that permissive OR. WITH CHECK
--   sees the new row. The EXISTS reads the current stored row (the update has
--   not been written yet), correlated as jobs.id, same as 0008 / 0009 putting
--   the predecessor in the existing-row check.
-- - Diagnosis path: arrived → diagnosing, then diagnosing → in_progress.
-- - Fixed-service path: arrived → in_progress.
-- - A row already at diagnosing or in_progress may stay there (retry or a
--   non-status column touch). That is not a new entry from en_route.
-- - Does not change claim / cancel / materials / decline / arrived / complete
--   policy definitions.
-- - SELECT visibility unchanged (0007).

-- Ensure RLS is enabled (safe if already enabled)
alter table public.jobs enable row level security;

-- Update policy: arrived → diagnosing
-- USING is the existing row. WITH CHECK is the new row.
drop policy if exists jobs_update_assigned_to_diagnosing on public.jobs;
create policy jobs_update_assigned_to_diagnosing
  on public.jobs
  for update
  to anon, authenticated
  using (
    pro_id is not null
    and status = 'arrived'
  )
  with check (
    status = 'diagnosing'
  );

-- Update policy: arrived or diagnosing → in_progress
-- USING is the existing row. WITH CHECK is the new row.
drop policy if exists jobs_update_assigned_to_in_progress on public.jobs;
create policy jobs_update_assigned_to_in_progress
  on public.jobs
  for update
  to anon, authenticated
  using (
    pro_id is not null
    and status in ('arrived','diagnosing')
  )
  with check (
    status = 'in_progress'
  );

-- Restrictive AND: new status diagnosing / in_progress must already be at a
-- legal predecessor (or already be that status). This is what makes
-- en_route → diagnosing and en_route → in_progress raise 42501.
drop policy if exists jobs_restrict_diagnosing_in_progress_predecessor on public.jobs;
create policy jobs_restrict_diagnosing_in_progress_predecessor
  on public.jobs
  as restrictive
  for update
  to anon, authenticated
  with check (
    (
      status <> 'diagnosing'
      or exists (
        select 1
        from public.jobs as existing
        where existing.id = jobs.id
          and existing.pro_id is not null
          and existing.status in ('arrived','diagnosing')
      )
    )
    and (
      status <> 'in_progress'
      or exists (
        select 1
        from public.jobs as existing
        where existing.id = jobs.id
          and existing.pro_id is not null
          and existing.status in ('arrived','diagnosing','in_progress')
      )
    )
  );
