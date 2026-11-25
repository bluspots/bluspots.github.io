-- Haven: preflight before pasting 0039 v2 (customer status guard + no self-assignment + pro_claim_job
-- self-claim check). READ-ONLY (one SELECT, catalogs only). Paste the whole file into the Supabase SQL
-- editor and Run. Row 00 must say READY (7 of 7) before the paste, or "READY: already applied" after it.
-- NOT READY: stop and send the whole output to Codey.
with
fn as (select md5(replace(p.prosrc, E'\r', '')) as m from pg_proc p where p.oid = to_regprocedure('public.jobs_customer_status_guard()')),
fs as (select md5(replace(p.prosrc, E'\r', '')) as m from pg_proc p where p.oid = to_regprocedure('public.jobs_no_self_assignment()')),
fc as (select md5(replace(p.prosrc, E'\r', '')) as m from pg_proc p where p.oid = to_regprocedure('public.pro_claim_job(uuid)')),
hard(n, label, ok, detail) as (
  values
  ('01', 'public.jobs customer_id / pro_id / status',
         coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname)
                     from pg_attribute a where a.attrelid = to_regclass('public.jobs') and a.attnum > 0 and not a.attisdropped
                      and a.attname in ('customer_id', 'pro_id', 'status')) = 'customer_id:uuid,pro_id:uuid,status:job_status', false), ''),
  ('02', 'job_status values are the reviewed set',
         coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = to_regtype('public.job_status'))
                  = 'posted,en_route,arrived,diagnosing,materials_requested,materials_approved,materials_declined,in_progress,inspection_completed,complete,cancelled', false), ''),
  ('03', 'SQL editor role bypasses RLS, has TRIGGER on jobs, CREATE on public',
         coalesce(exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
                  and has_table_privilege(current_user, 'public.jobs', 'trigger') and has_schema_privilege(current_user, 'public', 'create'), false),
         'current_user=' || current_user),
  ('04', 'jobs_customer_status_guard absent or exactly 0039 v2 (md5 46c813cf28c2ccabd206ff24c960bee3)',
         not exists (select 1 from fn) or (select m from fn) = '46c813cf28c2ccabd206ff24c960bee3', coalesce((select m from fn), 'absent')),
  ('05', 'jobs_no_self_assignment absent or exactly 0039 v2 (md5 0527ced8e3546472bb31b7259b13024f)',
         not exists (select 1 from fs) or (select m from fs) = '0527ced8e3546472bb31b7259b13024f', coalesce((select m from fs), 'absent')),
  ('06', 'pro_claim_job(uuid) is the LIVE 0030 body (789cb65e77775da031012f78227d76ad) or 0039 (f72dcd37731bf7379803e9be680d70f0)',
         coalesce((select m from fc) in ('789cb65e77775da031012f78227d76ad', 'f72dcd37731bf7379803e9be680d70f0'), false), coalesce((select m from fc), 'missing')),
  ('07', 'no trigger named jobs_customer_status_guard / jobs_no_self_assignment runs another function',
         not exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.jobs') and t.tgname = 'jobs_customer_status_guard'
                        and t.tgfoid is distinct from to_regprocedure('public.jobs_customer_status_guard()'))
         and not exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.jobs') and t.tgname = 'jobs_no_self_assignment'
                        and t.tgfoid is distinct from to_regprocedure('public.jobs_no_self_assignment()')), '')
),
info(n, label, detail) as (
  values
  ('90', 'INFO triggers on jobs', (select string_agg(tgname || case when tgenabled <> 'O' then '(' || tgenabled::text || ')' else '' end, ', ' order by tgname)
                                     from pg_trigger where tgrelid = to_regclass('public.jobs') and not tgisinternal)),
  ('91', 'INFO 0029 installed (rules IV.1-IV.3 cover the same moves)', coalesce((select substring(p.prosrc from 'haven-version: [^ ]+') from pg_proc p
                                     where p.oid = to_regprocedure('public.jobs_lock_pricing_and_inspection()')), 'absent')),
  ('92', 'INFO pro_claim_job state', case (select m from fc) when '789cb65e77775da031012f78227d76ad' then '0030 (before 0039)'
                                     when 'f72dcd37731bf7379803e9be680d70f0' then '0039 (already applied)' else 'other' end)
)
select '00' as n,
       case when (select bool_and(ok) from hard) then
              case when exists (select 1 from fn) then 'READY: already applied' else 'READY' end
            else 'NOT READY' end
         || ' (' || (select count(*) filter (where ok) from hard) || ' of ' || (select count(*) from hard) || ')' as verdict,
       'overall' as detail
union all
select n, case when ok then 'READY' else 'NOT READY' end || ' ' || label, detail from hard
union all
select n, label, detail from info
order by 1;
