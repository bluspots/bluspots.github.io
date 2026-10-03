-- Haven shared backend — Slice 4 retire demo pro on pro_claim_job
-- Purpose: a claim with no auth.uid() fails and does not assign the demo pro.
--
-- 0011 set pro_id = coalesce(auth.uid(), DEMO_PRO). That fallback is retired.
-- The posted + unassigned → en_route transition is unchanged. One-active
-- remains the unique index one_active_job_per_pro.
--
-- Does not revoke anon or authenticated execute. Does not change job RLS,
-- grants on tables, the status ladder, or existing rows.
--
-- Apply in the Supabase SQL editor as the database owner, after 0017.
-- Do not apply from the app. Safe to re-run: CREATE OR REPLACE.

create or replace function public.pro_claim_job(job_id uuid)
returns setof public.jobs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pro uuid := auth.uid();
  claimed public.jobs;
begin
  if v_pro is null then
    raise exception 'claim requires auth.uid()'
      using errcode = '28000';
  end if;

  update public.jobs j
  set
    status = 'en_route',
    pro_id = v_pro,
    accepted_at = timezone('utc', now())
  where j.id = job_id
    and j.status = 'posted'
    and j.pro_id is null
  returning j.* into claimed;

  if claimed.id is null then
    -- Not claimable: signal non-2xx so client can fall back to REST PATCH.
    raise exception 'job not claimable'
      using errcode = 'P0002';
  end if;

  return next claimed;
end;
$$;

revoke all on function public.pro_claim_job(uuid) from public;
grant execute on function public.pro_claim_job(uuid) to anon, authenticated;
