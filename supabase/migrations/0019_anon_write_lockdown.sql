-- Haven shared backend — Slice 7 anonymous job-write lockdown
-- Purpose: a signed-out or anonymous caller can no longer insert, update,
--   delete, or claim a job, even with a crafted request. Signed-in Customer
--   and Pro writes keep working with the user session (authenticated grants
--   and policies are unchanged).
--
-- Inventory (grants found in migrations; revoke only these anon WRITE grants):
--   0002_chunk2_rls.sql:39 and 0003_chunk2_grants.sql:4
--     grant select, insert on public.jobs to anon, authenticated;
--     → revoke INSERT only (SELECT stays for signed-out Pro posted board)
--   0005_chunk3_grants.sql:6
--     grant update on public.jobs to anon, authenticated;
--   0005_chunk3_grants.sql:10
--     grant insert on public.job_status_events to anon, authenticated;
--   0011_pro_claim_job.sql:40 and 0018_retire_demo_pro_claim.sql:50
--     grant execute on function public.pro_claim_job(uuid) to anon, authenticated;
--
-- No DELETE grant on public.jobs (or job_status_events) to anon was found in
-- migrations, so none is revoked here.
--
-- Does NOT revoke anon SELECT on public.jobs.
-- Does NOT change authenticated grants or policies.
-- Does NOT drop or alter RLS policies (including those still listing anon).
-- Does NOT add a SELECT policy. Does NOT change role profiles or signup.
--
-- Apply in the Supabase SQL editor as the database owner, after 0018.
-- Do not apply from the app. Safe to re-run: REVOKE is idempotent.

revoke insert on public.jobs from anon;
revoke update on public.jobs from anon;
revoke insert on public.job_status_events from anon;
revoke execute on function public.pro_claim_job(uuid) from anon;
