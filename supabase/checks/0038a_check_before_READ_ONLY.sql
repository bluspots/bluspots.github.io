-- Haven: preflight before pasting 0038 (customer_cancel_job). READ-ONLY (one SELECT, catalogs only).
-- Paste the whole file into the Supabase SQL editor and Run. Row 00 must say READY (7 of 7) before
-- the paste, or "READY: already applied" after it. NOT READY: stop and send the whole output to Codey.
-- md5 is CR-insensitive: md5(replace(prosrc, E'\r', '')).
-- Hard rows: 01 jobs columns; 02 job_status values; 03 job_status_events columns + actor_role allows
--   'customer'; 04 money/materials tables + job_live_locations exist; 05 SQL editor role bypasses RLS and
--   can CREATE in public; 06 customer_cancel_job absent or exactly 0038;
--   07 job_pro_releases absent or exactly 0038 (t674).
-- INFO rows (never block): 90 triggers on jobs, 91 0036 / 0037 present, 92 actor_role check,
--   93 one_active_job_per_pro predicate, 94 jobs UPDATE policies (unchanged by 0038).
with
fn as (select md5(replace(p.prosrc, E'\r', '')) as m from pg_proc p where p.oid = to_regprocedure('public.customer_cancel_job(uuid)')),
hard(n, label, ok, detail) as (
  values
  ('01', 'public.jobs id/customer_id/pro_id/status/accepted_at/cancelled_at',
         coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname)
                     from pg_attribute a where a.attrelid = to_regclass('public.jobs') and a.attnum > 0 and not a.attisdropped
                      and a.attname in ('id', 'customer_id', 'pro_id', 'status', 'accepted_at', 'cancelled_at'))
                  = 'accepted_at:timestamp with time zone,cancelled_at:timestamp with time zone,customer_id:uuid,id:uuid,pro_id:uuid,status:job_status', false), ''),
  ('02', 'job_status values are the reviewed set',
         coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = to_regtype('public.job_status'))
                  = 'posted,en_route,arrived,diagnosing,materials_requested,materials_approved,materials_declined,in_progress,inspection_completed,complete,cancelled', false),
         coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = to_regtype('public.job_status')), 'missing')),
  ('03', 'job_status_events columns + actor_role allows customer',
         coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname)
                     from pg_attribute a where a.attrelid = to_regclass('public.job_status_events') and a.attnum > 0 and not a.attisdropped
                      and a.attname in ('job_id', 'from_status', 'to_status', 'actor_role', 'actor_id'))
                  = 'actor_id:uuid,actor_role:text,from_status:job_status,job_id:uuid,to_status:job_status', false)
         and exists (select 1 from pg_constraint c where c.conrelid = to_regclass('public.job_status_events') and c.contype = 'c'
                        and c.conname = 'job_status_events_actor_role_check' and pg_get_constraintdef(c.oid) like '%''customer''%'), ''),
  ('04', 'materials_requests / materials_receipts / tips / earnings_statements / job_live_locations exist',
         to_regclass('public.materials_requests') is not null and to_regclass('public.materials_receipts') is not null
         and to_regclass('public.tips') is not null and to_regclass('public.earnings_statements') is not null
         and to_regclass('public.job_live_locations') is not null, ''),
  ('05', 'SQL editor role bypasses RLS and can CREATE in public',
         exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) and has_schema_privilege(current_user, 'public', 'create'),
         'current_user=' || current_user),
  ('06', 'customer_cancel_job absent or exactly 0038 (md5 f166ad02756be2a392a2cb1ecf510fe5)',
         not exists (select 1 from fn) or (select m from fn) = 'f166ad02756be2a392a2cb1ecf510fe5',
         coalesce((select m from fn), 'absent')),
  ('07', 'job_pro_releases absent, or exactly the 0038 owner-only table',
         to_regclass('public.job_pro_releases') is null
         or (coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' order by a.attnum)
                         from pg_attribute a where a.attrelid = to_regclass('public.job_pro_releases') and a.attnum > 0 and not a.attisdropped)
                      = 'event_id:bigint:true,job_id:uuid:true,released_pro_id:uuid:true,at:timestamp with time zone:true', false)
             and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_pro_releases')),
         case when to_regclass('public.job_pro_releases') is null then 'absent' else 'present' end)
),
info(n, label, detail) as (
  values
  ('90', 'INFO triggers on jobs', (select string_agg(tgname || case when tgenabled <> 'O' then '(' || tgenabled::text || ')' else '' end, ', ' order by tgname)
                                     from pg_trigger where tgrelid = to_regclass('public.jobs') and not tgisinternal)),
  ('91', 'INFO 0036 signal / 0037 sessions present', (to_regprocedure('public.jobs_signal_parties()') is not null)::text || ' / ' || (to_regclass('public.job_live_sessions') is not null)::text),
  ('92', 'INFO actor_role check', (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = to_regclass('public.job_status_events') and c.conname = 'job_status_events_actor_role_check')),
  ('93', 'INFO one_active_job_per_pro', (select pg_get_indexdef(i.indexrelid) from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = 'one_active_job_per_pro')),
  ('94', 'INFO jobs UPDATE policies (0038 adds none)', (select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'jobs' and cmd in ('UPDATE', 'ALL')))
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
