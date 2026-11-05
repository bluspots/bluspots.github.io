-- Haven shared backend — assigned-Pro job destination + board location trim (MIG-0030)
-- Number: 0030. Order: 0023 -> 0027 -> 0030. Independent of 0025 / 0026 /
-- 0028 / 0029 / 0031 (no shared object: none of them defines the board,
-- the RPC or pro_claim_job; 0029's jobs trigger is noted under (c)).
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
--       lat and lng are always null. BOTH distance_mi AND the radius filter
--       are computed from a coarse job point (the centre of the job's grid
--       cell, see "Board grid" below), never from the exact jobs.lat/lng, so
--       sweeping one's own operating point / travelRadius and watching jobs
--       appear, disappear or change distance step reveals at most the cell
--       (QA B1). distance_mi = round(d * 2) / 2 with d = distance from the
--       caller's operating point to that cell centre. Every other column,
--       filter, order, SECURITY DEFINER, search_path and grant is unchanged
--       from 0023. No column, table or helper function is added.
--       The exact point is still used by pro_claim_job (c) /
--       jobs_enforce_claim_radius (unchanged) and by (b).
--
-- Board grid (computed inline in the board's SQL, fixed per job: depends
--   only on the job's stored lat/lng, never on the caller):
--     row      = floor((lat + 90) / 0.01), clamped to 0 .. 17999
--     cell_lat = -90 + (row + 0.5) * 0.01             (0.01 deg = 0.69 mi)
--     n        = greatest(1, floor(36000 * cos(cell_lat)))  cells in that row
--     col      = floor((lng + 180) * n / 360) mod n   (wraps at +/-180)
--     cell_lng = -180 + (col + 0.5) * 360 / n
--   So every cell is 0.01 deg of latitude by 0.01 deg / cos(cell_lat) of
--   longitude: ~0.69 mi x ~0.69 mi at any latitude (Orlando 28.5 N: n = 31635,
--   0.01138 deg lng). The integer n per row tiles 360 deg exactly, so the
--   antimeridian is a normal cell edge (lng 180 and -180 land in the same
--   cell). Near the poles n shrinks to 3 (lat 89.995) and never below 1;
--   lat +/-90 are clamped into the last row. Null lat or lng: no cell, the
--   job is not listed (as before). Worst case the true point is ~0.49 mi
--   (half the cell diagonal) from the cell centre.
--   Consequence: a job up to ~0.49 mi outside a Pro's radius can be listed
--   and then refused by pro_claim_job ("job outside operating radius"), and
--   a job up to ~0.49 mi inside can be unlisted; distance_mi can differ from
--   the true distance by up to ~0.49 mi before the 0.5 mi rounding.
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
--   (c) pro_claim_job(job_id uuid) (QA C1): same signature, return, owner,
--       grants and every response, with ONE reordering. A Pro who already
--       holds an active job (en_route, arrived, diagnosing,
--       materials_requested, materials_approved, in_progress, i.e. the
--       one_active_job_per_pro unique index) is refused BEFORE the radius
--       check, with exactly today's unique-violation error (SQLSTATE 23505,
--       message 'duplicate key value violates unique constraint
--       "one_active_job_per_pro"', detail 'Key (pro_id)=(<uuid>) already
--       exists.'; PostgREST 409, which haven-pro already handles). Before
--       0030 the busy Pro got P0001 'job outside operating radius' when the
--       exact point was outside and 23505 when inside: a two-sided oracle that
--       recovered the point to 0.06 m. Now a busy Pro gets the same answer
--       wherever the job is. Unchanged: signed-out 28000; 'job not claimable'
--       P0002 (missing / not posted / taken, checked before the busy check as
--       today); for a Pro with no active job the exact-point radius check
--       (P0001), the en_route transition, accepted_at, the returned row and
--       the race (loser gets P0002 after the radius check, as today). The
--       unique index still enforces one active job under concurrency.
--       With 0029 applied, a busy Pro claiming a job they posted now gets
--       23505 instead of 0029's 42501 (the busy check runs first); a Pro
--       with no active job still gets 42501. No location signal either way.
--   H1. The three SECURITY DEFINER functions this file creates or redefines
--       pin search_path = pg_catalog, public, pg_temp (pg_temp last: no
--       temp-schema type / relation shadowing inside them). Other 0023
--       functions are deliberately left as they are (see the PR notes).
--   Version guard (section 0): the board's and pro_claim_job's bodies
--       (md5 of pg_proc.prosrc) must be 0023's or this file's, and the
--       one_active_job_per_pro index must exist with the six active
--       statuses; otherwise the file refuses and changes nothing.
--
-- Does not change: public.jobs policies or grants (direct table reads stay as
--   0027 left them: owner customer + assigned Pro only), any table, column,
--   row, trigger, jobs_enforce_claim_radius,
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
  -- Version guard: only 0023's bodies (or this file's, for a re-run) are replaced.
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.jobs_posted_within_radius()'))
     not in ('a4c9a1460149dfc69884d29aee779999',  -- 0023
             '52b6bff79c99a734c8da2521ce6cbbb8') then -- 0030 (this file)
    raise exception '0030: jobs_posted_within_radius() body (md5 %) is neither 0023 nor 0030. Diff the live definition first. Nothing was changed.',
      (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.jobs_posted_within_radius()'));
  end if;
  if to_regprocedure('public.pro_claim_job(uuid)') is null then
    raise exception '0030: public.pro_claim_job(uuid) missing. Nothing was changed.';
  end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.pro_claim_job(uuid)'))
     not in ('4760bcab07cf0bf907addf67036f2da7',  -- 0023
             '789cb65e77775da031012f78227d76ad') then -- 0030 (this file)
    raise exception '0030: pro_claim_job(uuid) body (md5 %) is neither 0023 nor 0030. Diff the live definition first. Nothing was changed.',
      (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.pro_claim_job(uuid)'));
  end if;
  -- The busy-Pro refusal in (c) mirrors this index; it must exist with the six active statuses.
  if not exists (
       select 1
         from pg_index i
         join pg_class c on c.oid = i.indexrelid
        where c.relname = 'one_active_job_per_pro'
          and c.relnamespace = 'public'::regnamespace
          and i.indrelid = 'public.jobs'::regclass
          and i.indisunique
          and (select count(*) from regexp_matches(pg_get_expr(i.indpred, i.indrelid), '''[a-z_]+''::', 'g')) = 6
          and pg_get_expr(i.indpred, i.indrelid) like '%''en_route''%'
          and pg_get_expr(i.indpred, i.indrelid) like '%''arrived''%'
          and pg_get_expr(i.indpred, i.indrelid) like '%''diagnosing''%'
          and pg_get_expr(i.indpred, i.indrelid) like '%''materials_requested''%'
          and pg_get_expr(i.indpred, i.indrelid) like '%''materials_approved''%'
          and pg_get_expr(i.indpred, i.indrelid) like '%''in_progress''%') then
    raise exception '0030: unique index public.one_active_job_per_pro (six active statuses) missing or different. Nothing was changed.';
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

-- ── (a) Board: same signature, no exact point, grid-cell distance + filter ─
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
set search_path = pg_catalog, public, pg_temp
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
    round(public.haven_distance_miles(p.operating_lat, p.operating_lng, g.cell_lat, g.cell_lng) * 2) / 2
  from public.jobs j
  join public.profiles p on p.id = auth.uid()
  -- Coarse job point (B1): centre of the job's ~0.69 x 0.69 mi grid cell.
  -- Fixed per job; the exact j.lat / j.lng never reach the output or the filter.
  cross join lateral (
    select c.cell_lat,
           -180 + (mod(mod(floor((j.lng + 180) * c.n / 360), c.n) + c.n, c.n) + 0.5) * 360 / c.n as cell_lng
      from (select r.cell_lat,
                   greatest(1, floor(36000 * cos(radians(r.cell_lat::double precision))))::numeric as n
              from (select -90 + (least(greatest(floor((j.lat + 90) / 0.01), 0), 17999) + 0.5) * 0.01 as cell_lat) r) c
     where j.lat is not null and j.lng is not null
  ) g
  where auth.uid() is not null
    and j.status = 'posted'
    and j.pro_id is null
    and j.lat is not null
    and j.lng is not null
    and p.operating_lat is not null
    and p.operating_lng is not null
    and public.haven_profile_radius_miles(p.pro_workspace) is not null
    and public.haven_distance_miles(p.operating_lat, p.operating_lng, g.cell_lat, g.cell_lng)
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
set search_path = pg_catalog, public, pg_temp
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

-- ── (c) pro_claim_job: busy-Pro refusal before the radius check (QA C1) ──
-- Based on 0023's body (the latest definition on master). The only changes:
-- the active-job refusal block below, and search_path (H1).
create or replace function public.pro_claim_job(job_id uuid)
returns setof public.jobs
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
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

  -- C1: one active job per Pro, refused before any location check, with the
  -- same error the one_active_job_per_pro unique index raises today.
  if exists (select 1
               from public.jobs a
              where a.pro_id = v_pro
                and a.status in ('en_route', 'arrived', 'diagnosing',
                                 'materials_requested', 'materials_approved', 'in_progress')) then
    raise exception 'duplicate key value violates unique constraint "one_active_job_per_pro"'
      using errcode = '23505',
            detail = format('Key (pro_id)=(%s) already exists.', v_pro),
            schema = 'public',
            table = 'jobs',
            constraint = 'one_active_job_per_pro';
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

-- ── Post-checks (inside the transaction; any failure rolls everything back)
do $$
declare
  jobs_owner oid;
  fn oid;
begin
  select relowner into jobs_owner from pg_class where oid = 'public.jobs'::regclass;
  foreach fn in array array[to_regprocedure('public.jobs_posted_within_radius()'),
                            to_regprocedure('public.get_assigned_job_destination(uuid)'),
                            to_regprocedure('public.pro_claim_job(uuid)')] loop
    if not (select prosecdef from pg_proc where oid = fn) then
      raise exception '0030 post-check: % is not SECURITY DEFINER', fn::regprocedure;
    end if;
    if (select proconfig from pg_proc where oid = fn) is distinct from array['search_path=pg_catalog, public, pg_temp'] then
      raise exception '0030 post-check: % search_path is not pg_catalog, public, pg_temp', fn::regprocedure;
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
--                  'public.get_assigned_job_destination(uuid)'::regprocedure,
--                  'public.pro_claim_job(uuid)'::regprocedure);
-- Expect: all three prosecdef = t, proconfig = {"search_path=pg_catalog, public, pg_temp"},
-- owner = owner of public.jobs, anon_exec = f, auth_exec = t; provolatile = s
-- for the board and the RPC, v for pro_claim_job (unchanged from 0023).
-- Body md5 (md5(prosrc)): board 52b6bff79c99a734c8da2521ce6cbbb8, pro_claim_job 789cb65e77775da031012f78227d76ad
-- (0023: board a4c9a1460149dfc69884d29aee779999, pro_claim_job 4760bcab07cf0bf907addf67036f2da7).

-- ── Rollback (only if this file must be undone; NOT AUTHORIZED) ─────────
-- Identical to supabase/rollback/0030_assigned_job_destination_rollback.sql.
-- Restores 0023's board exactly (exact lat/lng, exact distance and exact-point radius
-- filter; removes the grid-cell coarsening), restores 0023's pro_claim_job exactly
-- (removes the C1 reordering) and drops the RPC. Run the lines between begin and commit.
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
-- -- pro_claim_job exactly as 0023 defined it (body md5 4760bcab07cf0bf907addf67036f2da7).
-- -- Claim stays posted + unassigned to en_route with pro_id = auth.uid().
-- -- Out of radius, or missing coordinates, raises and does not assign.
-- create or replace function public.pro_claim_job(job_id uuid)
-- returns setof public.jobs
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   v_pro uuid := auth.uid();
--   v_lat numeric;
--   v_lng numeric;
--   claimed public.jobs;
-- begin
--   if v_pro is null then
--     raise exception 'claim requires auth.uid()'
--       using errcode = '28000';
--   end if;
--
--   select j.lat, j.lng
--     into v_lat, v_lng
--   from public.jobs j
--   where j.id = job_id
--     and j.status = 'posted'
--     and j.pro_id is null;
--
--   if not found then
--     raise exception 'job not claimable'
--       using errcode = 'P0002';
--   end if;
--
--   if not public.haven_caller_within_radius(v_lat, v_lng) then
--     raise exception 'job outside operating radius'
--       using errcode = 'P0001';
--   end if;
--
--   update public.jobs j
--   set
--     status = 'en_route',
--     pro_id = v_pro,
--     accepted_at = timezone('utc', now())
--   where j.id = job_id
--     and j.status = 'posted'
--     and j.pro_id is null
--   returning j.* into claimed;
--
--   if claimed.id is null then
--     raise exception 'job not claimable'
--       using errcode = 'P0002';
--   end if;
--
--   return next claimed;
-- end;
-- $$;
--
-- revoke all on function public.pro_claim_job(uuid) from public;
-- revoke all on function public.pro_claim_job(uuid) from anon;
-- grant execute on function public.pro_claim_job(uuid) to authenticated;
--
-- drop function if exists public.get_assigned_job_destination(uuid);
--
-- commit;
