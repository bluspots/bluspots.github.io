-- Haven: after-check for 0039 v2 (customer status guard + no self-assignment + pro_claim_job self-claim
-- check). READ-ONLY (one SELECT, catalogs only). Run right after 0039. Row 000 must say LIVE (7 of 7);
-- anything else: send the whole output to Codey.
with
fn as (select p.oid, md5(replace(p.prosrc, E'\r', '')) as m, p.prosecdef, p.proconfig from pg_proc p
        where p.oid = to_regprocedure('public.jobs_customer_status_guard()')),
fs as (select p.oid, md5(replace(p.prosrc, E'\r', '')) as m, p.prosecdef, p.proconfig from pg_proc p
        where p.oid = to_regprocedure('public.jobs_no_self_assignment()')),
fc as (select p.oid, md5(replace(p.prosrc, E'\r', '')) as m, p.prosecdef, p.proconfig, p.proacl from pg_proc p
        where p.oid = to_regprocedure('public.pro_claim_job(uuid)')),
hard(n, label, ok, detail) as (
  values
  ('001', 'jobs_customer_status_guard body md5 = 46c813cf28c2ccabd206ff24c960bee3', coalesce((select m = '46c813cf28c2ccabd206ff24c960bee3' from fn), false), coalesce((select m from fn), 'absent')),
  ('002', 'jobs_no_self_assignment body md5 = 0527ced8e3546472bb31b7259b13024f', coalesce((select m = '0527ced8e3546472bb31b7259b13024f' from fs), false), coalesce((select m from fs), 'absent')),
  ('003', 'pro_claim_job body md5 = f72dcd37731bf7379803e9be680d70f0, SECURITY DEFINER, pinned search_path', coalesce((select m = 'f72dcd37731bf7379803e9be680d70f0' and prosecdef
          and proconfig = array['search_path=pg_catalog, public, pg_temp'] from fc), false), coalesce((select m from fc), 'absent')),
  ('004', 'both trigger functions SECURITY INVOKER, search_path = pg_catalog, public, pg_temp, no EXECUTE for anon / authenticated / service_role',
         coalesce((select bool_and(not p.prosecdef and p.proconfig = array['search_path=pg_catalog, public, pg_temp']
                          and not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')
                          and not has_function_privilege('service_role', p.oid, 'execute')) and count(*) = 2
                     from pg_proc p where p.oid in ((select oid from fn), (select oid from fs))), false), ''),
  ('005', 'pro_claim_job EXECUTE: authenticated yes, anon no, PUBLIC no',
         coalesce((select has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')
                          and not exists (select 1 from aclexplode(proacl) a where a.grantee = 0) from fc), false), ''),
  ('006', 'trigger jobs_customer_status_guard: BEFORE UPDATE OF status, row, enabled, no WHEN',
         exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.jobs') and t.tgname = 'jobs_customer_status_guard'
                    and t.tgtype = 19 and t.tgenabled = 'O' and t.tgqual is null
                    and t.tgattr::text = (select a.attnum::text from pg_attribute a where a.attrelid = to_regclass('public.jobs') and a.attname = 'status')
                    and t.tgfoid = to_regprocedure('public.jobs_customer_status_guard()')), ''),
  ('007', 'trigger jobs_no_self_assignment: BEFORE INSERT OR UPDATE OF pro_id, customer_id, row, enabled, no WHEN',
         exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.jobs') and t.tgname = 'jobs_no_self_assignment'
                    and t.tgtype = 23 and t.tgenabled = 'O' and t.tgqual is null
                    and (select string_agg(a.attname, ',' order by a.attname) from pg_attribute a
                          where a.attrelid = to_regclass('public.jobs') and a.attnum = any (t.tgattr::int2[])) = 'customer_id,pro_id'
                    and t.tgfoid = to_regprocedure('public.jobs_no_self_assignment()')), '')
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
