-- Haven — pro_claim_job RPC (parked bug #3)
-- Purpose: preferred Pro Accept path. Fixes live PGRST202 / HTTP 404 when
--   POST /rest/v1/rpc/pro_claim_job is called with { "job_id": "<uuid>" }.
-- Semantics mirror the existing Pro REST PATCH fallback:
--   posted + unassigned → en_route + pro_id + accepted_at.
-- One-active remains the unique index one_active_job_per_pro (unique_violation → 409).
-- Idempotent: CREATE OR REPLACE + re-runnable grants.

create or replace function public.pro_claim_job(job_id uuid)
returns setof public.jobs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pro uuid := coalesce(auth.uid(), '22222222-2222-4222-8222-222222222222'::uuid);
  claimed public.jobs;
begin
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

