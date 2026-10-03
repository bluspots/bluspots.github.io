-- Haven shared backend — anonymous job-read lockdown
-- Purpose: a signed-out / anonymous caller can no longer SELECT full
--   public.jobs rows (customer_id, pro_id, tips, payment_snapshot,
--   coordinates, private lifecycle rows). Anonymous marketplace browse
--   uses a limited view of posted, unclaimed jobs only.
--
-- Signed-in Customer and Pro reads keep using public.jobs with the user
--   access token (authenticated SELECT grant and policies unchanged).
--
-- Does NOT revoke authenticated SELECT on public.jobs.
-- Does NOT re-revoke Slice 7 write grants and does not undo them.
-- Does NOT add a SELECT policy that widens access.
-- Does NOT change lifecycle, pricing, the 20/80 split, materials, tips,
--   inspection fees, categories, or role profiles.
--
-- Apply in the Supabase SQL editor as the database owner, AFTER 0019.
-- Do not apply from the app. Safe to re-run.

-- Limited public marketplace board. View owner privileges read the base
-- table; anon never needs SELECT on public.jobs.
create or replace view public.posted_jobs_public
with (security_invoker = false)
as
select
  id,
  category,
  title,
  requires_diagnosis,
  city_label,
  fixed_pro_labor_payout_cents,
  inspection_fee_cents,
  emergency,
  posted_at,
  status
from public.jobs
where status = 'posted'
  and pro_id is null;

comment on view public.posted_jobs_public is
  'Anonymous marketplace board. Posted + unclaimed only. No customer_id, pro_id, tips, payment_snapshot, lat/lng, or private lifecycle rows.';

revoke all on public.posted_jobs_public from public;
revoke all on public.posted_jobs_public from anon;
revoke all on public.posted_jobs_public from authenticated;
grant select on public.posted_jobs_public to anon;
grant select on public.posted_jobs_public to authenticated;

-- Close direct anonymous SELECT of the full jobs table.
-- Original grant: 0002_chunk2_rls.sql / 0003_chunk2_grants.sql
--   grant select, insert on public.jobs to anon, authenticated;
-- Slice 7 already revoked anon INSERT. This revokes anon SELECT only.
-- authenticated SELECT on public.jobs is unchanged.
revoke select on public.jobs from anon;
