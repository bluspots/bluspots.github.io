-- Haven: after-check for 0031 (posting amount validation). READ-ONLY (one SELECT, catalogs only).
-- Run right after 0031. Row 000 must say LIVE (5 of 5); anything else: send the whole output to Codey
-- (rollback: supabase/rollback/0031_posting_amounts_validation_rollback.sql). Reads no table rows.
with
fn as (select p.oid, md5(replace(p.prosrc, E'\r', '')) as m, p.prosecdef, p.proconfig from pg_proc p
        where p.oid = to_regprocedure('public.jobs_validate_posting_amounts()')),
hard(n, label, ok, detail) as (
  values
  ('001', 'jobs_validate_posting_amounts body md5 = 3e4786774e3ea9ebe49f60e55605f90e (0031-v2)',
         coalesce((select m = '3e4786774e3ea9ebe49f60e55605f90e' from fn), false), coalesce((select m from fn), 'absent')),
  ('002', 'SECURITY INVOKER, search_path = pg_catalog, public, pg_temp',
         coalesce((select not prosecdef and proconfig = array['search_path=pg_catalog, public, pg_temp'] from fn), false), ''),
  ('003', 'no EXECUTE for anon / authenticated / service_role',
         coalesce((select not has_function_privilege('anon', oid, 'execute') and not has_function_privilege('authenticated', oid, 'execute')
                          and not has_function_privilege('service_role', oid, 'execute') from fn), false), ''),
  ('004', 'trigger jobs_validate_posting_amounts: BEFORE INSERT, row, enabled, no WHEN',
         exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.jobs') and t.tgname = 'jobs_validate_posting_amounts'
                    and t.tgtype = 7 and t.tgenabled = 'O' and t.tgqual is null and t.tgfoid = to_regprocedure('public.jobs_validate_posting_amounts()')), ''),
  ('005', '0029-v2 trigger still enabled',
         exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = to_regclass('public.jobs')
                    and t.tgname = 'jobs_lock_pricing_and_inspection' and t.tgenabled = 'O' and p.prosrc like '%haven-version: 0029-v2 %'), '')
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
