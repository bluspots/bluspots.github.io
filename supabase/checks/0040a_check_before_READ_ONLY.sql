-- Haven: preflight before pasting 0040 (client TRUNCATE / REFERENCES / TRIGGER hygiene). READ-ONLY (one SELECT,
-- catalogs only). Row 00 must say READY (4 of 4) before the paste, or "READY: already applied" after it.
-- NOT READY: stop and send the whole output to Codey.
with
snap as (select to_regclass('public.privilege_hygiene_0040_snapshot') as oid),
cg(t, ro, p) as (
  select t, ro, p from unnest(array['public.jobs', 'public.profiles']) t, unnest(array['anon', 'authenticated']) ro,
         unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) p
   where to_regclass(t) is not null and has_table_privilege(ro, t, p)),
hard(n, label, ok, detail) as (
  values
  ('01', 'public.jobs and public.profiles exist', to_regclass('public.jobs') is not null and to_regclass('public.profiles') is not null, ''),
  ('02', 'roles anon / authenticated exist', (select count(*) = 2 from pg_roles where rolname in ('anon', 'authenticated')), ''),
  ('03', 'SQL editor role owns jobs / profiles (or is a member of the owner) and has CREATE on public',
         coalesce(pg_has_role(current_user, (select relowner from pg_class where oid = to_regclass('public.jobs')), 'MEMBER')
              and pg_has_role(current_user, (select relowner from pg_class where oid = to_regclass('public.profiles')), 'MEMBER')
              and has_schema_privilege(current_user, 'public', 'create'), false), 'current_user=' || current_user),
  ('04', 'public.privilege_hygiene_0040_snapshot absent or exactly 0040 (relname, acl, taken_at)',
         (select oid from snap) is null
         or (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum) from pg_attribute a
              where a.attrelid = (select oid from snap) and a.attnum > 0 and not a.attisdropped)
            = 'relname:text,acl:aclitem[],taken_at:timestamp with time zone', '')
),
info(n, label, detail) as (
  values
  ('90', 'INFO client TRUNCATE / REFERENCES / TRIGGER today (0040 removes these)',
         coalesce((select string_agg(replace(t, 'public.', '') || ':' || ro || ':' || p, ',' order by t, ro, p) from cg), 'none')),
  ('91', 'INFO jobs ACL (pg_class.relacl)', (select coalesce(relacl::text, 'default') from pg_class where oid = to_regclass('public.jobs'))),
  ('92', 'INFO profiles ACL (pg_class.relacl)', (select coalesce(relacl::text, 'default') from pg_class where oid = to_regclass('public.profiles')))
)
select '00' as n,
       case when (select bool_and(ok) from hard) then
              case when (select oid from snap) is not null then 'READY: already applied' else 'READY' end
            else 'NOT READY' end
         || ' (' || (select count(*) filter (where ok) from hard) || ' of ' || (select count(*) from hard) || ')' as verdict,
       'overall' as detail
union all
select n, case when ok then 'READY' else 'NOT READY' end || ' ' || label, detail from hard
union all
select n, label, detail from info
order by 1;
