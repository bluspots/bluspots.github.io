-- Haven shared backend — assigned-Pro job destination + board location trim (MIG-0030)
-- Number: 0030. Order: 0023 -> 0027 -> 0030. Independent of 0025 / 0026 /
-- 0028 / 0029 / 0031 (no shared object).
--
-- DRAFT. NOT AUTHORIZED TO APPLY. Paste only after Quagon QA passes this
-- exact committed file (sha256 of the body) and Alex approves execution.
-- PASTE THIS WHOLE FILE AS ONE SINGLE RUN in the Supabase SQL editor as the
-- database owner. It is wrapped in BEGIN/COMMIT: it applies fully or not at
-- all. Do not apply it from the app, from CI, or from an agent.
-- Re-running it is a no-op (create or replace with the same bodies, same
-- revoke / grant). Rollback: supabase/rollback/0030_assigned_job_destination_rollback.sql
-- (same SQL as the commented Rollback block at the end of this file).
-- Contract: Hub backend/contracts/mapbox-assigned-destination-0030.md
--
-- Why
--   1. public.jobs_posted_within_radius() (0023) returns the exact lat/lng of
--      every posted job in the caller's radius, and a full-precision
--      distance_mi that allows trilateration. The Pro board only needs
--      distance_mi (haven-pro backend_adapter.js filters on it).
--   2. The assigned Pro needs the stored job point for the map pin, through a
--      status-gated contract that never returns it to anyone else.
--
-- What changes
--   (a) jobs_posted_within_radius(): SAME signature and return columns
--       (create or replace, no drop, so the deployed Pro build keeps working).
--       lat and lng are always null. distance_mi is rounded to the nearest
--       0.5 mi (round(d * 2) / 2). The radius filter
--       still uses the exact distance. Every other column, filter, order,
--       SECURITY DEFINER, search_path and grant is unchanged from 0023.
--   (b) New public.get_assigned_job_destination(p_job_id uuid) returns jsonb.
--       STABLE, SECURITY DEFINER, search_path pinned, read-only (one SELECT,
--       no writes, no lifecycle change). EXECUTE: authenticated only.
--       Always returns a JSON object (HTTP 200 via PostgREST):
--         ok:true  -> { ok, job_id, status,
--                       destination: { lat, lng, source: "stored_job_point" },
--                       address: { line: address_snapshot, unit: null, access_notes: null },
--                       city_label, accepted_at (UTC, "YYYY-MM-DDTHH:MI:SSZ") }
--         ok:false -> { ok:false, error: <code> } with code:
--           not_authenticated  auth.uid() is null
--           not_found          no such job, OR the caller is not jobs.pro_id
--                              (other Pros, the customer, anyone else). One
--                              code for both so the RPC is not an existence
--                              oracle.
--           status_not_active  assigned to the caller but status is not one of
--                              en_route, arrived, diagnosing,
--                              materials_requested, materials_approved,
--                              in_progress; also carries status.
--           no_coordinates     assigned + active but lat or lng is null; also
--                              carries city_label for the UI fallback.
--
-- Does not change: public.jobs policies or grants (direct table reads stay as
--   0027 left them: owner customer + assigned Pro only), any table, column,
--   row, trigger, pro_claim_job, jobs_enforce_claim_radius,
--   haven_caller_within_radius, pricing, fees, reimbursement, materials
--   (0025 / 0026 / 0028), inspection (0029), posting validation (0031), or the
--   job status ladder.
--
-- Prerequisites (section 0 refuses and changes nothing otherwise): 0023's
--   functions, and 0027 applied (jobs_select_assigned_pro and
--   jobs_select_own_customer present, 0007's jobs_select_assigned_or_active
--   absent). Without 0027 every signed-in account can read lat/lng of
--   assigned jobs straight from the table, so this RPC would not be the gate.

begin;

-- ── 0. Prerequisites (fail fast, nothing changed yet) ─────────────────────
do $$
declare
  jobs_owner oid;
  fn_owner oid;
