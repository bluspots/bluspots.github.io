-- Haven shared backend — live tracking v1: the assigned Pro's live point for the job's Customer while en_route (MIG-0032)
-- Number: 0032. Order: 0023 -> 0027 -> 0030 -> 0032. Independent of 0025 / 0026 /
-- 0028 / 0029 / 0031 (no shared object).
--
-- DRAFT. NOT AUTHORIZED TO APPLY. Paste only after Quagon QA passes this
-- exact committed file (sha256 of the body) and Alex approves execution.
-- PASTE THIS WHOLE FILE AS ONE SINGLE RUN in the Supabase SQL editor as the
-- database owner. It is wrapped in BEGIN/COMMIT: it applies fully or not at
-- all. Do not apply it from the app, from CI, or from an agent.
-- Re-running it is a no-op. Rollback: supabase/rollback/0032_job_live_location_rollback.sql
-- (same SQL as the commented Rollback block at the end of this file).
-- Contract: box /workspace/mapbox-scope/LIVE_TRACKING_V1_CONTRACT.md
--   (founder product rules 2026-11-06 12:27 AM ET; design rules locked 12:43 AM ET:
--   F1 5-minute stale cutoff, F4 no service_role access, F5 10 s / 30 s / 4 s / 10 s,
--   F6 background updates in v1 (app work, not here), F7, F8).
--
-- What this adds (nothing else)
--   (a) public.job_live_locations: ONE row per job (PK job_id, FK jobs on delete
--       cascade), latest point only, no history. RLS on with ZERO policies; all
--       table rights revoked from public, anon, authenticated and service_role.
--       Not in any publication (no Realtime). Only the definer functions below
--       (owned by the jobs owner) read or write it.
--   (b) public.pro_update_live_location(p_job_id, p_lat, p_lng, p_captured_at)
--       returns jsonb. VOLATILE, SECURITY DEFINER. Only the assigned Pro of an
--       en_route job. Locks the job row FOR SHARE so a write and a status change
--       serialize (no point survives Arrived). Validates the point, clamps
--       captured_at, enforces a 4 s floor per job, UPSERTs in place. Writes ONLY
--       job_live_locations: never jobs (lat/lng or anything), profiles
--       (operating_lat/lng, pro_workspace), addresses/Home or job_status_events.
--         ok:true  -> { ok, received_at }
--         ok:false -> not_authenticated | not_found | tracking_not_active |
--                     invalid_point | rate_limited (+ retry_after_s)
--   (c) public.get_job_live_location(p_job_id) returns jsonb. STABLE, read-only,
--       SECURITY DEFINER. Only the job's Customer, only while en_route.
--         not_found for everyone who is not jobs.customer_id (assigned Pro, other
--         Pros, other Customers), byte-identical whether or not the job exists or
--         has a point. Owner + not en_route -> tracking_not_active (the owner
--         already sees the status). Owner + en_route:
--           no row                      -> { ok, available:false, reason:"waiting" }
--           received_at older than 5 min -> { ok, available:false, reason:"paused",
--                                            last_received_at }  (NO coordinates)
--           otherwise                    -> { ok, available:true, point:{lat,lng},
--                                            received_at, captured_at, age_s }
--   (d) Trigger jobs_discard_live_location: AFTER UPDATE OF status, pro_id,
--       customer_id ON public.jobs, WHEN the row is en_route and leaves en_route,
--       or its pro_id or customer_id changes (customer_id can only change through
--       a privileged path; 0017 blocks the apps). The function
--       body is one DELETE of that job's live row; it never raises, never reads or
--       changes NEW, never touches jobs. Fires for every role (incl. service_role
--       and the SQL editor), so Arrived, any cancel and every skip path discard.
--   All three functions: search_path = pg_catalog, public, pg_temp; EXECUTE
--   revoked from public, anon and service_role; the two RPCs granted to
--   authenticated only; the trigger function revoked from authenticated too.
--   service_role (F4): no table rights and no EXECUTE on the RPCs, so even a
--   service_role session that carries a user's claims gets permission denied
--   (post-check below refuses the file if a revoke did not stick).
--
-- Does not change: any jobs / profiles column, policy, grant or existing trigger;
--   pro_claim_job, jobs_posted_within_radius, get_assigned_job_destination
--   (0030), 0027 policies, pricing, fees, reimbursement, materials (0025 / 0026 /
--   0028), inspection (0029), posting validation (0031), or the job status
--   ladder. Read-only towards every existing row.
--
-- Prerequisites (section 0 refuses and changes nothing otherwise):
--   0027 live (jobs_select_assigned_pro + jobs_select_own_customer present, 0007's
--   jobs_select_assigned_or_active absent) and the three 0030 bodies, compared
--   line-ending-insensitively as md5(replace(prosrc, E'\r', '')):
--     jobs_posted_within_radius()           52b6bff79c99a734c8da2521ce6cbbb8
--     pro_claim_job(uuid)                   789cb65e77775da031012f78227d76ad
--     get_assigned_job_destination(uuid)    de20ad54497bc81c4619b09124900f4f
--   If public.job_live_locations already exists it must have exactly this
--   file's columns and no policies (re-run), otherwise the file refuses.

