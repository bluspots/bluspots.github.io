-- Haven: ROLLBACK for 0040 (client TRUNCATE / REFERENCES / TRIGGER hygiene). DRAFT. Paste only if the founder asks.
-- One run, as the database owner. Re-grants to anon / authenticated exactly the TRUNCATE / REFERENCES / TRIGGER
-- privileges that public.jobs / public.profiles had before 0040 (from public.privilege_hygiene_0040_snapshot),
-- then drops the snapshot table. Refuses (changes nothing) if the snapshot is missing.
begin;
do $$
declare r record;
begin
  if to_regclass('public.privilege_hygiene_0040_snapshot') is null then
    raise exception '0040 rollback: snapshot missing or incomplete. Nothing was changed.';
  end if;
  if (select count(*) from public.privilege_hygiene_0040_snapshot where relname in ('jobs', 'profiles')) <> 2 then
    raise exception '0040 rollback: snapshot missing or incomplete. Nothing was changed.';
  end if;
  for r in
    select s.relname, x.privilege_type, g.rolname, x.is_grantable
      from public.privilege_hygiene_0040_snapshot s
      cross join lateral aclexplode(s.acl) x
      join pg_roles g on g.oid = x.grantee
     where s.relname in ('jobs', 'profiles') and g.rolname in ('anon', 'authenticated')
       and x.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  loop
    execute format('grant %s on table public.%I to %I%s', r.privilege_type, r.relname, r.rolname,
                   case when r.is_grantable then ' with grant option' else '' end);
  end loop;
end $$;
drop table public.privilege_hygiene_0040_snapshot;
commit;