begin
  if to_regclass('public.jobs') is null or to_regclass('public.profiles') is null then
    raise exception '0030: public.jobs / public.profiles missing. Nothing was changed.';
  end if;
  if to_regprocedure('public.jobs_posted_within_radius()') is null
     or to_regprocedure('public.haven_distance_miles(numeric,numeric,numeric,numeric)') is null
     or to_regprocedure('public.haven_profile_radius_miles(jsonb)') is null then
    raise exception '0030: 0023 functions missing (jobs_posted_within_radius / haven_distance_miles / haven_profile_radius_miles). Nothing was changed.';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_select_assigned_or_active') then
    raise exception '0030: 0007 policy jobs_select_assigned_or_active still exists. Apply 0027 first. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_select_assigned_pro')
     or not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_select_own_customer') then
    raise exception '0030: 0027 policies jobs_select_assigned_pro / jobs_select_own_customer missing. Apply 0027 first. Nothing was changed.';
  end if;
  select relowner into jobs_owner from pg_class where oid = 'public.jobs'::regclass;
  select proowner into fn_owner from pg_proc where oid = to_regprocedure('public.jobs_posted_within_radius()');
  if not (select prosecdef from pg_proc where oid = to_regprocedure('public.jobs_posted_within_radius()')) then
    raise exception '0030: jobs_posted_within_radius() is not SECURITY DEFINER. Stop.';
  end if;
  if fn_owner <> jobs_owner
     and not exists (select 1 from pg_roles where oid = fn_owner and (rolsuper or rolbypassrls)) then
    raise exception '0030: jobs_posted_within_radius() is owned by %, which does not own public.jobs or bypass RLS. Stop.',
      pg_get_userbyid(fn_owner);
  end if;
  if current_user <> pg_get_userbyid(jobs_owner)
     and not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception '0030: run as the owner of public.jobs (or a role that bypasses RLS), not %. Nothing was changed.', current_user;
  end if;
end
$$;

-- ── (a) Board: same signature, no exact point, rounded distance ──────────
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
    null::numeric,
    null::numeric,
    j.emergency,
    j.posted_at,
    j.status::text,
    j.pro_id,
    j.inspection_fee_cents,
    round(public.haven_distance_miles(p.operating_lat, p.operating_lng, j.lat, j.lng) * 2) / 2
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

-- ── (b) Assigned Pro destination ──────────────────────────────────────────
create or replace function public.get_assigned_job_destination(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select j.id, j.pro_id, j.status::text as status, j.lat, j.lng,
         j.city_label, j.address_snapshot, j.accepted_at
    into v_job
    from public.jobs j
   where j.id = p_job_id;

  -- Unknown job and "not your job" are the same answer (no existence oracle).
  if not found or v_job.pro_id is null or v_job.pro_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_job.status not in ('en_route', 'arrived', 'diagnosing',
                          'materials_requested', 'materials_approved', 'in_progress') then
    return jsonb_build_object('ok', false, 'error', 'status_not_active', 'status', v_job.status);
  end if;

  if v_job.lat is null or v_job.lng is null then
    return jsonb_build_object('ok', false, 'error', 'no_coordinates',
                              'city_label', v_job.city_label);
  end if;

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'status', v_job.status,
    'destination', jsonb_build_object('lat', v_job.lat, 'lng', v_job.lng,
                                      'source', 'stored_job_point'),
    'address', jsonb_build_object('line', v_job.address_snapshot,
                                  'unit', null, 'access_notes', null),
    'city_label', v_job.city_label,
    'accepted_at', case when v_job.accepted_at is null then null
                        else to_char(v_job.accepted_at at time zone 'UTC',
                                     'YYYY-MM-DD"T"HH24:MI:SS"Z"') end
  );
end;
$$;

comment on function public.get_assigned_job_destination(uuid) is
  'MIG-0030. Stored job point (and address_snapshot) for the assigned Pro only, active statuses only. Read-only.';

