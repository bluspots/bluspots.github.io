-- Haven: after-check for 0038 (customer_cancel_job). READ-ONLY (one SELECT, catalogs only).
-- Run right after 0038. Row 000 must say LIVE (6 of 6); anything else: send the whole output to Codey.
with
fn as (select p.oid, md5(replace(p.prosrc, E'\r', '')) as m, p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner) as owner
         from pg_proc p where p.oid = to_regprocedure('public.customer_cancel_job(uuid)')),
hard(n, label, ok, detail) as (
  values
  ('001', 'customer_cancel_job body md5 = f166ad02756be2a392a2cb1ecf510fe5', coalesce((select m = 'f166ad02756be2a392a2cb1ecf510fe5' from fn), false), coalesce((select m from fn), 'absent')),
  ('002', 'SECURITY DEFINER, search_path = pg_catalog, public, pg_temp, returns jsonb',
         coalesce((select prosecdef and proconfig = array['search_path=pg_catalog, public, pg_temp'] and prorettype = 'jsonb'::regtype from fn), false), ''),
  ('003', 'EXECUTE: authenticated only (not public, anon, service_role)',
         coalesce((select has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('public', oid, 'execute')
                          and not has_function_privilege('anon', oid, 'execute') and not has_function_privilege('service_role', oid, 'execute') from fn), false), ''),
  ('004', 'owner bypasses RLS and is not a client role',
         coalesce((select owner not in ('anon', 'authenticated', 'service_role')
                          and exists (select 1 from pg_roles r where r.rolname = owner and (r.rolsuper or r.rolbypassrls)) from fn), false),
         coalesce((select owner from fn), 'n/a')),
  ('005', 'job_status_events actor_role still allows customer',
         exists (select 1 from pg_constraint c where c.conrelid = to_regclass('public.job_status_events') and c.contype = 'c'
                    and c.conname = 'job_status_events_actor_role_check' and pg_get_constraintdef(c.oid) like '%''customer''%'), ''),
  ('006', 'job_pro_releases (released Pro id) owner-only: RLS on, no policies, no client grants, not published',
         coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' order by a.attnum)
                     from pg_attribute a where a.attrelid = to_regclass('public.job_pro_releases') and a.attnum > 0 and not a.attisdropped)
                  = 'event_id:bigint:true,job_id:uuid:true,released_pro_id:uuid:true,at:timestamp with time zone:true'
           and (select relrowsecurity from pg_class where oid = to_regclass('public.job_pro_releases'))
           and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_pro_releases')
           and not has_table_privilege('anon', to_regclass('public.job_pro_releases'), 'select, insert, update, delete')
           and not has_table_privilege('authenticated', to_regclass('public.job_pro_releases'), 'select, insert, update, delete')
           and not has_table_privilege('service_role', to_regclass('public.job_pro_releases'), 'select, insert, update, delete')
           and not exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'job_pro_releases'), false), '')
),
info(n, label, detail) as (
  values
  ('090', 'INFO jobs UPDATE policies (0038 adds none)', (select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'jobs' and cmd in ('UPDATE', 'ALL'))),
  ('091', 'INFO triggers on jobs', (select string_agg(tgname, ', ' order by tgname) from pg_trigger where tgrelid = to_regclass('public.jobs') and not tgisinternal))
)
select '000' as n,
       case when (select bool_and(ok) from hard) then 'LIVE' else 'NOT LIVE' end
         || ' (' || (select count(*) filter (where ok) from hard) || ' of ' || (select count(*) from hard) || ')' as verdict, 'overall' as detail
union all
select n, case when ok then 'OK' else 'FAIL' end || ' ' || label, detail from hard
union all
select n, label, detail from info
order by 1;
