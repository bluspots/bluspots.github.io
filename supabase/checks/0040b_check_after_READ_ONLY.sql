-- Haven: after-check for 0040 (client TRUNCATE / REFERENCES / TRIGGER hygiene). READ-ONLY (one SELECT,
-- catalogs only). Run right after 0040. Row 000 must say LIVE (4 of 4); anything else: send the output to Codey.
with
hard(n, label, ok, detail) as (
  values
  ('001', 'anon / authenticated have no TRUNCATE / REFERENCES / TRIGGER on jobs or profiles',
         not exists (select 1 from unnest(array['public.jobs', 'public.profiles']) t, unnest(array['anon', 'authenticated']) ro,
                       unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) p where has_table_privilege(ro, t, p)), ''),
  ('002', 'app grants unchanged: authenticated SELECT / INSERT / UPDATE on jobs, SELECT on profiles',
         has_table_privilege('authenticated', 'public.jobs', 'select') and has_table_privilege('authenticated', 'public.jobs', 'insert')
         and has_table_privilege('authenticated', 'public.jobs', 'update') and has_table_privilege('authenticated', 'public.profiles', 'select'), ''),
  ('003', 'snapshot table owner-only: RLS on, no policies, no grants to PUBLIC / anon / authenticated / service_role',
         coalesce((select c.relrowsecurity
                          and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'privilege_hygiene_0040_snapshot')
                          and not exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
                                           where x.grantee = 0 or x.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated', 'service_role')))
                     from pg_class c where c.oid = to_regclass('public.privilege_hygiene_0040_snapshot')), false), ''),
  ('004', 'snapshot table public.privilege_hygiene_0040_snapshot present with (relname, acl, taken_at) (the paste post-check verified its 2 rows)',
         coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum) from pg_attribute a
                    where a.attrelid = to_regclass('public.privilege_hygiene_0040_snapshot') and a.attnum > 0 and not a.attisdropped)
                  = 'relname:text,acl:aclitem[],taken_at:timestamp with time zone', false), '')
)
select '000' as n,
       case when (select bool_and(ok) from hard) then 'LIVE' else 'NOT LIVE' end
         || ' (' || (select count(*) filter (where ok) from hard) || ' of ' || (select count(*) from hard) || ')' as verdict, 'overall' as detail
union all
select n, case when ok then 'OK' else 'FAIL' end || ' ' || label, detail from hard
order by 1;
