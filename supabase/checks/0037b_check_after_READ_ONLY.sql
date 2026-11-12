-- Haven: after-check for 0037 (live-location sessions + immediate stop). READ-ONLY (one SELECT).
-- Paste the whole file into the Supabase SQL editor and Run right after 0037. Writes nothing; reads no
-- coordinates (row 009 and INFO rows only COUNT). Row 000 must say LIVE (10 of 10). Anything else:
-- send the whole output to Codey (rollback: supabase/rollback/0037_live_location_session_rollback.sql).
with
fns as (
  select p.oid, p.oid::regprocedure::text as sig, md5(replace(p.prosrc, E'\r', '')) as m, p.prosecdef, p.proconfig,
         p.prorettype = 'jsonb'::regtype as is_rpc, pg_get_userbyid(p.proowner) as owner
    from pg_proc p
   where p.oid in (to_regprocedure('public.pro_start_live_location(uuid)'), to_regprocedure('public.pro_stop_live_location(uuid)'),
                   to_regprocedure('public.pro_update_live_location(uuid, uuid, double precision, double precision, timestamptz)'),
                   to_regprocedure('public.job_live_locations_require_session()'), to_regprocedure('public.jobs_end_live_session()'))
),
f32 as (
  select string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, E'\r', '')), ' ' order by p.oid::regprocedure::text collate "C") as v,
         bool_and(not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('service_role', p.oid, 'execute')
                  and has_function_privilege('authenticated', p.oid, 'execute') = (p.prorettype = 'jsonb'::regtype)) as grants_ok
    from pg_proc p
   where p.oid in (to_regprocedure('public.pro_update_live_location(uuid, double precision, double precision, timestamptz)'),
                   to_regprocedure('public.get_job_live_location(uuid)'), to_regprocedure('public.jobs_discard_live_location()'))
),
hard(n, label, ok, detail) as (
  values
  ('001', '0037 function bodies (md5, CR-insensitive)',
         (select string_agg(sig || '=' || m, ' ' order by sig collate "C") from fns)
           is not distinct from 'job_live_locations_require_session()=34bf6259e45ba6b792e0ba5acf2059e6 jobs_end_live_session()=38c673cf65f1d25fee0e57fbc390a8fe pro_start_live_location(uuid)=472f5c3d071b5426db4760594864cb47 pro_stop_live_location(uuid)=a7aa831b7c59e08cf795d40c16c076f9 pro_update_live_location(uuid,uuid,double precision,double precision,timestamp with time zone)=cfe3a4c1d1256fbd33a5b93bf4aaa3e2',
         coalesce((select string_agg(sig || '=' || m, ' ' order by sig collate "C") from fns), 'missing')),
  ('002', 'all SECURITY DEFINER, search_path = pg_catalog, public, pg_temp',
         (select count(*) = 5 and bool_and(prosecdef and proconfig = array['search_path=pg_catalog, public, pg_temp']) from fns), ''),
  ('003', 'EXECUTE: start/stop/update to authenticated only; trigger functions to no client role',
         (select bool_and(not has_function_privilege('public', oid, 'execute')) and bool_and(not has_function_privilege('anon', oid, 'execute'))
                 and bool_and(not has_function_privilege('service_role', oid, 'execute'))
                 and bool_and(has_function_privilege('authenticated', oid, 'execute') = is_rpc) from fns), ''),
  ('004', 'function owner bypasses RLS and is not a client role',
         (select bool_and(owner not in ('anon', 'authenticated', 'service_role')
                          and exists (select 1 from pg_roles r where r.rolname = owner and (r.rolsuper or r.rolbypassrls))) from fns),
         (select string_agg(distinct owner, ',') from fns)),
  ('005', 'job_live_sessions owner-only (RLS on, no policies, no client grants, not published)',
         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.job_live_sessions'))
           and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_live_sessions')
           and not has_table_privilege('anon', to_regclass('public.job_live_sessions'), 'select, insert, update, delete')
           and not has_table_privilege('authenticated', to_regclass('public.job_live_sessions'), 'select, insert, update, delete')
           and not has_table_privilege('service_role', to_regclass('public.job_live_sessions'), 'select, insert, update, delete')
           and not exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'job_live_sessions'), false), ''),
  ('006', 'guard trigger on job_live_locations: BEFORE INSERT OR UPDATE, row, enabled',
         exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.job_live_locations') and t.tgname = 'job_live_locations_require_session'
                    and t.tgtype = 23 and t.tgenabled = 'O' and t.tgqual is null and t.tgfoid = to_regprocedure('public.job_live_locations_require_session()')), ''),
  ('007', 'jobs_end_live_session has exactly the 0032 discard condition, enabled',
         coalesce((select replace(pg_get_triggerdef(oid), 'jobs_end_live_session', '#') from pg_trigger
                    where tgrelid = to_regclass('public.jobs') and tgname = 'jobs_end_live_session' and tgenabled = 'O')
                  = (select replace(pg_get_triggerdef(oid), 'jobs_discard_live_location', '#') from pg_trigger
                      where tgrelid = to_regclass('public.jobs') and tgname = 'jobs_discard_live_location' and tgenabled = 'O'), false), ''),
  ('008', '0032 untouched (bodies + grants)',
         coalesce((select v = 'get_job_live_location(uuid)=cc207fcdd0e2d277bbbcd3a7852dbf75 jobs_discard_live_location()=b8398f9d39127d4e6fb6c5a4082cf5d4 pro_update_live_location(uuid,double precision,double precision,timestamp with time zone)=d94c79fddff0328da6e3d4e04ff734e4'
                          and grants_ok from f32), false),
         coalesce((select v from f32), 'missing')),
  ('009', 'no live point without a session',
         case when to_regclass('public.job_live_sessions') is null then false
              else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.job_live_locations l where not exists (select 1 from public.job_live_sessions s where s.job_id = l.job_id and s.pro_id = l.pro_id)', false, true, '')))[1]::text = '0' end, ''),
  ('010', 'old 4-argument writer still exists (refused by the guard, not 404)',
         to_regprocedure('public.pro_update_live_location(uuid, double precision, double precision, timestamptz)') is not null, '')
),
info(n, label, detail) as (
  values
  ('090', 'INFO live points / sessions', (select count(*) from public.job_live_locations)::text || ' / ' ||
         case when to_regclass('public.job_live_sessions') is null then 'table absent'
              else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.job_live_sessions', false, true, '')))[1]::text end),
  ('091', 'INFO triggers on jobs', (select string_agg(tgname, ', ' order by tgname) from pg_trigger where tgrelid = to_regclass('public.jobs') and not tgisinternal)),
  ('092', 'INFO realtime.send present (stop signal to the Customer)', (to_regprocedure('realtime.send(jsonb, text, text, boolean)') is not null)::text)
)
select '000' as n,
       case when (select bool_and(ok) from hard) then 'LIVE' else 'NOT LIVE' end
         || ' (' || (select count(*) filter (where ok) from hard) || ' of ' || (select count(*) from hard) || ')' as verdict, 'overall' as detail
union all
select n, case when ok then 'OK' else 'FAIL' end || ' ' || label, detail from hard
union all
select n, label, detail from info
order by 1;
