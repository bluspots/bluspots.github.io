#!/usr/bin/env python3
"""MIG-0040 local matrix: anon / authenticated lose TRUNCATE / REFERENCES / TRIGGER on jobs and profiles.

LOCAL ONLY: throwaway Postgres 17 (default -h /tmp -p 54329), databases HAVEN_DB_PREFIX_*, dropped at the end.
Never point it at Supabase. Uses the 0036 harness from Customer PR #97 (HAVEN_0036_TESTS = its tests dir;
HAVEN_DEPS = 0026-0032 + Hub FCC). Two stacks: the harness grants (Supabase defaults), and the PRODUCTION jobs
grants read by CoS on 2026-11-12 (no client DELETE; service_role only REFERENCES / TRIGGER / TRUNCATE).
Env: HAVEN_0040 (file under test), HAVEN_QUICK=1 (mutant mode: production-grant stack only)."""
import os, re, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get('HAVEN_0036_TESTS', HERE))
os.environ.setdefault('HAVEN_DB_PREFIX', 'codey0040_%d' % os.getpid())
import mig_0036_realtime_signal_matrix as b   # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, '..'))
F40 = os.environ.get('HAVEN_0040') or os.path.join(ROOT, 'migrations', '0040_client_table_privilege_hygiene.sql')
R40 = os.path.join(ROOT, 'rollback', '0040_client_table_privilege_hygiene_rollback.sql')
CHK_A = os.path.join(ROOT, 'checks', '0040a_check_before_READ_ONLY.sql')
CHK_B = os.path.join(ROOT, 'checks', '0040b_check_after_READ_ONLY.sql')
PREFIX = os.environ['HAVEN_DB_PREFIX']
QUICK = os.environ.get('HAVEN_QUICK') == '1'
C1, P1, P2, J1, J3 = b.C1, b.P1, b.P2, b.J1, b.J3
check, must, psql = b.check, b.must, b.psql
PROD_JOBS_GRANTS = ("revoke delete on table public.jobs from anon, authenticated;\n"
                    "revoke select, insert, update, delete on table public.jobs from service_role;\n")
ACL = ("select string_agg(c.relname || ':' || coalesce(r.rolname, 'PUBLIC') || ':' || x.privilege_type || ':' || x.is_grantable::text || ':' || pg_get_userbyid(x.grantor), ',' "
       "order by c.relname, coalesce(r.rolname, 'PUBLIC'), x.privilege_type) from pg_class c cross join lateral aclexplode(c.relacl) x "
       "left join pg_roles r on r.oid = x.grantee where c.oid in ('public.jobs'::regclass, 'public.profiles'::regclass);")
TRIO = ('TRUNCATE', 'REFERENCES', 'TRIGGER')


def owner_of(db):
    return must(db, "select pg_get_userbyid(relowner) from pg_class where oid = 'public.jobs'::regclass;").strip()


def apply(db, text=None, role='owner', expect_ok=True):
    role = owner_of(db) if role == 'owner' else role
    r = psql(db, f'set role {role};\n' + (text if text is not None else open(F40).read()))
    if expect_ok and r.returncode:
        raise SystemExit(f'0040 failed on {db}:\n{b.redact(r.stderr)[-1500:]}')
    return r


def chk(db, path):
    return [l.split('|') for l in psql(db, 'begin read only;\n' + open(path).read() + 'rollback;\n').stdout.strip().splitlines() if '|' in l]


def acl(db):
    return must(db, ACL).strip().split(',')


def client_trio(db):
    return [a for a in acl(db) if a.split(':')[1] in ('anon', 'authenticated') and a.split(':')[2] in TRIO]


