-- Haven shared backend: live-location sessions + immediate stop (MIG-0037)
-- DRAFT. NOT APPLIED. Do not paste until the founder authorizes it in his own words.
-- Number: 0037 (0033 stays reserved for the earlier c-min proposal, which this file replaces;
-- 0034/0035/0035a are the Founder Control Center files; 0036 is the realtime job signal).
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run it as ONE run, as the
-- database owner (postgres). Paste order: checks/0037a (read-only, row 00 READY) -> this file ->
-- checks/0037b (read-only, row 000 LIVE). Rollback: supabase/rollback/0037_live_location_session_rollback.sql.
-- Contract for the Pro and Customer apps: supabase/contracts/LIVE_LOCATION_SESSION_CONTRACT.md.
--
-- WHAT IT DOES (founder rule 2026-11-12: an intentional stop wipes the Customer-visible point at once
-- whenever the backend can be reached; a network blip keeps the 5-minute 'paused' behaviour):
--   1. public.job_live_sessions: one row per job = the assigned Pro's current sharing session
--      (job_id, pro_id, session_id, started_at). No location columns. RLS on, no policies, no grants.
--   2. pro_start_live_location(job) -> {ok, session_id}: the assigned Pro of an en_route job opens a
--      fresh session (replaces any earlier one, e.g. another device).
--   3. pro_update_live_location(job, session_id, lat, lng, captured_at): the 0032 writer plus one rule:
--      the session_id must be the job's current session. Otherwise session_stopped / session_required.
--   4. pro_stop_live_location(job | null): deletes the session AND the point now (null = all of the
--      caller's sessions, for sign-out). Sends the 0036-style job_changed signal to the Customer only,
--      so the Customer app refetches and drops the point (no location in it; failure never blocks).
--   5. BEFORE INSERT OR UPDATE guard on job_live_locations: a point can only be written inside a call
--      that carries the current session id. A delayed / in-flight / retried write from before a stop,
--      or the old 0032 4-argument writer, can never create or refresh a point.
--   6. jobs_end_live_session: AFTER UPDATE trigger with exactly the 0032 discard condition (leaving
--      en_route, Pro change, Customer change) deletes the session too, so a Pro who is released and
--      re-claims, or reaches Arrived, needs a new session.
--   7. One-time: deletes live points that have no session (all points written before 0037).
--
-- 0032 is NOT changed: pro_update_live_location(uuid,float8,float8,timestamptz), get_job_live_location,
-- jobs_discard_live_location and its trigger keep their exact bodies and grants (the 0035 baseline
-- fingerprint stays valid). After 0037 the old 4-argument writer is refused by the guard with
-- SQLSTATE P0001, message 'session_required' (PostgREST HTTP 400).
--
-- Races. Every path locks the jobs row first; that row lock serialises everything after it:
--   writer : jobs FOR SHARE, session row FOR SHARE, upsert point (guard re-checks the session).
--   stop(job)  : jobs FOR SHARE, DELETE session row (waits for any writer holding it), DELETE point.
--   stop(null) : the caller's jobs FOR SHARE in id order, then the same deletes (sign-out; Quagon LOW-1).
--   start  : jobs FOR SHARE, upsert session row.
--   jobs UPDATE: row lock (conflicts with FOR SHARE), then AFTER triggers delete point, then session.
--   So writer/stop take session -> point and the triggers point -> session, but never concurrently
--   on the same job, because both hold or wait for that job's row lock first.
--   A writer that read the session before the stop finishes first and its point is then deleted; a
--   writer that arrives after the stop finds no session (session_stopped). Token refresh, sign-in or
--   app restart never revive a session: only pro_start_live_location does.

begin;

-- ---------------------------------------------------------------- 0. guards (refuse, change nothing)
do $$
declare
  v text;
  v_jobs_owner text;
begin
  if to_regclass('public.jobs') is null or to_regclass('public.job_live_locations') is null then
    raise exception '0037: public.jobs / public.job_live_locations missing (apply 0032 first). Nothing was changed.';
  end if;
  -- 0032 exactly as reviewed (CR-insensitive body md5)
  select string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, E'\r', '')), ' ' order by p.oid::regprocedure::text collate "C") into v
    from pg_proc p
   where p.oid in (to_regprocedure('public.pro_update_live_location(uuid, double precision, double precision, timestamptz)'),
                   to_regprocedure('public.get_job_live_location(uuid)'),
                   to_regprocedure('public.jobs_discard_live_location()'));
  if v is distinct from 'get_job_live_location(uuid)=cc207fcdd0e2d277bbbcd3a7852dbf75 jobs_discard_live_location()=b8398f9d39127d4e6fb6c5a4082cf5d4 pro_update_live_location(uuid,double precision,double precision,timestamp with time zone)=d94c79fddff0328da6e3d4e04ff734e4' then
    raise exception '0037: the 0032 live-tracking functions are not the reviewed 0032 bodies (%). Send this to Codey. Nothing was changed.', coalesce(v, 'missing');
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_discard_live_location'
                    and not t.tgisinternal and t.tgenabled = 'O' and t.tgfoid = 'public.jobs_discard_live_location()'::regprocedure) then
    raise exception '0037: trigger jobs_discard_live_location (0032) missing or not enabled. Nothing was changed.';
  end if;
  if (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum)
        from pg_attribute a where a.attrelid = 'public.job_live_locations'::regclass and a.attnum > 0 and not a.attisdropped)
     is distinct from 'job_id:uuid,pro_id:uuid,lat:numeric(9,6),lng:numeric(9,6),received_at:timestamp with time zone,captured_at:timestamp with time zone'
     or not (select relrowsecurity from pg_class where oid = 'public.job_live_locations'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_live_locations') then
    raise exception '0037: job_live_locations is not the 0032 table (columns, RLS on, no policies). Nothing was changed.';
  end if;
  -- the pasting role: bypasses RLS (owner-only tables), may add triggers to both tables
  select pg_get_userbyid(relowner) into v_jobs_owner from pg_class where oid = 'public.jobs'::regclass;
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
     or not has_table_privilege(current_user, 'public.jobs', 'trigger')
     or not has_table_privilege(current_user, 'public.job_live_locations', 'trigger')
     or not has_schema_privilege(current_user, 'public', 'create') then
    raise exception '0037: run as the database owner (postgres), not % (jobs owner %). Nothing was changed.', current_user, v_jobs_owner;
  end if;
  -- 0037 objects: all absent (first paste) or exactly this file (re-run is a no-op)
  if to_regclass('public.job_live_sessions') is not null then
    if (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' order by a.attnum)
          from pg_attribute a where a.attrelid = 'public.job_live_sessions'::regclass and a.attnum > 0 and not a.attisdropped)
       is distinct from 'job_id:uuid:true,pro_id:uuid:true,session_id:uuid:true,started_at:timestamp with time zone:true'
       or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_live_sessions') then
      raise exception '0037: public.job_live_sessions exists with other columns or with policies. Nothing was changed.';
    end if;
  end if;
  select string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, E'\r', '')), ' ' order by p.oid::regprocedure::text collate "C") into v
    from pg_proc p
   where p.oid in (to_regprocedure('public.pro_start_live_location(uuid)'),
                   to_regprocedure('public.pro_stop_live_location(uuid)'),
                   to_regprocedure('public.pro_update_live_location(uuid, uuid, double precision, double precision, timestamptz)'),
                   to_regprocedure('public.job_live_locations_require_session()'),
                   to_regprocedure('public.jobs_end_live_session()'));
  if v is not null and v is distinct from 'job_live_locations_require_session()=34bf6259e45ba6b792e0ba5acf2059e6 jobs_end_live_session()=38c673cf65f1d25fee0e57fbc390a8fe pro_start_live_location(uuid)=472f5c3d071b5426db4760594864cb47 pro_stop_live_location(uuid)=a7aa831b7c59e08cf795d40c16c076f9 pro_update_live_location(uuid,uuid,double precision,double precision,timestamp with time zone)=cfe3a4c1d1256fbd33a5b93bf4aaa3e2' then
    raise exception '0037: 0037 functions already exist with other bodies (%). Send this to Codey. Nothing was changed.', v;
  end if;
  if exists (select 1 from pg_trigger t where t.tgname = 'jobs_end_live_session' and t.tgrelid = 'public.jobs'::regclass
                and t.tgfoid is distinct from to_regprocedure('public.jobs_end_live_session()'))
     or exists (select 1 from pg_trigger t where t.tgname = 'job_live_locations_require_session' and t.tgrelid = 'public.job_live_locations'::regclass
                and t.tgfoid is distinct from to_regprocedure('public.job_live_locations_require_session()')) then
    raise exception '0037: a trigger named like a 0037 trigger runs another function. Nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------- 1. session table (owner-only)
