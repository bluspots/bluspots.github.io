-- Haven: after-check for 0039 (customer status guard). READ-ONLY (one SELECT, catalogs only).
-- Run right after 0039. Row 000 must say LIVE (4 of 4); anything else: send the whole output to Codey.
with
fn as (select p.oid, md5(replace(p.prosrc, E'\r', '')) as m, p.prosecdef, p.proconfig from pg_proc p
        where p.oid = to_regprocedure('public.jobs_customer_status_guard()')),
hard(n, label, ok, detail) as (
  values
  ('001', 'jobs_customer_status_guard body md5 = 5712f23601a5d5428f774ae71ace3593', coalesce((select m = '5712f23601a5d5428f774ae71ace3593' from fn), false), coalesce((select m from fn), 'absent')),
  ('002', 'SECURITY INVOKER, search_path = pg_catalog, public, pg_temp',
         coalesce((select not prosecdef and proconfig = array['search_path=pg_catalog, public, pg_temp'] from fn), false), ''),
  ('003', 'no EXECUTE for anon / authenticated / service_role',
         coalesce((select not has_function_privilege('anon', oid, 'execute') and not has_function_privilege('authenticated', oid, 'execute')
                          and not has_function_privilege('service_role', oid, 'execute') from fn), false), ''),
  ('004', 'trigger: BEFORE UPDATE OF status, row, enabled, no WHEN',
         exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.jobs') and t.tgname = 'jobs_customer_status_guard'
                    and t.tgtype = 19 and t.tgenabled = 'O' and t.tgqual is null
                    and t.tgattr::text = (select a.attnum::text from pg_attribute a where a.attrelid = to_regclass('public.jobs') and a.attname = 'status')
                    and t.tgfoid = to_regprocedure('public.jobs_customer_status_guard()')), '')
),
info(n, label, detail) as (
  values ('090', 'INFO triggers on jobs', (select string_agg(tgname, ', ' order by tgname) from pg_trigger where tgrelid = to_regclass('public.jobs') and not tgisinternal))
)
select '000' as n,
       case when (select bool_and(ok) from hard) then 'LIVE' else 'NOT LIVE' end
         || ' (' || (select count(*) filter (where ok) from hard) || ' of ' || (select count(*) from hard) || ')' as verdict, 'overall' as detail
union all
select n, case when ok then 'OK' else 'FAIL' end || ' ' || label, detail from hard
union all
select n, label, detail from info
order by 1;