def app_paths(db, label):
    r = psql(db, 'begin;\n' + b.as_actor('C1') + f"select count(*) from public.jobs where id = '{J1}';\ncommit;\n", stop=False)
    check(f'[{label}] Customer reads own job', 'ERROR' not in r.stderr and r.stdout.strip().endswith('1'), b.redact(r.stderr)[-160:])
    r = psql(db, 'begin;\n' + b.as_actor('C1') + f"update public.profiles set display_name = display_name where id = '{C1}';\ncommit;\n", stop=False)
    check(f'[{label}] Customer updates own profile', 'ERROR' not in r.stderr, b.redact(r.stderr)[-160:])
    r = psql(db, 'begin;\n' + b.as_actor('P1') + f"update public.jobs set status = 'arrived' where id = '{J1}' and status = 'en_route';\ncommit;\n", stop=False)
    check(f'[{label}] assigned Pro en_route -> arrived', 'ERROR' not in r.stderr and must(db, f"select status from public.jobs where id = '{J1}';").strip() == 'arrived', b.redact(r.stderr)[-160:])
    r = psql(db, 'begin;\n' + b.as_actor('P2') + f"select count(*) from public.pro_claim_job('{J3}');\ncommit;\n", stop=False)
    check(f'[{label}] another Pro claims a posted job (pro_claim_job)', 'ERROR' not in r.stderr and must(db, f"select status from public.jobs where id = '{J3}';").strip() == 'en_route', b.redact(r.stderr)[-160:])
    must(db, "begin;\nset local session_replication_role = replica;\n"
             f"update public.jobs set status = 'en_route', pro_id = '{P1}' where id = '{J1}';\n"
             f"update public.jobs set status = 'posted', pro_id = null, accepted_at = null where id = '{J3}';\ncommit;\n")