create table if not exists public.job_live_sessions (
  job_id     uuid primary key references public.jobs(id) on delete cascade,
  pro_id     uuid not null,
  session_id uuid not null,
  started_at timestamptz not null default now()
);
comment on table public.job_live_sessions is
  'Live tracking (0037): the assigned Pro''s current sharing session for an en_route job. No location data. RLS on, no policies, no client grants. Written only by pro_start_live_location / pro_stop_live_location / jobs_end_live_session.';
alter table public.job_live_sessions enable row level security;
revoke all on table public.job_live_sessions from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 2. start
create or replace function public.pro_start_live_location(p_job_id uuid)
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
  v_sid uuid := gen_random_uuid();
  v_at timestamptz := now();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select j.status, j.pro_id into v_status, v_pro from public.jobs j where j.id = p_job_id for share;
  if not found or v_pro is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_status <> 'en_route' then
    return jsonb_build_object('ok', false, 'error', 'tracking_not_active');
  end if;
  insert into public.job_live_sessions as s (job_id, pro_id, session_id, started_at)
  values (p_job_id, v_uid, v_sid, v_at)
  on conflict (job_id) do update
     set pro_id = excluded.pro_id, session_id = excluded.session_id, started_at = excluded.started_at;
  return jsonb_build_object('ok', true, 'session_id', v_sid,
    'started_at', to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end;
$$;

-- ---------------------------------------------------------------- 3. writer with a session (0032 body + session rule)
create or replace function public.pro_update_live_location(
  p_job_id uuid,
  p_session_id uuid,
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
  select j.status, j.pro_id into v_status, v_pro from public.jobs j where j.id = p_job_id for share;
  if not found or v_pro is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_status <> 'en_route' then
    return jsonb_build_object('ok', false, 'error', 'tracking_not_active');
  end if;
  if p_session_id is null then
    return jsonb_build_object('ok', false, 'error', 'session_required');
  end if;
  perform 1 from public.job_live_sessions s
   where s.job_id = p_job_id and s.pro_id = v_uid and s.session_id = p_session_id
     for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'session_stopped');
  end if;
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
  perform set_config('haven.live_session_id', p_session_id::text, true);
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
  perform set_config('haven.live_session_id', '', true);
  if v_written is null then
    select l.received_at into v_last from public.job_live_locations l where l.job_id = p_job_id;
    return jsonb_build_object('ok', false, 'error', 'rate_limited',
      'retry_after_s', greatest(1, ceil(4 - extract(epoch from (now() - v_last))))::int);
  end if;
  return jsonb_build_object('ok', true,
    'received_at', to_char(v_written at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end;
$$;

-- ---------------------------------------------------------------- 4. stop (now; idempotent)
create or replace function public.pro_stop_live_location(p_job_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pro uuid;
  v_jobs uuid[] := '{}';
  v_pts uuid[] := '{}';
  v_lt text;
  r record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_job_id is not null then
    select j.pro_id into v_pro from public.jobs j where j.id = p_job_id for share;
    if not found or v_pro is distinct from v_uid then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  else
    -- sign-out: lock the caller's jobs first (by id), so this path also takes jobs -> sessions -> points
    -- and cannot deadlock with a job update whose triggers delete point then session.
    perform 1 from public.jobs j
     where j.id in (select s.job_id from public.job_live_sessions s where s.pro_id = v_uid
                    union
                    select l.job_id from public.job_live_locations l where l.pro_id = v_uid)
     order by j.id
       for share of j;
  end if;
  -- session first, then point (same order as the writer). Waits for a writer that holds the session.
  with d as (delete from public.job_live_sessions s
              where s.pro_id = v_uid and (p_job_id is null or s.job_id = p_job_id) returning s.job_id)
  select coalesce(array_agg(d.job_id), '{}') into v_jobs from d;
  with d as (delete from public.job_live_locations l
              where l.pro_id = v_uid and (p_job_id is null or l.job_id = p_job_id) returning l.job_id)
  select coalesce(array_agg(d.job_id), '{}') into v_pts from d;
  -- tell the Customer to refetch (0036 payload shape; no location). Never blocks or undoes the stop.
  for r in select j.id, j.customer_id, j.status::text as status from public.jobs j
            where j.id = any (v_jobs || v_pts) order by j.id loop
    begin
      v_lt := current_setting('lock_timeout');
      perform set_config('lock_timeout', '1s', true);
      perform realtime.send(jsonb_build_object('v', 1, 'job_id', r.id, 'status', r.status, 'reason', 'updated',
                              'at', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
                            'job_changed', 'jobs:user:' || r.customer_id::text, true);
      perform set_config('lock_timeout', v_lt, true);
    exception when others then
      raise warning '0037 pro_stop_live_location: customer signal skipped (SQLSTATE %)', sqlstate;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'stopped', cardinality(v_jobs || v_pts) > 0);
end;
$$;

-- ---------------------------------------------------------------- 5. point guard (no session, no point)
create or replace function public.job_live_locations_require_session()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_sid text := nullif(current_setting('haven.live_session_id', true), '');
begin
  if v_sid is null or not exists (select 1 from public.job_live_sessions s
                                   where s.job_id = new.job_id and s.pro_id = new.pro_id and s.session_id::text = v_sid) then
    raise exception using errcode = 'P0001', message = 'session_required',
      hint = 'Live location needs pro_start_live_location and its session_id (0037).';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- 6. end the session whenever 0032 discards the point
create or replace function public.jobs_end_live_session()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  delete from public.job_live_sessions where job_id = new.id;
  return null;
end;
$$;

revoke all on function public.pro_start_live_location(uuid) from public, anon, service_role;
revoke all on function public.pro_stop_live_location(uuid) from public, anon, service_role;
revoke all on function public.pro_update_live_location(uuid, uuid, double precision, double precision, timestamptz) from public, anon, service_role;
grant execute on function public.pro_start_live_location(uuid) to authenticated;
grant execute on function public.pro_stop_live_location(uuid) to authenticated;
grant execute on function public.pro_update_live_location(uuid, uuid, double precision, double precision, timestamptz) to authenticated;
revoke all on function public.job_live_locations_require_session() from public, anon, authenticated, service_role;
revoke all on function public.jobs_end_live_session() from public, anon, authenticated, service_role;

drop trigger if exists job_live_locations_require_session on public.job_live_locations;
create trigger job_live_locations_require_session
  before insert or update on public.job_live_locations
  for each row execute function public.job_live_locations_require_session();

drop trigger if exists jobs_end_live_session on public.jobs;
create trigger jobs_end_live_session
  after update of status, pro_id, customer_id on public.jobs
  for each row
  when (old.status = 'en_route'
        and (new.status is distinct from 'en_route'
             or new.pro_id is distinct from old.pro_id
             or new.customer_id is distinct from old.customer_id))
  execute function public.jobs_end_live_session();

-- ---------------------------------------------------------------- 7. one-time: no session, no point
delete from public.job_live_locations l
 where not exists (select 1 from public.job_live_sessions s where s.job_id = l.job_id and s.pro_id = l.pro_id);

-- ---------------------------------------------------------------- 8. post-checks (any failure rolls everything back)
do $$
declare v text;
begin
  select string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, E'\r', '')), ' ' order by p.oid::regprocedure::text collate "C") into v
    from pg_proc p
   where p.oid in (to_regprocedure('public.pro_start_live_location(uuid)'),
                   to_regprocedure('public.pro_stop_live_location(uuid)'),
                   to_regprocedure('public.pro_update_live_location(uuid, uuid, double precision, double precision, timestamptz)'),
                   to_regprocedure('public.job_live_locations_require_session()'),
                   to_regprocedure('public.jobs_end_live_session()'));
  if v is distinct from 'job_live_locations_require_session()=34bf6259e45ba6b792e0ba5acf2059e6 jobs_end_live_session()=38c673cf65f1d25fee0e57fbc390a8fe pro_start_live_location(uuid)=472f5c3d071b5426db4760594864cb47 pro_stop_live_location(uuid)=a7aa831b7c59e08cf795d40c16c076f9 pro_update_live_location(uuid,uuid,double precision,double precision,timestamp with time zone)=cfe3a4c1d1256fbd33a5b93bf4aaa3e2' then
    raise exception '0037 post-check: function bodies differ (%). Rolled back.', v;
  end if;
  if exists (select 1 from pg_proc p
              where p.oid in (to_regprocedure('public.pro_start_live_location(uuid)'), to_regprocedure('public.pro_stop_live_location(uuid)'),
                              to_regprocedure('public.pro_update_live_location(uuid, uuid, double precision, double precision, timestamptz)'),
                              to_regprocedure('public.job_live_locations_require_session()'), to_regprocedure('public.jobs_end_live_session()'))
                and (not p.prosecdef or p.proconfig is distinct from array['search_path=pg_catalog, public, pg_temp']
                     or has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute')
                     or has_function_privilege('authenticated', p.oid, 'execute') <> (p.prorettype = 'jsonb'::regtype))) then
    raise exception '0037 post-check: security definer / search_path / EXECUTE grants wrong. Rolled back.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.job_live_sessions'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_live_sessions')
     or has_table_privilege('anon', 'public.job_live_sessions', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.job_live_sessions', 'select, insert, update, delete')
     or has_table_privilege('service_role', 'public.job_live_sessions', 'select, insert, update, delete')
     or exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'job_live_sessions') then
    raise exception '0037 post-check: job_live_sessions must be owner-only (RLS on, no policies, no grants, no publication). Rolled back.';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.job_live_locations'::regclass and t.tgname = 'job_live_locations_require_session'
                    and t.tgtype = 23 and t.tgenabled = 'O' and t.tgqual is null
                    and t.tgfoid = 'public.job_live_locations_require_session()'::regprocedure)
     or (select replace(pg_get_triggerdef(oid), 'jobs_end_live_session', '#') from pg_trigger
          where tgrelid = 'public.jobs'::regclass and tgname = 'jobs_end_live_session' and tgenabled = 'O')
        is distinct from
        (select replace(pg_get_triggerdef(oid), 'jobs_discard_live_location', '#') from pg_trigger
          where tgrelid = 'public.jobs'::regclass and tgname = 'jobs_discard_live_location') then
    raise exception '0037 post-check: triggers not as written (guard BEFORE INSERT OR UPDATE; end-session = 0032 condition). Rolled back.';
  end if;
  select string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, E'\r', '')), ' ' order by p.oid::regprocedure::text collate "C") into v
    from pg_proc p
   where p.oid in (to_regprocedure('public.pro_update_live_location(uuid, double precision, double precision, timestamptz)'),
                   to_regprocedure('public.get_job_live_location(uuid)'), to_regprocedure('public.jobs_discard_live_location()'));
  if v is distinct from 'get_job_live_location(uuid)=cc207fcdd0e2d277bbbcd3a7852dbf75 jobs_discard_live_location()=b8398f9d39127d4e6fb6c5a4082cf5d4 pro_update_live_location(uuid,double precision,double precision,timestamp with time zone)=d94c79fddff0328da6e3d4e04ff734e4' then
    raise exception '0037 post-check: 0032 bodies changed. Rolled back.';
  end if;
  if exists (select 1 from public.job_live_locations l
              where not exists (select 1 from public.job_live_sessions s where s.job_id = l.job_id and s.pro_id = l.pro_id)) then
    raise exception '0037 post-check: a live point without a session remains. Rolled back.';
  end if;
end $$;

commit;