begin;

-- ── 0. Prerequisites (fail fast, nothing changed yet) ─────────────────────
do $$
declare
  jobs_owner oid;
  v_md5 text;
begin
  if to_regclass('public.jobs') is null then
    raise exception '0032: public.jobs missing. Nothing was changed.';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_select_assigned_or_active') then
    raise exception '0032: 0007 policy jobs_select_assigned_or_active still exists. Apply 0027 first. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_select_assigned_pro')
     or not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_select_own_customer') then
    raise exception '0032: 0027 policies jobs_select_assigned_pro / jobs_select_own_customer missing. Apply 0027 first. Nothing was changed.';
  end if;
  -- 0030 must be live, exactly (CRs removed before hashing; LF literals only).
  select md5(replace(prosrc, E'\r', '')) into v_md5 from pg_proc where oid = to_regprocedure('public.jobs_posted_within_radius()');
  if v_md5 is distinct from '52b6bff79c99a734c8da2521ce6cbbb8' then
    raise exception '0032: jobs_posted_within_radius() body (md5 % without CR) is not 0030. Apply 0030 first / diff the live definition. Nothing was changed.', coalesce(v_md5, 'missing');
  end if;
  select md5(replace(prosrc, E'\r', '')) into v_md5 from pg_proc where oid = to_regprocedure('public.pro_claim_job(uuid)');
  if v_md5 is distinct from '789cb65e77775da031012f78227d76ad' then
    raise exception '0032: pro_claim_job(uuid) body (md5 % without CR) is not 0030. Apply 0030 first / diff the live definition. Nothing was changed.', coalesce(v_md5, 'missing');
  end if;
  select md5(replace(prosrc, E'\r', '')) into v_md5 from pg_proc where oid = to_regprocedure('public.get_assigned_job_destination(uuid)');
  if v_md5 is distinct from 'de20ad54497bc81c4619b09124900f4f' then
    raise exception '0032: get_assigned_job_destination(uuid) body (md5 % without CR) is not 0030. Apply 0030 first / diff the live definition. Nothing was changed.', coalesce(v_md5, 'missing');
  end if;
  -- Re-run: an existing table must be this file's table, with no policies.
  if to_regclass('public.job_live_locations') is not null then
    if (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' order by a.attnum)
          from pg_attribute a
         where a.attrelid = 'public.job_live_locations'::regclass and a.attnum > 0 and not a.attisdropped)
       is distinct from 'job_id:uuid:true,pro_id:uuid:true,lat:numeric(9,6):true,lng:numeric(9,6):true,received_at:timestamp with time zone:true,captured_at:timestamp with time zone:false' then
      raise exception '0032: public.job_live_locations exists with different columns. Nothing was changed.';
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_live_locations') then
      raise exception '0032: public.job_live_locations has RLS policies (must have none). Nothing was changed.';
    end if;
  end if;
  select relowner into jobs_owner from pg_class where oid = 'public.jobs'::regclass;
  if current_user <> pg_get_userbyid(jobs_owner)
     and not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception '0032: run as the owner of public.jobs (or a role that bypasses RLS), not %. Nothing was changed.', current_user;
  end if;