def g_stack(db, label, prod_grants):
    print(f'\n## {label}')
    b.build(db)
    must(db, f'alter table public.profiles owner to {b.OWNER_ROLE};')   # production: postgres owns jobs and profiles
    if prod_grants:
        must(db, PROD_JOBS_GRANTS)
    before = acl(db)
    trio = client_trio(db)
    print('   client TRUNCATE/REFERENCES/TRIGGER before:', ','.join(sorted(set(a.rsplit(':', 2)[0] for a in trio))))
    check(f'[{label}] baseline: anon and authenticated hold TRUNCATE / REFERENCES / TRIGGER on jobs (as on production)',
          all(any(a.startswith(f'jobs:{ro}:{p}:') for a in trio) for ro in ('anon', 'authenticated') for p in TRIO), trio)
    rows = chk(db, CHK_A)
    check(f'[{label}] 0040a before: READY (4 of 4)', rows and rows[0][1] == 'READY (4 of 4)', rows[:1])
    check(f'[{label}] 0040b before: NOT LIVE', chk(db, CHK_B)[0][1].startswith('NOT LIVE'))
    if not QUICK:
        r = apply(db, role='authenticated', expect_ok=False)
        check(f'[{label}] as a client role -> refused, nothing changed', r.returncode != 0 and acl(db) == before, b.redact(r.stderr)[-160:])
    apply(db, b.crlf(open(F40).read()) if not QUICK else None)
    after = acl(db)
    check(f'[{label}] after: no TRUNCATE / REFERENCES / TRIGGER for anon / authenticated on jobs or profiles', client_trio(db) == [], client_trio(db))
    check(f'[{label}] after: every other grant byte-identical (SELECT/INSERT/UPDATE/DELETE, service_role, owner, grantors)',
          after == [a for a in before if not (a.split(':')[1] in ('anon', 'authenticated') and a.split(':')[2] in TRIO)], (len(before), len(after)))
    for ro, t in (('C1', 'public.jobs'), ('C1', 'public.profiles'), (None, 'public.jobs'), (None, 'public.profiles')):
        r = psql(db, 'begin;\n' + b.as_actor(ro or 'anon') + f'truncate {t};\nrollback;\n', stop=False)
        check(f'[{label}] {ro or "anon"} TRUNCATE {t} -> permission denied', 'permission denied' in r.stderr, b.redact(r.stderr)[-120:])
    app_paths(db, label)
    rows = chk(db, CHK_B)
    check(f'[{label}] 0040b after: LIVE (4 of 4)', rows and rows[0][1] == 'LIVE (4 of 4)', rows)
    rows = chk(db, CHK_A)
    check(f'[{label}] 0040a after: READY: already applied (4 of 4)', rows and rows[0][1] == 'READY: already applied (4 of 4)', rows[:1])
    snap = must(db, "select string_agg(relname || ' ' || (acl::text <> '') || ' ' || taken_at::text, ';' order by relname) from public.privilege_hygiene_0040_snapshot;").strip()
    check(f'[{label}] snapshot: 2 rows (jobs, profiles)', snap.count(';') == 1 and snap.startswith('jobs '), snap[:40])
    for who in ('C1', 'anon', 'service_role'):
        r = psql(db, 'begin;\n' + b.as_actor(who) + 'select count(*) from public.privilege_hygiene_0040_snapshot;\nrollback;\n', stop=False)
        check(f'[{label}] snapshot not readable by {who}', 'permission denied' in r.stderr, b.redact(r.stderr)[-120:])
    if QUICK:
        return
    check(f'[{label}] re-run is a no-op (snapshot kept, ACL unchanged)', apply(db, expect_ok=False).returncode == 0 and acl(db) == after
          and must(db, "select string_agg(relname || ' ' || (acl::text <> '') || ' ' || taken_at::text, ';' order by relname) from public.privilege_hygiene_0040_snapshot;").strip() == snap)
    must(db, f'set role {owner_of(db)};\n' + open(R40).read())
    check(f'[{label}] rollback restores the exact pre-0040 ACL of jobs and profiles (grantee, privilege, grant option, grantor)', acl(db) == before, set(before) ^ set(acl(db)))
    check(f'[{label}] rollback drops the snapshot table', must(db, "select (to_regclass('public.privilege_hygiene_0040_snapshot') is null)::text;").strip() == 'true')
    check(f'[{label}] 0040b after rollback: NOT LIVE', chk(db, CHK_B)[0][1].startswith('NOT LIVE'))
    r = psql(db, f'set role {owner_of(db)};\n' + open(R40).read())
    check(f'[{label}] rollback without a snapshot -> refused', r.returncode != 0 and 'snapshot missing' in r.stderr, b.redact(r.stderr)[-120:])
    apply(db)
    check(f'[{label}] re-apply after rollback', client_trio(db) == [] and acl(db) == after)
    must(db, f'set role {owner_of(db)};\n' + open(R40).read())
    must(db, "create table public.privilege_hygiene_0040_snapshot (x int);")
    r = apply(db, expect_ok=False)
    check(f'[{label}] a foreign privilege_hygiene_0040_snapshot table -> refused, nothing changed', r.returncode != 0 and 'other columns' in r.stderr and acl(db) == before, b.redact(r.stderr)[-120:])
    must(db, 'drop table public.privilege_hygiene_0040_snapshot;')


def g_static():
    for path in (CHK_A, CHK_B):
        t = open(path).read().lower()
        t = re.sub(r"'(?:[^']|'')*'", "''", re.sub(r'--[^\n]*', '', t))
        check(f'{os.path.basename(path)} is one read-only SELECT (no DML/DDL)',
              not any(k in t for k in ('insert ', 'update ', 'delete ', 'create ', 'alter ', 'drop ', 'grant ', 'revoke ', 'truncate ')))


def main():
    print(f'0040 under test: {F40} sha256 {b.sha(F40)}')
    try:
        g_stack(f'{PREFIX}_prod', 'production jobs grants', True)
        if not QUICK:
            g_stack(f'{PREFIX}_dflt', 'Supabase-default (harness) grants', False)
            g_static()
    finally:
        out = must('postgres', f"select string_agg(datname, ' ') from pg_database where datname like '{PREFIX}%';").strip()
        for d in out.split():
            psql('postgres', f'drop database if exists {d};')
    n, ok = len(b.RESULTS), sum(b.RESULTS)
    print(f'\nRESULT {ok}/{n} passed')
    sys.exit(0 if n and ok == n else 1)


if __name__ == '__main__':
    main()