revoke all on function public.get_assigned_job_destination(uuid) from public;
revoke all on function public.get_assigned_job_destination(uuid) from anon;
grant execute on function public.get_assigned_job_destination(uuid) to authenticated;

-- ── Post-checks (inside the transaction; any failure rolls everything back)
do $$
declare
  jobs_owner oid;
  fn oid;
begin
  select relowner into jobs_owner from pg_class where oid = 'public.jobs'::regclass;
  foreach fn in array array[to_regprocedure('public.jobs_posted_within_radius()'),
                            to_regprocedure('public.get_assigned_job_destination(uuid)')] loop
    if not (select prosecdef from pg_proc where oid = fn) then
      raise exception '0030 post-check: % is not SECURITY DEFINER', fn::regprocedure;
    end if;
    if (select proowner from pg_proc where oid = fn) <> jobs_owner
       and not exists (select 1 from pg_roles r join pg_proc p on p.proowner = r.oid
                        where p.oid = fn and (r.rolsuper or r.rolbypassrls)) then
      raise exception '0030 post-check: % owner neither owns public.jobs nor bypasses RLS', fn::regprocedure;
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE') then
      raise exception '0030 post-check: anon can execute %', fn::regprocedure;
    end if;
    if not has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception '0030 post-check: authenticated cannot execute %', fn::regprocedure;
    end if;
  end loop;
end
$$;

commit;

-- ── Verify (read-only, after pasting) ─────────────────────────────────────
-- select p.oid::regprocedure, p.prosecdef, p.provolatile, p.proconfig, pg_get_userbyid(p.proowner),
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
--   from pg_proc p
--  where p.oid in ('public.jobs_posted_within_radius()'::regprocedure,
--                  'public.get_assigned_job_destination(uuid)'::regprocedure);
-- Expect: both prosecdef = t, provolatile = s, proconfig = {search_path=public},
-- owner = owner of public.jobs, anon_exec = f, auth_exec = t.

-- ── Rollback (only if this file must be undone; NOT AUTHORIZED) ─────────
-- Identical to supabase/rollback/0030_assigned_job_destination_rollback.sql.
-- Restores 0023's board exactly and drops the RPC. Run the lines between begin and commit.
-- begin;
--
-- create or replace function public.jobs_posted_within_radius()
-- returns table (
--   id uuid,
--   category text,
--   title text,
--   fixed_pro_labor_payout_cents integer,
--   requires_diagnosis boolean,
--   city_label text,
--   lat numeric,
--   lng numeric,
--   emergency boolean,
--   posted_at timestamptz,
--   status text,
--   pro_id uuid,
--   inspection_fee_cents integer,
--   distance_mi numeric
-- )
-- language sql
-- stable
-- security definer
-- set search_path = public
-- as $$
--   select
--     j.id,
--     j.category,
--     j.title,
--     j.fixed_pro_labor_payout_cents,
--     j.requires_diagnosis,
--     j.city_label,
--     j.lat,
--     j.lng,
--     j.emergency,
--     j.posted_at,
--     j.status::text,
--     j.pro_id,
--     j.inspection_fee_cents,
--     public.haven_distance_miles(p.operating_lat, p.operating_lng, j.lat, j.lng)
--   from public.jobs j
--   join public.profiles p on p.id = auth.uid()
--   where auth.uid() is not null
--     and j.status = 'posted'
--     and j.pro_id is null
--     and j.lat is not null
--     and j.lng is not null
--     and p.operating_lat is not null
--     and p.operating_lng is not null
--     and public.haven_profile_radius_miles(p.pro_workspace) is not null
--     and public.haven_distance_miles(p.operating_lat, p.operating_lng, j.lat, j.lng)
--         <= public.haven_profile_radius_miles(p.pro_workspace)
--   order by j.posted_at desc;
-- $$;
--
-- revoke all on function public.jobs_posted_within_radius() from public;
-- revoke all on function public.jobs_posted_within_radius() from anon;
-- grant execute on function public.jobs_posted_within_radius() to authenticated;
--
-- drop function if exists public.get_assigned_job_destination(uuid);
--
-- commit;
