-- Haven: preflight before pasting 0031 (posting amount validation). READ-ONLY (one SELECT, catalogs only).
-- Paste the whole file into the Supabase SQL editor and Run. Row 00 must say READY (5 of 5) before the
-- paste, or "READY: already applied" after it. NOT READY: stop and send the whole output to Codey.
-- md5 is CR-insensitive. Reads no table rows.
-- Hard rows: 01 0029-v2 function + enabled trigger; 02 jobs money columns (needs 0025); 03 SQL editor role
--   can apply; 04 jobs_validate_posting_amounts absent or exactly 0031-v2; 05 no other trigger named so.
-- INFO rows: 90 triggers on jobs, 91 jobs INSERT policies.
with
fn as (select md5(replace(p.prosrc, E'\r', '')) as m from pg_proc p where p.oid = to_regprocedure('public.jobs_validate_posting_amounts()')),
hard(n, label, ok, detail) as (
  values
  ('01', '0029 (haven-version 0029-v2) installed, trigger enabled',
         exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.jobs_lock_pricing_and_inspection()') and p.prosrc like '%haven-version: 0029-v2 %')
         and exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.jobs') and not t.tgisinternal and t.tgname = 'jobs_lock_pricing_and_inspection'
                        and t.tgenabled = 'O' and t.tgfoid = to_regprocedure('public.jobs_lock_pricing_and_inspection()')),
         coalesce((select substring(p.prosrc from 'haven-version: [^ ]+') from pg_proc p where p.oid = to_regprocedure('public.jobs_lock_pricing_and_inspection()')), 'absent')),
  ('02', 'jobs money columns as reviewed (0025 applied)',
         coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname)
                     from pg_attribute a where a.attrelid = to_regclass('public.jobs') and a.attnum > 0 and not a.attisdropped
                      and a.attname in ('convenience_fee_cents', 'emergency', 'emergency_fee_cents', 'fixed_customer_labor_price_cents',
                                        'fixed_pro_labor_payout_cents', 'inspection_fee_cents', 'margin_rate_bps', 'materials_approved_cents',
                                        'materials_estimate_cents', 'materials_reimbursed_cents', 'requires_diagnosis', 'tip_amount_cents'))
                  = 'convenience_fee_cents:integer,emergency:boolean,emergency_fee_cents:integer,fixed_customer_labor_price_cents:integer,fixed_pro_labor_payout_cents:integer,inspection_fee_cents:integer,margin_rate_bps:integer,materials_approved_cents:integer,materials_estimate_cents:integer,materials_reimbursed_cents:integer,requires_diagnosis:boolean,tip_amount_cents:integer', false), ''),
  ('03', 'SQL editor role bypasses RLS, has TRIGGER on jobs, CREATE on public',
         coalesce(exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
                  and has_table_privilege(current_user, 'public.jobs', 'trigger') and has_schema_privilege(current_user, 'public', 'create'), false),
         'current_user=' || current_user),
  ('04', 'jobs_validate_posting_amounts absent or exactly 0031-v2 (md5 3e4786774e3ea9ebe49f60e55605f90e)',
         not exists (select 1 from fn) or (select m from fn) = '3e4786774e3ea9ebe49f60e55605f90e', coalesce((select m from fn), 'absent')),
  ('05', 'no trigger named jobs_validate_posting_amounts runs another function',
         not exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.jobs') and t.tgname = 'jobs_validate_posting_amounts'
                        and t.tgfoid is distinct from to_regprocedure('public.jobs_validate_posting_amounts()')), '')
),
info(n, label, detail) as (
  values
  ('90', 'INFO triggers on jobs', (select string_agg(tgname || case when tgenabled <> 'O' then '(' || tgenabled::text || ')' else '' end, ', ' order by tgname)
                                     from pg_trigger where tgrelid = to_regclass('public.jobs') and not tgisinternal)),
  ('91', 'INFO jobs INSERT policies', (select string_agg(policyname || ' ' || permissive, ', ' order by policyname) from pg_policies
                                        where schemaname = 'public' and tablename = 'jobs' and cmd in ('INSERT', 'ALL')))
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
