-- Haven: check after pasting 0036 (realtime job signal). READ-ONLY (one SELECT, catalogs only).
-- Paste the whole file into the Supabase SQL editor and Run. It writes nothing, reads no job row.
-- Row 000 must say LIVE (12 of 12). Anything else: send the whole output to Codey.
-- md5 is CR-insensitive: md5(replace(prosrc, E'\r', '')).
with
fn as (
  select p.oid, p.proowner, md5(replace(p.prosrc, E'\r', '')) as body_md5, p.prosecdef, p.proconfig
    from pg_proc p where p.oid = to_regprocedure('public.jobs_signal_parties()')
),
trg as (
  select t.oid, t.tgtype, t.tgenabled, t.tgqual is null as no_when, t.tgattr::text = '' as no_cols,
         t.tgfoid = to_regprocedure('public.jobs_signal_parties()') as fn_ok
    from pg_trigger t where t.tgrelid = to_regclass('public.jobs') and t.tgname = 'jobs_signal_parties' and not t.tgisinternal
),
pol as (
  select policyname, cmd, permissive, roles::text as roles, coalesce(qual, '') as qual, with_check
    from pg_policies where schemaname = 'realtime' and tablename = 'messages'
),
hard(n, label, ok, detail) as (
  values
  ('001', 'function jobs_signal_parties() body = 0036 (normalised md5 93780698b9417349ca18262d29abd8ab)',
          coalesce((select body_md5 = '93780698b9417349ca18262d29abd8ab' from fn), false), coalesce((select body_md5 from fn), 'absent')),
  ('002', 'SECURITY DEFINER, search_path = pg_catalog, public, pg_temp, lock_timeout = 1s',
          coalesce((select prosecdef and proconfig = array['search_path=pg_catalog, public, pg_temp', 'lock_timeout=1s'] from fn), false),
          coalesce((select 'secdef=' || prosecdef || ' config=' || coalesce(proconfig::text, 'none') from fn), 'absent')),
  ('003', 'no EXECUTE for PUBLIC / anon / authenticated / service_role',
          coalesce((select not (has_function_privilege('public', oid, 'execute') or has_function_privilege('anon', oid, 'execute')
                           or has_function_privilege('authenticated', oid, 'execute') or has_function_privilege('service_role', oid, 'execute')) from fn), false), ''),
  ('004', 'function owner bypasses RLS (postgres) and can broadcast (USAGE realtime, EXECUTE realtime.send, INSERT realtime.messages)',
          coalesce((select (r.rolsuper or r.rolbypassrls)
                           and has_schema_privilege(r.oid, 'realtime', 'usage')
                           and has_function_privilege(r.oid, to_regprocedure('realtime.send(jsonb, text, text, boolean)'), 'execute')
                           and has_table_privilege(r.oid, to_regclass('realtime.messages'), 'insert')
                      from fn join pg_roles r on r.oid = fn.proowner), false),
          coalesce((select pg_get_userbyid(proowner) from fn), 'absent')),
  ('005', 'trigger jobs_signal_parties: AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW, enabled, no WHEN, no column list',
          coalesce((select tgtype = 29 and tgenabled::text = 'O' and no_when and no_cols and fn_ok from trg), false),
          coalesce((select 'tgtype=' || tgtype || ' enabled=' || tgenabled::text from trg), 'absent')),
  ('006', 'policy jobs_signal_read_own_topic: SELECT, PERMISSIVE, {authenticated}, own topic only, broadcast only',
          exists (select 1 from pol where policyname = 'jobs_signal_read_own_topic' and cmd = 'SELECT' and permissive = 'PERMISSIVE'
                    and roles = '{authenticated}' and with_check is null
                    and regexp_replace(replace(replace(qual, 'realtime.', ''), 'auth.', ''), '\s+', '', 'g')
                        = '((extension=''broadcast''::text)AND(topic=(''jobs:user:''::text||((SELECTuid()ASuid))::text))AND((SELECTtopic()AStopic)=topic))'),
          coalesce((select qual from pol where policyname = 'jobs_signal_read_own_topic'), 'absent')),
  ('007', 'realtime.messages has exactly that one policy (no INSERT/UPDATE/DELETE/ALL, nothing for anon)',
          (select count(*) = 1 from pol),
          coalesce((select string_agg(policyname || ' (' || cmd || ' ' || roles || ')', '; ' order by policyname) from pol), 'none')),
  ('008', 'RLS on realtime.messages', coalesce((select relrowsecurity from pg_class where oid = to_regclass('realtime.messages')), false), ''),
  ('009', 'public.jobs NOT in the supabase_realtime publication',
          not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jobs'), ''),
  ('010', 'trigger function owner is not a client role (anon / authenticated / service_role)',
          coalesce((select pg_get_userbyid(proowner) not in ('anon', 'authenticated', 'service_role') from fn), false), ''),
  ('011', 'authenticated can EXECUTE realtime.topic()',
          coalesce(has_function_privilege('authenticated', to_regprocedure('realtime.topic()'), 'execute'), false), ''),
  ('012', '0032 discard trigger untouched (present + enabled when job_live_locations exists)',
          to_regclass('public.job_live_locations') is null
          or exists (select 1 from pg_trigger where tgrelid = to_regclass('public.jobs') and tgname = 'jobs_discard_live_location'
                       and tgenabled = 'O' and not tgisinternal),
          coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.jobs_discard_live_location()')), 'absent'))
),
info(n, label, detail) as (
  values
  ('090', 'INFO triggers on jobs', (select string_agg(tgname || case when tgenabled <> 'O' then '(' || tgenabled::text || ')' else '' end, ', ' order by tgname)
                                     from pg_trigger where tgrelid = to_regclass('public.jobs') and not tgisinternal)),
  ('091', 'INFO 0030 md5s (expect board 52b6bff7, claim 789cb65e, destination de20ad54)',
          (select string_agg(left(coalesce(md5(replace(p.prosrc, E'\r', '')), 'absent'), 8), ' / ' order by v.k)
             from (values (1, 'public.jobs_posted_within_radius()'), (2, 'public.pro_claim_job(uuid)'), (3, 'public.get_assigned_job_destination(uuid)')) v(k, sig)
             left join pg_proc p on p.oid = to_regprocedure(v.sig))),
  ('092', 'INFO realtime.messages partitions', coalesce((select count(*)::text from pg_inherits where inhparent = to_regclass('realtime.messages')), 'n/a'))
)
select '000' as n,
       case when (select bool_and(ok) from hard) then 'LIVE' else 'NOT LIVE' end
         || ' (' || (select count(*) filter (where ok) from hard) || ' of ' || (select count(*) from hard) || ')' as verdict,
       'overall' as detail
union all
select n, case when ok then 'LIVE' else 'NOT LIVE' end || ' ' || label, detail from hard
union all
select n, label, detail from info
order by 1;
