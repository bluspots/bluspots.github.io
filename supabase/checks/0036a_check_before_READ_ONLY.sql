-- Haven: preflight before pasting 0036 (realtime job signal). READ-ONLY (one SELECT, catalogs only).
-- Paste the whole file into the Supabase SQL editor and Run. It writes nothing, reads no job row.
-- Row 00 must say READY (8 of 8) before the paste, or "READY: already applied" after it.
-- If it says NOT READY, stop and send the whole output to Codey.
-- md5 is CR-insensitive: md5(replace(prosrc, E'\r', '')), so CRLF and LF pastes match.
-- Hard rows:
--   01 public.jobs id / customer_id / pro_id uuid + status job_status
--   02 Supabase Realtime objects: realtime.messages, realtime.send(jsonb,text,text,boolean), realtime.topic()
--   03 realtime.messages: RLS on; topic/extension/payload/event/private columns as expected
--   04 the SQL editor role (postgres; it will own the function) can broadcast: BYPASSRLS, USAGE
--      realtime, EXECUTE realtime.send, INSERT realtime.messages
--   05 the SQL editor role has TRIGGER on public.jobs
--   06 authenticated can EXECUTE realtime.topic()
--   07 realtime.messages has NO policy other than 0036's jobs_signal_read_own_topic
--   08 0036 objects ALL absent (first paste) or ALL present exactly (already applied)
--       0036 function normalised md5 93780698b9417349ca18262d29abd8ab
-- INFO rows (never block): supabase_realtime publication tables, jobs replica identity,
--   triggers on jobs, 0032 discard trigger md5, realtime.send md5, today's messages partition.
with
jc as (
  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname) as cols
    from pg_attribute a
   where a.attrelid = to_regclass('public.jobs') and a.attnum > 0 and not a.attisdropped
     and a.attname in ('id', 'customer_id', 'pro_id', 'status')
),
rt as (
  select to_regclass('realtime.messages') as msg,
         to_regprocedure('realtime.send(jsonb, text, text, boolean)') as send,
         to_regprocedure('realtime.topic()') as topic
),
mc as (
  select (select relrowsecurity from pg_class where oid = rt.msg) as rls,
         (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname)
            from pg_attribute a where a.attrelid = rt.msg and a.attnum > 0 and not a.attisdropped
             and a.attname in ('topic', 'extension', 'payload', 'event', 'private')) as cols
    from rt
),
cap as (
  select r.rolname,
         (r.rolsuper or r.rolbypassrls) as bypass,
         (select rt.msg is not null and rt.send is not null
                 and has_schema_privilege(r.rolname, 'realtime', 'usage')
                 and has_function_privilege(r.rolname, rt.send, 'execute')
                 and has_table_privilege(r.rolname, rt.msg, 'insert') from rt) as can_send
    from pg_roles r where r.rolname = current_user
),
pol as (
  select policyname, cmd, permissive, roles::text as roles, coalesce(qual, '') as qual, with_check
    from pg_policies where schemaname = 'realtime' and tablename = 'messages'
),
fn as (
  select p.oid, md5(replace(p.prosrc, E'\r', '')) as body_md5, p.prosecdef, p.proconfig
    from pg_proc p where p.oid = to_regprocedure('public.jobs_signal_parties()')
),
trg as (
  select t.oid, t.tgtype, t.tgenabled, t.tgqual is null as no_when, t.tgattr::text = '' as no_cols,
         t.tgfoid = to_regprocedure('public.jobs_signal_parties()') as fn_ok
    from pg_trigger t where t.tgrelid = to_regclass('public.jobs') and t.tgname = 'jobs_signal_parties' and not t.tgisinternal
),
st as (
  select exists (select 1 from fn) as f_present,
         exists (select 1 from fn where body_md5 = '93780698b9417349ca18262d29abd8ab' and prosecdef
                   and proconfig = array['search_path=pg_catalog, public, pg_temp', 'lock_timeout=1s']
                   and not has_function_privilege('public', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')
                   and not has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('service_role', oid, 'execute')) as f_exact,
         exists (select 1 from trg) as t_present,
         exists (select 1 from trg where tgtype = 29 and tgenabled::text = 'O' and no_when and no_cols and fn_ok) as t_exact,
         exists (select 1 from pol where policyname = 'jobs_signal_read_own_topic') as p_present,
         exists (select 1 from pol where policyname = 'jobs_signal_read_own_topic' and cmd = 'SELECT' and permissive = 'PERMISSIVE'
                   and roles = '{authenticated}' and with_check is null
                   and regexp_replace(replace(replace(qual, 'realtime.', ''), 'auth.', ''), '\s+', '', 'g')
                       = '((extension=''broadcast''::text)AND(topic=(''jobs:user:''::text||((SELECTuid()ASuid))::text))AND((SELECTtopic()AStopic)=topic))') as p_exact
),
hard(n, label, ok, detail) as (
  values
  ('01', 'public.jobs id/customer_id/pro_id/status', (select cols from jc) is not distinct from 'customer_id:uuid,id:uuid,pro_id:uuid,status:job_status',
         coalesce((select cols from jc), 'public.jobs missing')),
  ('02', 'Supabase Realtime objects present', (select msg is not null and send is not null and topic is not null from rt),
         (select 'messages=' || (msg is not null) || ' send(jsonb,text,text,boolean)=' || (send is not null) || ' topic()=' || (topic is not null) from rt)),
  ('03', 'realtime.messages RLS on + expected columns',
         coalesce((select rls and cols = 'event:text,extension:text,payload:jsonb,private:boolean,topic:text' from mc), false),
         coalesce((select 'rls=' || coalesce(rls::text, 'n/a') || ' cols=' || coalesce(cols, 'n/a') from mc), 'n/a')),
  ('04', 'SQL editor role can broadcast (BYPASSRLS + realtime grants)', coalesce((select bypass and can_send from cap), false),
         coalesce((select 'role=' || rolname || ' bypassrls_or_super=' || bypass || ' usage+execute+insert=' || coalesce(can_send::text, 'false') from cap), 'n/a')),
  ('05', 'SQL editor role has TRIGGER on public.jobs',
         coalesce(to_regclass('public.jobs') is not null and has_table_privilege(current_user, 'public.jobs', 'trigger'), false),
         'current_user=' || current_user || ' jobs_owner=' || coalesce((select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.jobs')), 'n/a')),
  ('06', 'authenticated can EXECUTE realtime.topic()', coalesce((select has_function_privilege('authenticated', topic, 'execute') from rt where topic is not null), false), ''),
  ('07', 'no other policy on realtime.messages', not exists (select 1 from pol where policyname <> 'jobs_signal_read_own_topic'),
         coalesce((select string_agg(policyname || ' (' || cmd || ' ' || roles || ')', '; ' order by policyname) from pol where policyname <> 'jobs_signal_read_own_topic'), 'none')),
  ('08', '0036 objects all absent or all exact',
         (select (not f_present and not t_present and not p_present) or (f_exact and t_exact and p_exact) from st),
         (select 'function=' || case when f_exact then 'exact' when f_present then 'DIFFERENT' else 'absent' end
               || ' trigger=' || case when t_exact then 'exact' when t_present then 'DIFFERENT' else 'absent' end
               || ' policy=' || case when p_exact then 'exact' when p_present then 'DIFFERENT' else 'absent' end from st))
),
info(n, label, detail) as (
  values
  ('90', 'INFO supabase_realtime publication tables',
         coalesce((select string_agg(schemaname || '.' || tablename, ', ' order by 1) from pg_publication_tables where pubname = 'supabase_realtime'), 'none')),
  ('91', 'INFO jobs replica identity', (select case relreplident when 'd' then 'default' when 'f' then 'full' when 'n' then 'nothing' else 'index' end
                                           from pg_class where oid = to_regclass('public.jobs'))),
  ('92', 'INFO triggers on jobs', (select string_agg(tgname || case when tgenabled <> 'O' then '(' || tgenabled::text || ')' else '' end, ', ' order by tgname)
                                     from pg_trigger where tgrelid = to_regclass('public.jobs') and not tgisinternal)),
  ('93', 'INFO 0032 discard trigger fn md5 (expect b8398f9d39127d4e6fb6c5a4082cf5d4)',
         coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.jobs_discard_live_location()')), 'absent')),
  ('94', 'INFO realtime.send md5 (Supabase c12384e30dda994bf2e0d23daeaea20b at realtime 1a17fe34)',
         coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('realtime.send(jsonb, text, text, boolean)')), 'absent')),
  ('95', 'INFO realtime.messages partitions (Realtime creates them when clients connect)',
         coalesce((select count(*)::text from pg_inherits where inhparent = to_regclass('realtime.messages')), 'n/a'))
)
select '00' as n,
       case when (select bool_and(ok) from hard) then
              case when (select f_present from st) then 'READY: already applied' else 'READY' end
            else 'NOT READY' end
         || ' (' || (select count(*) filter (where ok) from hard) || ' of ' || (select count(*) from hard) || ')' as verdict,
       'overall' as detail
union all
select n, case when ok then 'READY' else 'NOT READY' end || ' ' || label, detail from hard
union all
select n, label, detail from info
order by 1;
