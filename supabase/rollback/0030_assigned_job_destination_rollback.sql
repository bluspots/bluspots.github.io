-- ROLLBACK for 0030_assigned_job_destination.sql (MIG-0030)
-- DRAFT. NOT AUTHORIZED TO RUN. Run only if 0030 must be undone, as ONE
-- single run, as the database owner. Wrapped in BEGIN/COMMIT.
--
-- Restores public.jobs_posted_within_radius() exactly as 0023 defined it
-- (exact lat/lng and full-precision distance_mi return, radius filter on the
-- exact point; this removes 0030's grid-cell coarsening; same signature,
-- SECURITY DEFINER, search_path, grants) and drops
-- public.get_assigned_job_destination(uuid). Touches nothing else: no
-- policy, table, row, trigger or other function. 0027 stays applied.
-- WARNING: after this rollback the board again leaks exact posted-job
-- points to every signed-in account in radius (Scope CRITICAL #2), and the
-- Pro app's RPC call returns PostgREST 404 (PGRST202); the Pro app must show
-- its no-location state. Safe to run twice (create or replace / drop if exists).

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

drop function if exists public.get_assigned_job_destination(uuid);

commit;

-- Verify: expect jobs_posted_within_radius present (anon_exec f, auth_exec t)
-- and get_assigned_job_destination absent (null).
-- select to_regprocedure('public.get_assigned_job_destination(uuid)');
-- select has_function_privilege('anon', 'public.jobs_posted_within_radius()', 'EXECUTE'),
--        has_function_privilege('authenticated', 'public.jobs_posted_within_radius()', 'EXECUTE');
