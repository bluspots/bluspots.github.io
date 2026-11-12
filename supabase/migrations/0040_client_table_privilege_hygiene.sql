-- Haven shared backend: client roles lose TRUNCATE / REFERENCES / TRIGGER on jobs and profiles (MIG-0040)
-- DRAFT. OPTIONAL HYGIENE. NOT APPLIED. Do not merge. Paste only after the founder authorizes it in his own words.
--
-- WHY. Supabase's default privileges grant every table privilege to anon / authenticated / service_role.
-- Haven's migrations narrowed SELECT / INSERT / UPDATE / DELETE, but never TRUNCATE, REFERENCES or TRIGGER.
-- CoS's read-only production probe (2026-11-12 4:31 PM ET) shows on public.jobs:
--   anon REFERENCES, TRIGGER, TRUNCATE; authenticated ... REFERENCES, TRIGGER, TRUNCATE (plus INSERT/SELECT/UPDATE).
-- TRUNCATE ignores RLS. PostgREST cannot issue TRUNCATE (or CREATE TRIGGER / a foreign key), so this is not
-- reachable through the app API today. It is defence in depth against any future SQL path for those roles.
-- No app path uses these privileges: REFERENCES / TRIGGER need DDL, which client roles never run.
--
-- WHAT IT DOES (and nothing else):
--   1. snapshots the current ACL of public.jobs and public.profiles into an owner-only table
--      public.privilege_hygiene_0040_snapshot (no RLS policies, no client grants), for an exact rollback;
--   2. revoke truncate, references, trigger on public.jobs     from anon, authenticated;
--      revoke truncate, references, trigger on public.profiles from anon, authenticated.
-- Unchanged: SELECT / INSERT / UPDATE / DELETE and every column grant, RLS, policies, functions, service_role
-- (its TRUNCATE / REFERENCES / TRIGGER on jobs stay; OPEN), every other table, default privileges (OPEN).
-- Other public tables: 0027 (materials_*, tips, earnings_statements, job_status_events), 0032/0037
-- (job_live_locations, job_live_sessions, job_live_session_stops) and 0038 (job_pro_releases) already revoke
-- ALL from anon / authenticated, so only jobs and profiles still carry these three privileges for clients.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor as ONE run, as the database owner (postgres).
-- Order: checks/0040a (read-only, row 00 READY) -> this file -> checks/0040b (row 000 LIVE).
-- Rollback: supabase/rollback/0040_client_table_privilege_hygiene_rollback.sql (re-grants exactly what was revoked).

begin;

-- ---------------------------------------------------------------- 0. guards (refuse, change nothing)
do $$
begin
  if to_regclass('public.jobs') is null or to_regclass('public.profiles') is null then
    raise exception '0040: public.jobs or public.profiles missing. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_roles where rolname in ('anon')) or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception '0040: roles anon / authenticated missing. Nothing was changed.';
  end if;
  if not pg_has_role(current_user, (select relowner from pg_class where oid = 'public.jobs'::regclass), 'MEMBER')
     or not pg_has_role(current_user, (select relowner from pg_class where oid = 'public.profiles'::regclass), 'MEMBER')
     or not has_schema_privilege(current_user, 'public', 'create') then
    raise exception '0040: run as the owner of public.jobs / public.profiles (postgres), not %. Nothing was changed.', current_user;
  end if;
  if to_regclass('public.privilege_hygiene_0040_snapshot') is not null
     and (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum)
            from pg_attribute a where a.attrelid = to_regclass('public.privilege_hygiene_0040_snapshot') and a.attnum > 0 and not a.attisdropped)
         is distinct from 'relname:text,acl:aclitem[],taken_at:timestamp with time zone' then
    raise exception '0040: public.privilege_hygiene_0040_snapshot exists with other columns. Nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------- 1. snapshot (first run only; a re-run keeps the original)
create table if not exists public.privilege_hygiene_0040_snapshot (
  relname text primary key,
  acl aclitem[],
  taken_at timestamptz not null default now()
);
alter table public.privilege_hygiene_0040_snapshot enable row level security;
revoke all on table public.privilege_hygiene_0040_snapshot from public, anon, authenticated, service_role;
comment on table public.privilege_hygiene_0040_snapshot is
  'MIG-0040: ACL of public.jobs / public.profiles before 0040, for its exact rollback. Owner-only; no location or personal data.';
insert into public.privilege_hygiene_0040_snapshot(relname, acl)
select c.relname::text, c.relacl from pg_class c
 where c.oid in ('public.jobs'::regclass, 'public.profiles'::regclass)
on conflict (relname) do nothing;

-- ---------------------------------------------------------------- 2. the revokes
revoke truncate, references, trigger on table public.jobs     from anon, authenticated;
revoke truncate, references, trigger on table public.profiles from anon, authenticated;

-- ---------------------------------------------------------------- 3. post-checks (any failure rolls back)
do $$
declare r record;
begin
  for r in select t, ro from unnest(array['public.jobs', 'public.profiles']) t, unnest(array['anon', 'authenticated']) ro loop
    if has_table_privilege(r.ro, r.t, 'truncate') or has_table_privilege(r.ro, r.t, 'references') or has_table_privilege(r.ro, r.t, 'trigger') then
      raise exception '0040 post-check: % still has TRUNCATE / REFERENCES / TRIGGER on % (PUBLIC grant?). Rolled back.', r.ro, r.t;
    end if;
  end loop;
  if exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = 'privilege_hygiene_0040_snapshot'
                and g.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role'))
     or not (select relrowsecurity from pg_class where oid = 'public.privilege_hygiene_0040_snapshot'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'privilege_hygiene_0040_snapshot')
     or (select count(*) from public.privilege_hygiene_0040_snapshot) <> 2 then
    raise exception '0040 post-check: snapshot table is not owner-only with 2 rows. Rolled back.';
  end if;
end $$;

commit;
