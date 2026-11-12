-- Haven: preflight before pasting 0037 (live-location sessions + immediate stop). READ-ONLY (one SELECT).
-- Paste the whole file into the Supabase SQL editor and Run. It writes nothing and reads no coordinates
-- (rows 90/91 only COUNT rows). Row 00 must say READY (5 of 5) before the paste, or
-- "READY: already applied" after it. If it says NOT READY, stop and send the whole output to Codey.
-- md5 is CR-insensitive: md5(replace(prosrc, E'\r', '')).
-- Hard rows:
--   01 the three 0032 functions have the reviewed 0032 bodies
--   02 trigger jobs_discard_live_location (0032) present, enabled, runs jobs_discard_live_location()
--   03 public.job_live_locations = the 0032 table (columns, RLS on, no policies)
--   04 the SQL editor role (postgres) bypasses RLS, has TRIGGER on jobs + job_live_locations, CREATE on public
--   05 0037 objects ALL absent (first paste) or ALL exact (already applied)
-- INFO rows (never block): 90 live points stored now (a first paste deletes every one of them: none has a
--   session yet), 91 sessions, 92 triggers on jobs, 93 realtime.send present (the stop's Customer signal), 94 0036 present.
with
f32 as (
  select string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, E'\r', '')), ' ' order by p.oid::regprocedure::text collate "C") as v
    from pg_proc p
   where p.oid in (to_regprocedure('public.pro_update_live_location(uuid, double precision, double precision, timestamptz)'),
                   to_regprocedure('public.get_job_live_location(uuid)'), to_regprocedure('public.jobs_discard_live_location()'))
),
f37 as (
  select count(*) as n,
         string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, E'\r', '')), ' ' order by p.oid::regprocedure::text collate "C") as v
    from pg_proc p
   where p.oid in (to_regprocedure('public.pro_start_live_location(uuid)'), to_regprocedure('public.pro_stop_live_location(uuid)'),
                   to_regprocedure('public.pro_update_live_location(uuid, uuid, double precision, double precision, timestamptz)'),
                   to_regprocedure('public.job_live_locations_require_session()'), to_regprocedure('public.jobs_end_live_session()'))
),
t37 as (
  select count(*) as n,
         count(*) filter (where (t.tgname = 'jobs_end_live_session' and t.tgfoid = to_regprocedure('public.jobs_end_live_session()'))
                           or (t.tgname = 'job_live_locations_require_session' and t.tgfoid = to_regprocedure('public.job_live_locations_require_session()'))) as ok
    from pg_trigger t
   where not t.tgisinternal and t.tgname in ('jobs_end_live_session', 'job_live_locations_require_session')
),
s37 as (
  select to_regclass('public.job_live_sessions') is not null as present,
         (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' order by a.attnum)
            from pg_attribute a where a.attrelid = to_regclass('public.job_live_sessions') and a.attnum > 0 and not a.attisdropped)
           = 'job_id:uuid:true,pro_id:uuid:true,session_id:uuid:true,started_at:timestamp with time zone:true'
         and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_live_sessions') as exact
),
hard(n, label, ok, detail) as (
  values
  ('01', '0032 function bodies are the reviewed ones',
         (select v from f32) is not distinct from 'get_job_live_location(uuid)=cc207fcdd0e2d277bbbcd3a7852dbf75 jobs_discard_live_location()=b8398f9d39127d4e6fb6c5a4082cf5d4 pro_update_live_location(uuid,double precision,double precision,timestamp with time zone)=d94c79fddff0328da6e3d4e04ff734e4',
         coalesce((select v from f32), 'missing')),
  ('02', '0032 discard trigger present + enabled',
         exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.jobs') and t.tgname = 'jobs_discard_live_location' and not t.tgisinternal
                    and t.tgenabled = 'O' and t.tgfoid = to_regprocedure('public.jobs_discard_live_location()')), ''),
  ('03', 'job_live_locations is the 0032 table (columns, RLS on, no policies)',
         coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum)
                     from pg_attribute a where a.attrelid = to_regclass('public.job_live_locations') and a.attnum > 0 and not a.attisdropped)
                  = 'job_id:uuid,pro_id:uuid,lat:numeric(9,6),lng:numeric(9,6),received_at:timestamp with time zone,captured_at:timestamp with time zone'
                  and (select relrowsecurity from pg_class where oid = to_regclass('public.job_live_locations'))
                  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_live_locations'), false), ''),
  ('04', 'SQL editor role can apply (bypass RLS, TRIGGER on jobs + job_live_locations, CREATE on public)',
         coalesce(exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
                  and has_table_privilege(current_user, 'public.jobs', 'trigger')
                  and has_table_privilege(current_user, 'public.job_live_locations', 'trigger')
                  and has_schema_privilege(current_user, 'public', 'create'), false),
         'current_user=' || current_user),
  ('05', '0037 objects all absent or all exact',
         (select (f37.n = 0 and t37.n = 0 and not s37.present)
              or (s37.exact and t37.n = 2 and t37.ok = 2 and f37.v = 'job_live_locations_require_session()=34bf6259e45ba6b792e0ba5acf2059e6 jobs_end_live_session()=38c673cf65f1d25fee0e57fbc390a8fe pro_start_live_location(uuid)=472f5c3d071b5426db4760594864cb47 pro_stop_live_location(uuid)=a7aa831b7c59e08cf795d40c16c076f9 pro_update_live_location(uuid,uuid,double precision,double precision,timestamp with time zone)=cfe3a4c1d1256fbd33a5b93bf4aaa3e2')
            from f37, t37, s37),
         (select 'functions=' || f37.n || '/5 triggers=' || t37.n || '/2 table=' || case when s37.exact then 'exact' when s37.present then 'DIFFERENT' else 'absent' end
            || coalesce(' bodies: ' || f37.v, '') from f37, t37, s37))
),
info(n, label, detail) as (
  values
  ('90', 'INFO live points stored now (first paste deletes them all)', coalesce((select count(*)::text from public.job_live_locations), 'n/a')),
  ('91', 'INFO live sessions', case when to_regclass('public.job_live_sessions') is null then 'table absent'
                                    else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.job_live_sessions', false, true, '')))[1]::text end),
  ('92', 'INFO triggers on jobs', (select string_agg(tgname || case when tgenabled <> 'O' then '(' || tgenabled::text || ')' else '' end, ', ' order by tgname)
                                     from pg_trigger where tgrelid = to_regclass('public.jobs') and not tgisinternal)),
  ('93', 'INFO realtime.send present (stop signal to the Customer)', (to_regprocedure('realtime.send(jsonb, text, text, boolean)') is not null)::text),
  ('94', 'INFO 0036 jobs_signal_parties present', (to_regprocedure('public.jobs_signal_parties()') is not null)::text)
)
select '00' as n,
       case when (select bool_and(ok) from hard) then
              case when (select f37.n from f37) > 0 then 'READY: already applied' else 'READY' end
            else 'NOT READY' end
         || ' (' || (select count(*) filter (where ok) from hard) || ' of ' || (select count(*) from hard) || ')' as verdict,
       'overall' as detail
union all
select n, case when ok then 'READY' else 'NOT READY' end || ' ' || label, detail from hard
union all
select n, label, detail from info
order by 1;