end $$;

-- ── (a) Table: latest point only, no client access ────────────────────────
create table if not exists public.job_live_locations (
  job_id      uuid primary key references public.jobs(id) on delete cascade,
  pro_id      uuid not null,
  lat         numeric(9,6) not null,
  lng         numeric(9,6) not null,
  received_at timestamptz not null,
  captured_at timestamptz null
);

comment on table public.job_live_locations is
  'Live tracking v1 (0032): latest point of the assigned Pro for an en_route job. One row per job, no history; discarded when the job leaves en_route. No client access: RLS on, no policies, no grants. Read/write only via get_job_live_location / pro_update_live_location.';

alter table public.job_live_locations enable row level security;
revoke all on table public.job_live_locations from public;
revoke all on table public.job_live_locations from anon;
revoke all on table public.job_live_locations from authenticated;
revoke all on table public.job_live_locations from service_role;

-- ── (b) Write: assigned Pro, en_route only ────────────────────────────────
create or replace function public.pro_update_live_location(
  p_job_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_captured_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.job_status;
  v_pro uuid;
  v_lat numeric(9,6);
  v_lng numeric(9,6);
  v_cap timestamptz;
  v_written timestamptz;
  v_last timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  -- FOR SHARE conflicts with the lock a status UPDATE takes: a write and Arrived serialize.
  select j.status, j.pro_id into v_status, v_pro
    from public.jobs j
   where j.id = p_job_id
     for share;
  if not found or v_pro is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_status <> 'en_route' then
    return jsonb_build_object('ok', false, 'error', 'tracking_not_active');
  end if;
  -- NaN / Infinity fail these range checks; null fails the null check.
  if p_lat is null or p_lng is null
     or not (p_lat >= -90 and p_lat <= 90)
     or not (p_lng >= -180 and p_lng <= 180) then
    return jsonb_build_object('ok', false, 'error', 'invalid_point');
  end if;
  v_lat := round(p_lat::numeric, 6);
  v_lng := round(p_lng::numeric, 6);
  if v_lat = 0 and v_lng = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_point');
  end if;
  if p_captured_at is not null
     and p_captured_at >= now() - interval '2 minutes'
     and p_captured_at <= now() + interval '30 seconds' then
    v_cap := p_captured_at;
  end if;
  insert into public.job_live_locations as l (job_id, pro_id, lat, lng, received_at, captured_at)
  values (p_job_id, v_uid, v_lat, v_lng, now(), v_cap)
  on conflict (job_id) do update
     set pro_id = excluded.pro_id,
         lat = excluded.lat,
         lng = excluded.lng,
         received_at = excluded.received_at,
         captured_at = excluded.captured_at
   where l.received_at <= now() - interval '4 seconds'
  returning l.received_at into v_written;
  if v_written is null then
    select l.received_at into v_last from public.job_live_locations l where l.job_id = p_job_id;
    return jsonb_build_object('ok', false, 'error', 'rate_limited',
      'retry_after_s', greatest(1, ceil(4 - extract(epoch from (now() - v_last))))::int);
  end if;
  return jsonb_build_object('ok', true,
    'received_at', to_char(v_written at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end;
$$;

revoke all on function public.pro_update_live_location(uuid, double precision, double precision, timestamptz) from public;
revoke all on function public.pro_update_live_location(uuid, double precision, double precision, timestamptz) from anon;
revoke all on function public.pro_update_live_location(uuid, double precision, double precision, timestamptz) from service_role;
grant execute on function public.pro_update_live_location(uuid, double precision, double precision, timestamptz) to authenticated;

-- ── (c) Read: the job's Customer, en_route only ───────────────────────────
create or replace function public.get_job_live_location(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.job_status;
  v_customer uuid;
  v_pro uuid;
  l record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select j.status, j.customer_id, j.pro_id into v_status, v_customer, v_pro
    from public.jobs j
   where j.id = p_job_id;
  if not found or v_customer is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_status <> 'en_route' then
    return jsonb_build_object('ok', false, 'error', 'tracking_not_active');
  end if;
  select x.lat, x.lng, x.received_at, x.captured_at into l
    from public.job_live_locations x
   where x.job_id = p_job_id
     and x.pro_id = v_pro;
  if not found then
    return jsonb_build_object('ok', true, 'available', false, 'reason', 'waiting');
  end if;
  if l.received_at < now() - interval '5 minutes' then
    return jsonb_build_object('ok', true, 'available', false, 'reason', 'paused',
      'last_received_at', to_char(l.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  end if;
  return jsonb_build_object('ok', true, 'available', true,
    'point', jsonb_build_object('lat', l.lat, 'lng', l.lng),
    'received_at', to_char(l.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'captured_at', to_char(l.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'age_s', greatest(0, floor(extract(epoch from (now() - l.received_at))))::int);
end;
$$;

revoke all on function public.get_job_live_location(uuid) from public;
revoke all on function public.get_job_live_location(uuid) from anon;
revoke all on function public.get_job_live_location(uuid) from service_role;
grant execute on function public.get_job_live_location(uuid) to authenticated;

-- ── (d) Discard on any exit from en_route, or a pro_id / customer_id change ─
create or replace function public.jobs_discard_live_location()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  delete from public.job_live_locations where job_id = new.id;
  return null;
end;
$$;

revoke all on function public.jobs_discard_live_location() from public;
revoke all on function public.jobs_discard_live_location() from anon;
revoke all on function public.jobs_discard_live_location() from authenticated;
revoke all on function public.jobs_discard_live_location() from service_role;

drop trigger if exists jobs_discard_live_location on public.jobs;
create trigger jobs_discard_live_location
  after update of status, pro_id, customer_id on public.jobs
  for each row
  when (old.status = 'en_route'
        and (new.status is distinct from 'en_route'
             or new.pro_id is distinct from old.pro_id
             or new.customer_id is distinct from old.customer_id))
  execute function public.jobs_discard_live_location();

-- ── Post-checks (any failure aborts the whole transaction) ────────────────
do $$
begin
  if exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'job_live_locations') then
    raise exception '0032: public.job_live_locations is in a publication (e.g. a FOR ALL TABLES Realtime publication). Nothing was changed.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.job_live_locations'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_live_locations') then
    raise exception '0032: job_live_locations must have RLS on and no policies. Nothing was changed.';
  end if;
  if has_table_privilege('anon', 'public.job_live_locations', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.job_live_locations', 'select, insert, update, delete')
     or has_table_privilege('service_role', 'public.job_live_locations', 'select, insert, update, delete') then
    raise exception '0032: a client role still has rights on job_live_locations. Nothing was changed.';
  end if;
  -- F4: service_role has no EXECUTE on the RPCs (a service_role session carrying a
  -- user's claims must not reach the point through them).
  if has_function_privilege('service_role', 'public.pro_update_live_location(uuid, double precision, double precision, timestamptz)', 'execute')
     or has_function_privilege('service_role', 'public.get_job_live_location(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.jobs_discard_live_location()', 'execute')
     or has_function_privilege('anon', 'public.pro_update_live_location(uuid, double precision, double precision, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.get_job_live_location(uuid)', 'execute') then
    raise exception '0032: service_role / anon still has EXECUTE on a live-tracking function. Nothing was changed.';
  end if;
end $$;

commit;

-- ── Rollback (only if this file must be undone; discards every live point) ─
-- Drops the trigger FIRST (so a status change never calls a missing
-- function; this removes its status / pro_id / customer_id watch), then the
-- functions (their grants and revokes go with them), then the table.
-- Touches nothing else.
-- begin;
-- drop trigger if exists jobs_discard_live_location on public.jobs;
-- drop function if exists public.jobs_discard_live_location();
-- drop function if exists public.get_job_live_location(uuid);
-- drop function if exists public.pro_update_live_location(uuid, double precision, double precision, timestamptz);
-- drop table if exists public.job_live_locations;
-- commit;
