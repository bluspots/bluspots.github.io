-- ROLLBACK for 0030_assigned_job_destination.sql (MIG-0030)
-- DRAFT. NOT AUTHORIZED TO RUN. Run only if 0030 must be undone, as ONE
-- single run, as the database owner. Wrapped in BEGIN/COMMIT.
--
-- Restores public.jobs_posted_within_radius() exactly as 0023 defined it
-- (exact lat/lng and full-precision distance_mi return, radius filter on the
-- exact point; this removes 0030's grid-cell coarsening; same signature,
-- SECURITY DEFINER, search_path, grants), restores public.pro_claim_job(uuid)
-- exactly as 0023 defined it (radius check before the one-active-job
-- refusal, search_path = public; same grants), and drops
-- public.get_assigned_job_destination(uuid). Touches nothing else: no
-- policy, table, row, trigger or other function. 0027 stays applied.
-- WARNING: after this rollback the board again leaks exact posted-job
-- points to every signed-in account in radius (Scope CRITICAL #2), and the
-- Pro app's RPC call returns PostgREST 404 (PGRST202); the Pro app must show
-- its no-location state. Safe to run twice (create or replace / drop if exists).
-- After this rollback, check bodies with md5(replace(prosrc, E'\r', '')):
-- board a4c9a1460149dfc69884d29aee779999, pro_claim_job 4760bcab07cf0bf907addf67036f2da7.
-- The raw md5(prosrc) depends on the paste's line endings: LF gives the same
-- values; a CRLF paste gives board 848a9fee867be8c430f580242822de71 and
-- pro_claim_job ce3860331faa94c71c05686e1a448347 (same text, same behaviour).

begin;

create or replace function public.jobs_posted_within_radius()
returns table (
  id uuid,
  category text,
  title text,
  fixed_pro_labor_payout_cents integer,
  requires_diagnosis boolean,
  city_label text,
  lat numeric,
  lng numeric,
  emergency boolean,
  posted_at timestamptz,
  status text,
  pro_id uuid,
  inspection_fee_cents integer,
  distance_mi numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.id,
    j.category,
    j.title,
    j.fixed_pro_labor_payout_cents,
    j.requires_diagnosis,
    j.city_label,
    j.lat,
    j.lng,
    j.emergency,
    j.posted_at,
    j.status::text,
    j.pro_id,
    j.inspection_fee_cents,
    public.haven_distance_miles(p.operating_lat, p.operating_lng, j.lat, j.lng)
  from public.jobs j
  join public.profiles p on p.id = auth.uid()
  where auth.uid() is not null
    and j.status = 'posted'
    and j.pro_id is null
    and j.lat is not null
    and j.lng is not null
    and p.operating_lat is not null
    and p.operating_lng is not null
    and public.haven_profile_radius_miles(p.pro_workspace) is not null
    and public.haven_distance_miles(p.operating_lat, p.operating_lng, j.lat, j.lng)
        <= public.haven_profile_radius_miles(p.pro_workspace)
  order by j.posted_at desc;
$$;

revoke all on function public.jobs_posted_within_radius() from public;
revoke all on function public.jobs_posted_within_radius() from anon;
grant execute on function public.jobs_posted_within_radius() to authenticated;

-- pro_claim_job exactly as 0023 defined it (body md5, CR removed: 4760bcab07cf0bf907addf67036f2da7).
-- Claim stays posted + unassigned to en_route with pro_id = auth.uid().
-- Out of radius, or missing coordinates, raises and does not assign.
create or replace function public.pro_claim_job(job_id uuid)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pro uuid := auth.uid();
  v_lat numeric;
  v_lng numeric;
  claimed public.jobs;
begin
  if v_pro is null then
    raise exception 'claim requires auth.uid()'
      using errcode = '28000';
  end if;

  select j.lat, j.lng
    into v_lat, v_lng
  from public.jobs j
  where j.id = job_id
    and j.status = 'posted'
    and j.pro_id is null;

  if not found then
    raise exception 'job not claimable'
      using errcode = 'P0002';
  end if;

  if not public.haven_caller_within_radius(v_lat, v_lng) then
    raise exception 'job outside operating radius'
      using errcode = 'P0001';
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
    raise exception 'job not claimable'
      using errcode = 'P0002';
  end if;

  return next claimed;
end;
$$;

revoke all on function public.pro_claim_job(uuid) from public;
revoke all on function public.pro_claim_job(uuid) from anon;
grant execute on function public.pro_claim_job(uuid) to authenticated;

drop function if exists public.get_assigned_job_destination(uuid);

commit;

-- Verify: expect jobs_posted_within_radius present (anon_exec f, auth_exec t)
-- and get_assigned_job_destination absent (null).
-- select to_regprocedure('public.get_assigned_job_destination(uuid)');
-- select has_function_privilege('anon', 'public.jobs_posted_within_radius()', 'EXECUTE'),
--        has_function_privilege('authenticated', 'public.jobs_posted_within_radius()', 'EXECUTE');
