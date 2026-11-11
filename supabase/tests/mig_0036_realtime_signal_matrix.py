#!/usr/bin/env python3
"""MIG-0036 matrix: realtime job signal (jobs_signal_parties trigger + realtime.messages policy).

LOCAL THROWAWAY Postgres only. Never Supabase, never production, never staging.
Each database is built from this repo's migrations (master 0001 ... 0025, minimal 0021 shim) +
0027 (#88) + 0030 (#94) + 0032 (#95) (the live set), optionally the unapplied drafts
0026 / 0028 / 0029 / 0031, then 0036. The Supabase side is emulated faithfully:
  * anon / authenticated / service_role roles, Supabase's auth.uid() definition;
  * the REAL Supabase Realtime tenant schema (supabase/realtime priv/repo/tenant_db_dump_17.sql,
    commit 1a17fe34 2026-11-05, vendored byte-exact as tests/fixtures/
    supabase_realtime_tenant_schema_pg17.sql, sha256 42aacf25...): realtime.messages (partitioned,
    RLS on, Supabase grants), realtime.send, realtime.topic, realtime.authorize (the function the
    Realtime server runs when a client joins a private channel) and realtime.apply_rls (Postgres
    Changes RLS filter, used for the option-B evidence);
  * the database owner as a NON-superuser role with BYPASSRLS (Supabase's postgres:
    rolsuper=f, rolbypassrls=t) and Supabase's realtime grants to postgres. It temporarily
    holds supabase_realtime_admin membership only while the file runs (emulates supautils,
    which lets postgres manage policies on realtime.messages); the membership is revoked
    before any check, so broadcasts go through BYPASSRLS + grants exactly as in production.
Delivery model (Supabase docs + realtime.authorize): a client joined to private topic T gets
every private broadcast row inserted with topic T; joining T requires the SELECT policy to
show the probe row to that client's role/claims. So "U receives M" == authorize(U, M.topic)
read_allowed AND M.private. Checks print booleans / ids only; never coordinates.

Usage:
  HAVEN_PG='-h /tmp -p 54329 -U postgres' python3 supabase/tests/mig_0036_realtime_signal_matrix.py
Env:
  HAVEN_0036       file under test (default supabase/migrations/0036_realtime_job_signal.sql)
  HAVEN_DEPS       directory with 0027 / 0030 / 0032 (+ drafts) when not in supabase/migrations
  HAVEN_DB_PREFIX  database prefix (default codey0036_<pid>)
  HAVEN_QUICK=1    mutant mode: skip guard / CRLF / rollback / option-B / drafts groups and md5 pin
  HAVEN_KEEP_DBS=1 keep <prefix>_main
Exit code 0 only if every expectation holds.
"""
import hashlib, json, os, re, shlex, subprocess, sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
MIG = os.path.join(ROOT, 'migrations')
F36 = os.environ.get('HAVEN_0036') or os.path.join(MIG, '0036_realtime_job_signal.sql')
R36 = os.path.join(ROOT, 'rollback', '0036_realtime_job_signal_rollback.sql')
CHK_A = os.path.join(ROOT, 'checks', '0036a_check_before_READ_ONLY.sql')
CHK_B = os.path.join(ROOT, 'checks', '0036b_check_after_READ_ONLY.sql')
RT_DUMP = os.path.join(HERE, 'fixtures', 'supabase_realtime_tenant_schema_pg17.sql')
DEPS = os.environ.get('HAVEN_DEPS', '')
PSQL = ['psql'] + shlex.split(os.environ.get('HAVEN_PG', '-h /tmp -p 54329 -U postgres')) + ['-X', '-q', '-tA']
PREFIX = os.environ.get('HAVEN_DB_PREFIX', 'codey0036_%d' % os.getpid())
QUICK = bool(os.environ.get('HAVEN_QUICK'))
OWNER_ROLE = 'codey0036_owner'        # stands in for Supabase's postgres (no superuser, BYPASSRLS)
FN_MD5 = '93780698b9417349ca18262d29abd8ab'
SHA = {'0027': 'd2896728b6024d79935586e271eb83b3b0e798b87994c2bc2e48f1155b0d7cbc',
       '0030': '9155218d26ad5b883c603aea044cd18b2b9a6f488fd7e1119ba469098ca9a28d',
       '0032': '7e04de43c1df9d64ee7bf43be6e95ad4018c969b02c5704fd50572f1c7932532',
       'rt':   '42aacf25cc40b5a3cc8e7947a85734ae245d5ac514d2905ab3b9815321984b40'}
ALLOWED_KEYS = {'v', 'job_id', 'status', 'reason', 'at', 'id'}
FORBIDDEN_RE = re.compile(r'lat|lng|address|city|title|price|cents|fee|payment|materials|note|name|email|phone|'
                          r'customer|pro_id|preferences|tip|snapshot', re.I)

CLUSTER_ROLES = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin superuser nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'dashboard_user') then create role dashboard_user nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'codey0036_owner') then create role codey0036_owner nologin nosuperuser bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'codey0036_nobypass') then create role codey0036_nobypass nologin nosuperuser nobypassrls; end if;
end $$;
grant anon, authenticated, service_role to supabase_admin with admin option;
"""

SHIM = """
create schema if not exists auth;
create extension if not exists pgcrypto;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb, is_anonymous boolean not null default false);
create table if not exists auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), aal text, not_after timestamptz);
create table if not exists auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), factor_type text, status text);
create or replace function auth.jwt() returns jsonb language sql stable as
  $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
create or replace function auth.role() returns text language sql stable as
  $f$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '')::text $f$;
-- Supabase's definition (reads request.jwt.claim.sub first, as realtime.authorize sets it)
create or replace function auth.uid() returns uuid language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create publication supabase_realtime;
create schema if not exists realtime;
alter schema realtime owner to supabase_admin;
"""

# Realtime server creates daily partitions when clients connect (realtime.send does not).
PARTITIONS = """
set role supabase_realtime_admin;
do $$ declare d date; begin
  for d in select generate_series((now() at time zone 'utc')::date - 1, (now() at time zone 'utc')::date + 1, interval '1 day')::date loop
    execute format('create table if not exists realtime.%I partition of realtime.messages for values from (%L) to (%L)',
                   'messages_' || to_char(d, 'YYYY_MM_DD'), d, d + 1);
  end loop;
end $$;
reset role;
"""

# Supabase's grants for postgres on the realtime schema (from the tenant dump), given to the owner stand-in.
OWNER_SETUP = f"""
grant usage, create on schema public to {OWNER_ROLE};
alter table public.jobs owner to {OWNER_ROLE};
grant usage on schema realtime to {OWNER_ROLE};
grant select, insert on table realtime.messages to {OWNER_ROLE};
grant references, delete, trigger, truncate, update on table realtime.messages to {OWNER_ROLE};
grant all on function realtime.send(jsonb, text, text, boolean) to {OWNER_ROLE};
grant all on function realtime.topic() to {OWNER_ROLE};
grant usage on schema auth to {OWNER_ROLE};
"""

C1 = 'b79c42e9-6e09-4335-9035-a11ecf37d032'   # QA customer (local DB only)
P1 = '971c6625-afa7-455b-9b8b-672c8dc562d9'   # QA Pro (local DB only)
C2 = 'e0360000-0000-4000-8000-0000000000c2'   # third user: another customer
P2 = 'e0360000-0000-4000-8000-0000000000a2'   # new Pro (in range, free)
P3 = 'e0360000-0000-4000-8000-0000000000a3'   # unrelated Pro
SUB = {'C1': C1, 'P1': P1, 'C2': C2, 'P2': P2, 'P3': P3}
ACTORS = ['C1', 'P1', 'C2', 'P2', 'P3', 'anon', 'nosub', 'service_role']
JOBPT, NEARPT = ('27.111111', '-80.222222'), ('27.120000', '-80.230000')   # synthetic, never printed
J1 = 'e0360000-0000-4000-8000-0000000000f1'   # C1 / P1 en_route
J2 = 'e0360000-0000-4000-8000-0000000000f2'   # C1 posted
J3 = 'e0360000-0000-4000-8000-0000000000f3'   # C2 posted (unrelated)
RESULTS = []
NUM = re.compile(r'-?\d{1,3}\.\d{3,}')


def redact(x):
    return NUM.sub('<redacted>', str(x))


def psql(db, sql, stop=True):
    args = PSQL + ['-d', db] + (['-v', 'ON_ERROR_STOP=1'] if stop else [])
    return subprocess.run(args, input=sql, capture_output=True, text=True)


def must(db, sql):
    r = psql(db, sql)
    if r.returncode:
        raise SystemExit(f'psql failed on {db}:\n{redact(r.stderr)[-3000:]}')
    return r.stdout


def check(label, ok, detail=''):
    RESULTS.append(bool(ok))
    print(f"{'PASS' if ok else 'FAIL'} {label}{(': ' + redact(detail)[:300]) if detail != '' else ''}")


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def dep(prefix):
    for d in (MIG, DEPS):
        if d and os.path.isdir(d):
            hits = sorted(f for f in os.listdir(d) if f.startswith(prefix) and f.endswith('.sql'))
            if hits:
                return os.path.join(d, hits[0])
    raise SystemExit(f'{prefix} not found in supabase/migrations or HAVEN_DEPS')


def base_files():
    out = []
    for f in sorted(f for f in os.listdir(MIG) if re.match(r'^\d{4}.*\.sql$', f)):
        if f[:4] >= '0026':
            continue
        out.append(os.path.join(MIG, f))
        if f.startswith('0020'):
            out.append(None)
    return out


def job_insert(jid, cust, pro, st):
    acc = "'2026-11-11T05:00:00Z'" if pro else 'null'
    return ("insert into public.jobs(id, customer_id, pro_id, status, category, title, city_label, address_snapshot, lat, lng, "
            "fixed_customer_labor_price_cents, fixed_pro_labor_payout_cents, accepted_at, payment_snapshot) values "
            f"('{jid}', '{cust}', {'null' if pro is None else repr(pro)}, '{st}', 'Plumbing', 'job {jid[-2:]}', "
            f"'Test City', '1 Synthetic Test Way', {JOBPT[0]}, {JOBPT[1]}, 8900, 7120, {acc}, '{{\"note\":\"placeholder\"}}');\n")


def fixture_sql():
    users = [(C1, 'customer'), (C2, 'customer'), (P1, 'pro'), (P2, 'pro'), (P3, 'pro')]
    s = ''.join(f"insert into auth.users(id, email, raw_user_meta_data) values ('{u}', null, '{json.dumps({'role': r})}');\n"
                for u, r in users)
    s += "insert into public.profiles(id, role) select id, raw_user_meta_data->>'role' from auth.users on conflict (id) do nothing;\n"
    for pro in (P1, P2, P3):
        s += (f"update public.profiles set operating_lat = {NEARPT[0]}, operating_lng = {NEARPT[1]}, "
              f"pro_workspace = '{{\"travelRadius\":\"25\"}}' where id = '{pro}';\n")
    for jid, cust, pro, st in ((J1, C1, P1, 'en_route'), (J2, C1, None, 'posted'), (J3, C2, None, 'posted')):
        s += job_insert(jid, cust, pro, st)
    return s


def crlf(t):
    return t.replace('\r\n', '\n').replace('\n', '\r\n')


def apply_0036(db, path=None, as_role=OWNER_ROLE, text=None, expect_ok=True):
    body = text if text is not None else open(path or F36).read()
    pre = f"grant supabase_realtime_admin to {as_role};\nset role {as_role};\n" if as_role else ''
    post = f"\nreset role;\nrevoke supabase_realtime_admin from {as_role};\n" if as_role else ''
    r = psql(db, pre + body + post)
    if as_role and r.returncode:
        psql(db, f'reset role; revoke supabase_realtime_admin from {as_role};', stop=False)
    if expect_ok and r.returncode:
        raise SystemExit(f'0036 failed on {db}:\n{redact(r.stderr)[-3000:]}')
    return r


def build(db, realtime=True, drafts=False, with_0036=True, owner=OWNER_ROLE, rls_off=False, extra_policy=False):
    psql('postgres', f'drop database if exists {db};')
    must('postgres', f'create database {db};')
    must(db, CLUSTER_ROLES)
    must(db, SHIM)
    if realtime:
        must(db, open(RT_DUMP).read())
        must(db, PARTITIONS)
    for p in base_files():
        must(db, 'alter table public.profiles add column if not exists pro_workspace jsonb;' if p is None else open(p).read())
    for n in ('0027', '0030', '0032'):
        must(db, open(dep(n)).read())
    if drafts:
        for n in ('0026', '0028', '0029', '0031'):
            must(db, open(dep(n)).read())
    must(db, fixture_sql())
    if realtime:
        must(db, OWNER_SETUP.replace(OWNER_ROLE, owner))
        if rls_off:
            must(db, 'alter table realtime.messages disable row level security;')
        if extra_policy:
            must(db, 'create policy "authenticated can receive broadcasts" on realtime.messages for select to authenticated using (true);')
    if with_0036:
        apply_0036(db, as_role=owner if realtime else None)


def claims(who):
    if who == 'anon':
        return 'anon', {'role': 'anon'}, ''
    if who == 'nosub':
        return 'authenticated', {'role': 'authenticated'}, ''
    if who == 'service_role':
        return 'service_role', {'role': 'service_role'}, ''
    return 'authenticated', {'sub': SUB[who], 'role': 'authenticated'}, SUB[who]


def authorize(db, who, topic):
    """Exactly what the Realtime server runs on a private-channel join."""
    role, cl, sub = claims(who)
    sql = ("set role supabase_realtime_admin;\n"
           f"select read_allowed::text || '|' || write_allowed::text from realtime.authorize("
           f"'{role}', $t${topic}$t$, $c${json.dumps(cl)}$c$, '{sub}', '{{}}', array['broadcast','presence'], array['broadcast','presence']);\n")
    out = must(db, 'begin;\n' + sql + 'rollback;\n').strip().splitlines()[-1]
    r, w = out.split('|')
    rb, rp = [x == 't' for x in r.strip('{}').split(',')]
    wb, wp = [x == 't' for x in w.strip('{}').split(',')]
    return rb, rp, wb, wp


def as_actor(who):
    role, cl, sub = claims(who)
    return (f"set local role {role};\nselect set_config('request.jwt.claims', $c${json.dumps(cl)}$c$, true) \\g /dev/null\n"
            f"select set_config('request.jwt.claim.sub', '{sub}', true) \\g /dev/null\n")


OWNER = "reset role;\nselect set_config('request.jwt.claims', '', true) \\g /dev/null\nselect set_config('request.jwt.claim.sub', '', true) \\g /dev/null\n"


def run_and_collect(db, body, stop=True):
    """Run body in a transaction, return (rc, stderr, [messages inserted by it]). Rolled back."""
    sql = ("begin;\ncreate temp table _mark as select coalesce(max(inserted_at), 'epoch') m, array_agg(id) ids from realtime.messages;\n"
           + body + "\n" + OWNER +
           "select coalesce(json_agg(json_build_object('topic', topic, 'event', event, 'private', private, 'extension', extension, "
           "'payload', payload) order by topic), '[]') from realtime.messages where not (id = any (coalesce((select ids from _mark), '{}')));\n"
           "rollback;\n")
    r = psql(db, sql, stop=stop)
    lines = [l for l in r.stdout.strip().splitlines() if l.startswith('[')]
    msgs = json.loads(lines[-1]) if lines else None
    return r.returncode, r.stderr, msgs


def summarize(msgs):
    return sorted((m['topic'].split(':')[-1], m['payload'].get('reason'), m['payload'].get('status')) for m in msgs)


def payload_clean(msgs, job):
    for m in msgs:
        p = m['payload']
        if set(p) - ALLOWED_KEYS or FORBIDDEN_RE.search(' '.join(p.keys())):
            return False, f'keys {sorted(p)}'
        if p.get('v') != 1 or (job is not None and p.get('job_id') != job) or m['event'] != 'job_changed' or m['private'] is not True \
                or m['extension'] != 'broadcast' or not re.match(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$', p.get('at', '')):
            return False, 'shape'
        if NUM.search(json.dumps({k: v for k, v in p.items() if k != 'at'})):
            return False, 'numeric value in payload'
        if len(json.dumps(p)) > 220:
            return False, 'too large'
    return True, ''


def expect_signals(db, label, body, want, job, stop=True):
    rc, err, msgs = run_and_collect(db, body, stop=stop)
    if rc or msgs is None:
        check(label, False, f'rc={rc} {err[-300:]}')
        return None
    got = summarize(msgs)
    want_s = sorted((SUB[w], r, s) for w, r, s in want)
    check(label + ' (recipients/reasons/status)', got == want_s,
          '' if got == want_s else f'got {[(k[:8], r, s) for k, r, s in got]} want {[(k[:8], r, s) for k, r, s in want_s]}')
    ok, why = payload_clean(msgs, job)
    check(label + ' (payload minimal, private, job_changed)', ok, why)
    return msgs


def receivers(db, topics):
    out = set()
    for t in topics:
        for a in ACTORS:
            if a == 'service_role':
                continue   # server key; bypasses RLS by design (never shipped in the apps)
            if authorize(db, a, t)[0]:
                out.add(a)
    return out


# ───────────────────────────── groups ─────────────────────────────

def g_authorization(db):
    print('\n## A. Join authorization (realtime.authorize, as the Realtime server calls it)')
    topics = {f'jobs:user:{SUB[k]}': k for k in SUB}
    extra = ['jobs:user:' + C1.upper(), 'jobs:user:', 'jobs:user:%', 'jobs:board', 'user:' + C1, 'jobs:user:' + C1 + ' ',
             'jobs:user:' + C1 + ':x', 'realtime']
    for a in ACTORS:
        for t, owner in topics.items():
            rb, rp, wb, wp = authorize(db, a, t)
            if a == 'service_role':
                check(f'service_role (server key, bypasses RLS) can read {owner} topic; documented', rb)
                continue
            want = (a == owner)
            check(f'{a} read broadcast on jobs:user:<{owner}> == {want}', rb == want)
            check(f'{a} read presence on jobs:user:<{owner}> == False', rp is False)
            check(f'{a} write broadcast/presence on jobs:user:<{owner}> == False', wb is False and wp is False)
        if a != 'service_role':
            for t in extra:
                rb, rp, wb, wp = authorize(db, a, t)
                check(f'{a} cannot join odd topic {(t[:11] + "<" + t[11:].replace(C1, "C1").replace(C1.upper(), "C1-UPPER") + ">")!r}', not (rb or rp or wb or wp))


def g_direct_sql(db):
    print('\n## B. Direct SQL as clients on realtime.messages (defence in depth)')
    seed = OWNER + f"update public.jobs set title = 'x2' where id = '{J1}';\n"
    for who in ('C1', 'P1', 'C2', 'P3', 'anon', 'nosub'):
        for topic_owner in ('C1', 'P1'):
            body = seed + as_actor(who) + f"select set_config('realtime.topic', 'jobs:user:{SUB[topic_owner]}', true) \\g /dev/null\n" \
                   "select count(*) from realtime.messages;\n"
            r = psql(db, 'begin;\n' + body + 'rollback;\n', stop=False)
            n = [l for l in r.stdout.strip().splitlines() if l.isdigit()]
            want = 1 if who == topic_owner else 0
            check(f'{who} SELECT with realtime.topic=<{topic_owner}> sees {want} row(s)', n and int(n[-1]) == want, r.stderr[-200:])
        body = as_actor(who) + f"select set_config('realtime.topic', 'jobs:user:{SUB.get(who, C1)}', true) \\g /dev/null\n" \
               f"insert into realtime.messages(topic, extension, payload, event, private) values ('jobs:user:{SUB.get(who, C1)}', 'broadcast', '{{}}', 'job_changed', true);\n"
        r = psql(db, 'begin;\n' + body + 'rollback;\n')
        check(f'{who} cannot INSERT into realtime.messages (own topic)', r.returncode != 0 and 'row-level security' in r.stderr, r.stderr[-160:])
        r = psql(db, 'begin;\n' + seed + as_actor(who) + "update realtime.messages set payload = '{}' returning 1;\nrollback;\n")
        check(f'{who} UPDATE on realtime.messages touches 0 rows', r.returncode == 0 and '1' not in r.stdout.split(), r.stderr[-160:])
        r = psql(db, 'begin;\n' + as_actor(who) + "select public.jobs_signal_parties();\nrollback;\n")
        check(f'{who} cannot EXECUTE jobs_signal_parties()', r.returncode != 0 and 'permission denied' in r.stderr, r.stderr[-160:])


def g_delivery(db):
    print('\n## C. Job changes -> signals (who, reason, status) and payload shape')
    # normal app write (assigned Pro, RLS path, SECURITY INVOKER caller): en_route -> arrived
    m = expect_signals(db, 'Pro marks arrived (app write under RLS)',
                       as_actor('P1') + f"update public.jobs set status = 'arrived' where id = '{J1}';\n",
                       [('C1', 'updated', 'arrived'), ('P1', 'updated', 'arrived')], J1)
    if m is not None:
        check('arrived reaches exactly C1 + P1', receivers(db, {x['topic'] for x in m}) == {'C1', 'P1'})
    # admin release (0035 shape: back to posted, pro_id + accepted_at null)
    m = expect_signals(db, 'Admin release en_route -> posted (pro_id null)',
                       OWNER + f"update public.jobs set status = 'posted', pro_id = null, accepted_at = null where id = '{J1}';\n",
                       [('C1', 'updated', 'posted'), ('P1', 'removed', 'posted')], J1)
    if m is not None:
        check('release reaches the OLD Pro (P1) and the Customer, nobody else', receivers(db, {x['topic'] for x in m}) == {'C1', 'P1'})
    # admin cancel (0035 F-1: cancelled + pro unassigned in the same row update)
    m = expect_signals(db, 'Admin cancel en_route (F-1 clears pro_id)',
                       OWNER + f"update public.jobs set status = 'cancelled', pro_id = null, accepted_at = null, cancelled_at = now() where id = '{J1}';\n",
                       [('C1', 'updated', 'cancelled'), ('P1', 'removed', 'cancelled')], J1)
    if m is not None:
        check('cancel reaches Customer + Pro', receivers(db, {x['topic'] for x in m}) == {'C1', 'P1'})
    # cancel keeping the Pro (any other cancel path)
    expect_signals(db, 'Cancel with pro kept',
                   OWNER + f"update public.jobs set status = 'cancelled' where id = '{J1}';\n",
                   [('C1', 'updated', 'cancelled'), ('P1', 'updated', 'cancelled')], J1)
    # reassignment P1 -> P2 (privileged)
    m = expect_signals(db, 'Reassign P1 -> P2',
                       OWNER + f"update public.jobs set pro_id = '{P2}' where id = '{J1}';\n",
                       [('C1', 'updated', 'en_route'), ('P1', 'removed', 'en_route'), ('P2', 'added', 'en_route')], J1)
    if m is not None:
        check('reassignment reaches both Pros + Customer, not C2/P3/anon', receivers(db, {x['topic'] for x in m}) == {'C1', 'P1', 'P2'})
    # Pro claims a posted job through the real RPC
    expect_signals(db, 'P2 claims posted J2 via pro_claim_job',
                   as_actor('P2') + f"select public.pro_claim_job('{J2}') \\g /dev/null\n",
                   [('C1', 'updated', 'en_route'), ('P2', 'added', 'en_route')], J2)
    # Customer cancels own posted job (0010 policy, app write)
    expect_signals(db, 'Customer cancels own posted job (app write)',
                   as_actor('C1') + f"update public.jobs set status = 'cancelled' where id = '{J2}';\n",
                   [('C1', 'updated', 'cancelled')], J2)
    # customer change (privileged)
    expect_signals(db, 'customer_id change C1 -> C2',
                   OWNER + f"update public.jobs set customer_id = '{C2}' where id = '{J1}';\n",
                   [('C1', 'removed', 'en_route'), ('C2', 'added', 'en_route'), ('P1', 'updated', 'en_route')], J1)
    # non-status column change (display field)
    expect_signals(db, 'Non-status change (materials estimate) still signals',
                   OWNER + f"update public.jobs set materials_estimate_cents = 1234 where id = '{J1}';\n",
                   [('C1', 'updated', 'en_route'), ('P1', 'updated', 'en_route')], J1)
    # no-op update
    rc, err, msgs = run_and_collect(db, OWNER + f"update public.jobs set status = status where id = '{J1}';\n")
    check('No-op UPDATE sends nothing', rc == 0 and msgs == [], f'{msgs}')
    # insert by the customer (app path) and by owner
    rc, err, msgs = run_and_collect(db, as_actor('C1') +
                                    "insert into public.jobs(customer_id, status, category, title, city_label, fixed_customer_labor_price_cents, "
                                    f"fixed_pro_labor_payout_cents) values ('{C1}', 'posted', 'Plumbing', 'new', 'Test City', 8900, 7120);\n", stop=False)
    if rc == 0 and msgs is not None:
        check('Customer INSERT -> one "created" signal to C1 only', summarize(msgs) == [(C1, 'created', 'posted')], f'{summarize(msgs)}')
    else:
        print('INFO customer insert via RLS not possible in this fixture; owner insert used instead:', redact(err[-200:]))
    expect_signals(db, 'Owner INSERT with pro set',
                   OWNER + job_insert('e0360000-0000-4000-8000-0000000000f9', C2, P3, 'en_route'),
                   [('C2', 'created', 'en_route'), ('P3', 'created', 'en_route')], 'e0360000-0000-4000-8000-0000000000f9')
    # delete (owner only; no client has a DELETE policy)
    expect_signals(db, 'DELETE job -> removed, status null',
                   OWNER + f"delete from public.jobs where id = '{J1}';\n",
                   [('C1', 'removed', None), ('P1', 'removed', None)], J1)
    # third user's job never reaches C1/P1
    m = expect_signals(db, 'Unrelated job (C2) change',
                       OWNER + f"update public.jobs set title = 'y' where id = '{J3}';\n", [('C2', 'updated', 'posted')], J3)
    if m is not None:
        check('unrelated job reaches only C2', receivers(db, {x['topic'] for x in m}) == {'C2'})
    # bulk update: one signal per party per row
    rc, err, msgs = run_and_collect(db, OWNER + "update public.jobs set title = title || '.';\n")
    check('Bulk UPDATE of all jobs: one signal per party per row, all clean',
          rc == 0 and msgs is not None and len(msgs) == 4 and payload_clean(msgs, None)[0], f'{len(msgs or [])}')
    # en_route discard (0032) still works alongside
    r = psql(db, "begin;\n" + as_actor('P1') +
             f"select (public.pro_update_live_location('{J1}', 27.155555, -80.266666)->>'ok') \\g /dev/null\n" + OWNER +
             f"update public.jobs set status = 'arrived' where id = '{J1}';\n"
             f"select count(*) from public.job_live_locations where job_id = '{J1}';\nrollback;\n")
    check('0032 discard trigger still deletes the live point on arrived', r.returncode == 0 and r.stdout.strip().splitlines()[-1] == '0', r.stderr[-200:])
    # one_active_job_per_pro still enforced
    r = psql(db, "begin;\n" + as_actor('P1') + f"select set_config('request.jwt.claims', '', true) \\g /dev/null\nreset role;\n"
             f"update public.jobs set pro_id = '{P1}', status = 'en_route', accepted_at = now() where id = '{J3}';\nrollback;\n")
    check('one_active_job_per_pro still rejects a 2nd active job (and the trigger does not mask it)',
          r.returncode != 0 and 'one_active_job_per_pro' in r.stderr, r.stderr[-200:])
    # 0023 radius trigger still enforced through the claim RPC for a far Pro is covered by 0030 tests; quick sanity:
    r = psql(db, "begin;\n" + as_actor('P3') + f"select count(*) from public.pro_claim_job('{J3}');\nrollback;\n")
    check('pro_claim_job still works for an in-range free Pro (signals do not interfere)', r.returncode == 0 and r.stdout.strip().splitlines()[-1] == '1', r.stderr[-200:])


def g_failure(db):
    print('\n## D. A broadcast failure never blocks or rolls back the job write')
    cases = {
        'realtime.send raises (stub replaced)':
            "create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void "
            "language plpgsql as $f$ begin raise exception 'boom'; end $f$;\n",
        'realtime.send missing (dropped)': "drop function realtime.send(jsonb, text, text, boolean);\n",
        'owner lost EXECUTE on realtime.send': f"revoke all on function realtime.send(jsonb, text, text, boolean) from {OWNER_ROLE}, public;\n",
        'owner lost BYPASSRLS (insert blocked by RLS, send swallows it)': f"alter role {OWNER_ROLE} nobypassrls;\n",
        "no partition for today (Realtime not connected yet)":
            "do $$ declare r record; begin for r in select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid "
            "where i.inhparent = 'realtime.messages'::regclass loop execute format('drop table realtime.%I', r.relname); end loop; end $$;\n",
        'realtime.messages locked by another session (lock_timeout 1s)': None,
    }
    for label, breaker in cases.items():
        if breaker is None:
            continue
        body = (OWNER + breaker + as_actor('P1') +
                f"update public.jobs set status = 'arrived' where id = '{J1}' returning status;\n" + OWNER +
                f"select status from public.jobs where id = '{J1}';\n"
                f"select count(*) from realtime.messages where topic like 'jobs:user:%' and inserted_at > now() at time zone 'utc' - interval '1 minute';\n")
        r = psql(db, 'begin;\n' + body + 'rollback;\n')
        lines = r.stdout.strip().splitlines()
        check(f'{label}: job write commits-able, status arrived, no message', r.returncode == 0 and lines[-2:] == ['arrived', '0'] or
              (r.returncode == 0 and lines[-2] == 'arrived' and label.startswith('no partition')), f'{lines[-3:]} {r.stderr[-160:]}')
        check(f'{label}: a WARNING was raised (not an error)', 'WARNING' in r.stderr and 'ERROR' not in r.stderr, r.stderr[-160:])
    # lock contention: hold ACCESS EXCLUSIVE on realtime.messages in another session, job write must finish in ~1s
    import threading, time
    holder = subprocess.Popen(PSQL + ['-d', db], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    holder.stdin.write("begin; lock table realtime.messages in access exclusive mode; select 'locked';\n")
    holder.stdin.flush()
    time.sleep(0.8)
    t0 = time.time()
    r = psql(db, 'begin;\n' + as_actor('P1') + f"update public.jobs set status = 'arrived' where id = '{J1}' returning status;\ncommit;\n")
    dt = time.time() - t0
    holder.stdin.write('rollback;\n')
    holder.stdin.close()
    holder.wait(timeout=10)
    check('realtime.messages locked elsewhere: job write still commits within ~1 s (lock_timeout)',
          r.returncode == 0 and 'arrived' in r.stdout and dt < 3.5, f'{dt:.2f}s {r.stderr[-160:]}')
    must(db, OWNER + f"update public.jobs set status = 'en_route' where id = '{J1}';\n")
    # a rolled-back job write never broadcasts (messages are in the same transaction)
    r = psql(db, 'begin;\n' + as_actor('P1') + f"update public.jobs set status = 'arrived' where id = '{J1}';\nrollback;\n"
             f"select count(*) from realtime.messages where payload->>'job_id' = '{J1}' and payload->>'status' = 'arrived';\n")
    check('rolled-back job write leaves no broadcast row', r.returncode == 0 and r.stdout.strip().splitlines()[-1] == '0')


def g_catalog(db):
    print('\n## E. Catalog / grants / publication')
    q = lambda s: must(db, s).strip()
    if not QUICK:
        check('function body normalised md5 pinned', q("select md5(replace(prosrc, E'\\r', '')) from pg_proc where oid = 'public.jobs_signal_parties()'::regprocedure") == FN_MD5)
    check('function owned by the role that ran the file (postgres stand-in: BYPASSRLS, not superuser)',
          q("select pg_get_userbyid(proowner) from pg_proc where oid = 'public.jobs_signal_parties()'::regprocedure") == OWNER_ROLE)
    check('owner stand-in matches Supabase postgres attributes (rolsuper f, rolbypassrls t)',
          q(f"select rolsuper::text || rolbypassrls::text from pg_roles where rolname = '{OWNER_ROLE}'") == 'falsetrue')
    check('owner holds no supabase_realtime_admin membership after the paste',
          q(f"select count(*) from pg_auth_members where member = '{OWNER_ROLE}'::regrole") == '0')
    check('supabase_realtime publication still has no tables', q("select count(*) from pg_publication_tables where pubname = 'supabase_realtime'") == '0')
    check('exactly one policy on realtime.messages', q("select count(*) from pg_policies where schemaname='realtime' and tablename='messages'") == '1')
    check('no INSERT/UPDATE/DELETE/ALL policy on realtime.messages',
          q("select count(*) from pg_policies where schemaname='realtime' and tablename='messages' and cmd <> 'SELECT'") == '0')
    check('trigger list on jobs = 0023 radius + 0025 lock + 0032 discard + 0036 signal',
          q("select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid='public.jobs'::regclass and not tgisinternal")
          == 'jobs_discard_live_location,jobs_enforce_claim_radius,jobs_lock_materials_approved,jobs_signal_parties')
    check('0030 bodies unchanged', q("select string_agg(md5(replace(prosrc, E'\\r','')), ',' order by proname) from pg_proc where oid in "
                                     "('public.jobs_posted_within_radius()'::regprocedure, 'public.pro_claim_job(uuid)'::regprocedure, "
                                     "'public.get_assigned_job_destination(uuid)'::regprocedure)")
          == 'de20ad54497bc81c4619b09124900f4f,52b6bff79c99a734c8da2521ce6cbbb8,789cb65e77775da031012f78227d76ad')
    check('0032 trigger function unchanged', q("select md5(replace(prosrc, E'\\r','')) from pg_proc where oid='public.jobs_discard_live_location()'::regprocedure")
          == 'b8398f9d39127d4e6fb6c5a4082cf5d4')


def g_guards(prefix):
    print('\n## F. Version guard refusals (each in its own DB; nothing changed)')
    cases = [('no realtime schema', dict(realtime=False), None, 'Supabase Realtime schema missing'),
             ('RLS off on realtime.messages', dict(rls_off=True), None, 'RLS is OFF'),
             ('a broader policy already exists', dict(extra_policy=True), None, 'already has other policies'),
             ('owner without BYPASSRLS', dict(owner='codey0036_nobypass'), 'codey0036_nobypass', 'cannot broadcast')]
    for label, kw, role, needle in cases:
        db = f'{prefix}_g{len(RESULTS)}'
        build(db, with_0036=False, **kw)
        r = apply_0036(db, as_role=(role or (OWNER_ROLE if kw.get('realtime', True) else None)), expect_ok=False)
        n = must(db, "select count(*) from pg_proc where proname = 'jobs_signal_parties';").strip()
        check(f'guard refuses: {label}', r.returncode != 0 and needle in r.stderr and n == '0', next((l for l in r.stderr.splitlines() if 'ERROR' in l), ''))
        psql('postgres', f'drop database if exists {db};')
    # drifted function body
    db = f'{prefix}_gdrift'
    build(db)
    must(db, "create or replace function public.jobs_signal_parties() returns trigger language plpgsql security definer "
             "set search_path = pg_catalog, public, pg_temp as $f$ begin return null; end $f$;")
    r = apply_0036(db, expect_ok=False)
    check('guard refuses a drifted jobs_signal_parties() body', r.returncode != 0 and 'different body' in r.stderr)
    psql('postgres', f'drop database if exists {db};')
    # wrong caller (authenticated-ish non-owner)
    db = f'{prefix}_gcaller'
    build(db, with_0036=False)
    r = apply_0036(db, as_role='codey0036_nobypass', expect_ok=False)
    check('guard refuses a role without TRIGGER on public.jobs', r.returncode != 0 and 'no TRIGGER privilege' in r.stderr, r.stderr.strip().splitlines()[-1] if r.stderr else '')
    psql('postgres', f'drop database if exists {db};')


def g_rerun_crlf_rollback(prefix):
    print('\n## G. Re-run, CRLF paste, rollback, re-apply; 0026/0028/0029/0031 drafts present')
    db = f'{prefix}_rr'
    build(db)
    apply_0036(db)
    check('re-run is a no-op (still one policy, one trigger)', must(db, "select (select count(*) from pg_policies where schemaname='realtime') || ',' || "
          "(select count(*) from pg_trigger where tgname='jobs_signal_parties')").strip() == '1,1')
    r = psql(db, '\n'.join(['begin;', as_actor('P1'), f"update public.jobs set status='arrived' where id='{J1}';", OWNER,
                            "select count(*) from realtime.messages where topic like 'jobs:user:%';", 'rollback;']))
    check('after re-run one update -> exactly 2 signals (no duplicate trigger)', r.stdout.strip().splitlines()[-1] == '2', r.stderr[-200:])
    must(db, open(R36).read())
    check('rollback removes trigger, function, policy', must(db, "select (select count(*) from pg_policies where schemaname='realtime') + "
          "(select count(*) from pg_trigger where tgname='jobs_signal_parties') + (select count(*) from pg_proc where proname='jobs_signal_parties')").strip() == '0')
    r = psql(db, f"begin; update public.jobs set status='arrived' where id='{J1}'; select count(*) from realtime.messages; rollback;")
    check('after rollback job writes work and send nothing', r.returncode == 0 and r.stdout.strip().splitlines()[-1] == '0')
    r = psql(db, open(R36).read())
    check('rollback re-run is harmless (exit 0)', r.returncode == 0, r.stderr[-200:])
    apply_0036(db, text=crlf(open(F36).read()))
    check('CRLF paste applies; normalised md5 unchanged',
          must(db, "select md5(replace(prosrc, E'\\r','')) from pg_proc where proname='jobs_signal_parties'").strip() == FN_MD5)
    r = apply_0036(db, expect_ok=False)
    check('LF re-run over the CRLF paste is accepted', r.returncode == 0, r.stderr[-200:])
    psql('postgres', f'drop database if exists {db};')
    db = f'{prefix}_drafts'
    build(db, drafts=True)
    expect_signals(db, '[drafts 0026/0028/0029/0031] Pro marks arrived', as_actor('P1') + f"update public.jobs set status = 'arrived' where id = '{J1}';\n",
                   [('C1', 'updated', 'arrived'), ('P1', 'updated', 'arrived')], J1)
    expect_signals(db, '[drafts] Admin release', OWNER + f"update public.jobs set status = 'posted', pro_id = null, accepted_at = null where id = '{J1}';\n",
                   [('C1', 'updated', 'posted'), ('P1', 'removed', 'posted')], J1)
    psql('postgres', f'drop database if exists {db};')


def g_option_b(prefix):
    print('\n## H. Option B evidence: jobs in supabase_realtime, Postgres Changes RLS filter (realtime.apply_rls)')
    db = f'{prefix}_optb'
    build(db, with_0036=False)
    must(db, "alter publication supabase_realtime add table public.jobs;\n"
             f"insert into realtime.subscription(subscription_id, entity, claims) values "
             f"('00000000-0000-4000-8000-0000000000c1', 'public.jobs', '{{\"role\":\"authenticated\",\"sub\":\"{C1}\"}}'),"
             f"('00000000-0000-4000-8000-0000000000a1', 'public.jobs', '{{\"role\":\"authenticated\",\"sub\":\"{P1}\"}}'),"
             f"('00000000-0000-4000-8000-0000000000a2', 'public.jobs', '{{\"role\":\"authenticated\",\"sub\":\"{P2}\"}}');")

    def wal(action, jid):
        return (f"(select jsonb_build_object('action', '{action}', 'schema', 'public', 'table', 'jobs', "
                f"'pk', jsonb_build_array(jsonb_build_object('name','id','type','uuid','typeoid',2950)), "
                "'columns', (select jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, null), 'typeoid', a.atttypid, "
                "'value', to_jsonb(j) -> a.attname::text) order by a.attnum) from pg_attribute a where a.attrelid = 'public.jobs'::regclass and a.attnum > 0 and not a.attisdropped), "
                "'identity', jsonb_build_array(jsonb_build_object('name','id','type','uuid','typeoid',2950,'value', j.id))) "
                f"from public.jobs j where j.id = '{jid}')")

    def visible(sql_before):
        out = must(db, 'begin;\n' + sql_before + f"\nselect coalesce(string_agg(s::text, ','), '') || '|' || coalesce((select string_agg(k, ',' order by k) from "
                   f"jsonb_object_keys(r.wal->'record') k), '') from realtime.apply_rls({wal('U', J1)}) r, unnest(r.subscription_ids) s group by r.wal;\nrollback;\n")
        return out.strip().splitlines()
    rows = visible(f"update public.jobs set status = 'arrived' where id = '{J1}';")
    subs = ','.join(r.split('|')[0] for r in rows)
    keys = set(','.join(r.split('|')[1] for r in rows).split(','))
    check('B: normal update reaches C1 + P1 via Postgres Changes', 'c1' in subs and '0a1' in subs)
    check('B: ...and the pushed record carries address_snapshot, lat, lng, payment_snapshot, prices',
          {'address_snapshot', 'lat', 'lng', 'payment_snapshot', 'fixed_customer_labor_price_cents'} <= keys, sorted(keys & {'address_snapshot', 'lat', 'lng', 'payment_snapshot'}))
    rows = visible(f"update public.jobs set status = 'posted', pro_id = null, accepted_at = null where id = '{J1}';")
    subs = ','.join(r.split('|')[0] for r in rows)
    check('B: admin release does NOT reach the released Pro P1 (new-row RLS)', '0a1' not in subs and 'c1' in subs, subs)
    rows = visible(f"update public.jobs set status = 'cancelled', pro_id = null where id = '{J1}';")
    subs = ','.join(r.split('|')[0] for r in rows)
    check('B: admin cancel (F-1) does NOT reach the Pro either', '0a1' not in subs, subs)
    out = must(db, f"begin;\nselect coalesce(string_agg(s::text, ','), '') from realtime.apply_rls({wal('D', J1).replace(chr(39) + 'columns' + chr(39), chr(39) + 'x_columns' + chr(39))}) r, unnest(r.subscription_ids) s;\nrollback;\n").strip()
    check('B: a DELETE event goes to EVERY jobs subscriber (no RLS on deletes), incl. unrelated Pro P2', '0a2' in out and '0a1' in out, out)
    psql('postgres', f'drop database if exists {db};')


def g_checks(prefix):
    print('\n## I. Read-only before/after checks (0036a / 0036b)')
    if not (os.path.exists(CHK_A) and os.path.exists(CHK_B)):
        check('check files exist', False)
        return
    db = f'{prefix}_chk'
    build(db, with_0036=False)
    a = must(db, 'begin read only;\n' + open(CHK_A).read() + '\nrollback;\n')
    check('0036a before paste: READY', a.splitlines()[0].startswith('00|READY'), a.splitlines()[0])
    b = must(db, 'begin read only;\n' + open(CHK_B).read() + '\nrollback;\n')
    check('0036b before paste: NOT LIVE', 'NOT LIVE' in b.splitlines()[0], b.splitlines()[0])
    apply_0036(db)
    a = must(db, 'begin read only;\n' + open(CHK_A).read() + '\nrollback;\n')
    check('0036a after paste: READY (already applied)', a.splitlines()[0].startswith('00|READY: already applied'), a.splitlines()[0])
    b = must(db, 'begin read only;\n' + open(CHK_B).read() + '\nrollback;\n')
    check('0036b after paste: LIVE', b.splitlines()[0].startswith('000|LIVE'), b.splitlines()[0])
    b2 = must(db, 'begin read only;\n' + crlf(open(CHK_B).read()) + '\nrollback;\n')
    check('0036b CRLF paste: LIVE', b2.splitlines()[0].startswith('000|LIVE'))
    must(db, 'create policy "authenticated can receive broadcasts" on realtime.messages for select to authenticated using (true);')
    b = must(db, 'begin read only;\n' + open(CHK_B).read() + '\nrollback;\n')
    check('0036b with an extra broad policy: NOT LIVE', 'NOT LIVE' in b.splitlines()[0])
    a = must(db, 'begin read only;\n' + open(CHK_A).read() + '\nrollback;\n')
    check('0036a with an extra broad policy: NOT READY', 'NOT READY' in a.splitlines()[0])
    must(db, 'drop policy "authenticated can receive broadcasts" on realtime.messages; grant execute on function public.jobs_signal_parties() to authenticated;')
    b = must(db, 'begin read only;\n' + open(CHK_B).read() + '\nrollback;\n')
    check('0036b with EXECUTE granted to authenticated: NOT LIVE', 'NOT LIVE' in b.splitlines()[0])
    must(db, 'revoke execute on function public.jobs_signal_parties() from authenticated; alter table public.jobs disable trigger jobs_signal_parties;')
    b = must(db, 'begin read only;\n' + open(CHK_B).read() + '\nrollback;\n')
    check('0036b with the trigger disabled: NOT LIVE', 'NOT LIVE' in b.splitlines()[0])
    psql('postgres', f'drop database if exists {db};')
    db = f'{prefix}_chk2'
    build(db, with_0036=False, extra_policy=True)
    a = must(db, 'begin read only;\n' + open(CHK_A).read() + '\nrollback;\n')
    check('0036a with a pre-existing broad policy: NOT READY', 'NOT READY' in a.splitlines()[0], a.splitlines()[0])
    psql('postgres', f'drop database if exists {db};')


FOUNDER = 'e0360000-0000-4000-8000-0000000000ff'
FSESSION = 'e0360000-0000-4000-8000-00000000005e'


def fcc_apply(db):
    for n in ('hub_0034', 'hub_0035_', 'hub_0035a'):
        must(db, open(dep(n)).read())
    must(db, f"insert into auth.users(id) values ('{FOUNDER}');\n"
             f"insert into auth.sessions(id, user_id, aal) values ('{FSESSION}', '{FOUNDER}', 'aal2');\n"
             f"insert into haven_admin.admin_roles(user_id, role, granted_by) values ('{FOUNDER}', 'founder', 'codey0036-local-test');\n"
             "update haven_admin.settings set value = 'staging' where key = 'environment';\n"
             "insert into haven_admin.settings(key, value) values ('admin_writes_enabled', 'true') on conflict (key) do update set value = 'true';\n")


def as_founder():
    import time
    cl = {'sub': FOUNDER, 'role': 'authenticated', 'aal': 'aal2', 'session_id': FSESSION,
          'amr': [{'method': 'totp', 'timestamp': int(time.time()) - 5}]}
    return (f"set local role authenticated;\nselect set_config('request.jwt.claims', $c${json.dumps(cl)}$c$, true) \\g /dev/null\n"
            f"select set_config('request.jwt.claim.sub', '{FOUNDER}', true) \\g /dev/null\n")


def admin_op(op, job, status, pro=None):
    pv = 'admin_cancel_job_preview' if op == 'cancel' else 'admin_release_pro_preview'
    commit = (f"public.admin_cancel_job('{job}', '{status}', 'local test', :'tok', gen_random_uuid())" if op == 'cancel' else
              f"public.admin_release_pro('{job}', '{status}', '{pro}', 'local test', :'tok', gen_random_uuid())")
    return (as_founder() + f"select public.{pv}('{job}')->>'confirm_token' as tok \\gset\n"
            f"select ({commit})->>'ok' as committed \\gset\n" + OWNER)


def g_fcc(prefix):
    print('\n## J. Founder Control Center drafts 0034 / 0035 / 0035a (Hub #6/#7): either order, real admin RPCs')
    for order in ('0036 first', '0034/0035 first'):
        db = f'{prefix}_fcc{len(RESULTS)}'
        build(db, with_0036=(order == '0036 first'))
        fcc_apply(db)
        if order != '0036 first':
            apply_0036(db)
        check(f'[{order}] 0035 baseline guard still clean', must(db, 'select coalesce(haven_admin.baseline_mismatches(), \'clean\');').strip() == 'clean')
        m = expect_signals(db, f'[{order}] Founder RELEASES the Pro (admin_release_pro)', admin_op('release', J1, 'en_route', P1),
                           [('C1', 'updated', 'posted'), ('P1', 'removed', 'posted')], J1)
        if m is not None:
            check(f'[{order}] admin release reaches the released Pro + Customer only', receivers(db, {x['topic'] for x in m}) == {'C1', 'P1'})
        m = expect_signals(db, f'[{order}] Founder CANCELS en_route job (admin_cancel_job, F-1 unassigns)', admin_op('cancel', J1, 'en_route'),
                           [('C1', 'updated', 'cancelled'), ('P1', 'removed', 'cancelled')], J1)
        if m is not None:
            check(f'[{order}] admin cancel reaches Customer + Pro only', receivers(db, {x['topic'] for x in m}) == {'C1', 'P1'})
        expect_signals(db, f'[{order}] Founder CANCELS a posted job', admin_op('cancel', J2, 'posted'), [('C1', 'updated', 'cancelled')], J2)
        rc, err, msgs = run_and_collect(db, OWNER + "insert into haven_admin.settings(key, value) values ('zz_test', 'x');\n"
                                            "select count(*) from haven_admin.audit_log \\g /dev/null\n")
        check(f'[{order}] audit / settings writes send nothing', rc == 0 and msgs == [], f'{msgs}')
        psql('postgres', f'drop database if exists {db};')


def main():
    print(f'0036 under test: {F36} sha256 {sha(F36)}')
    for n in ('0027', '0030', '0032'):
        h = sha(dep(n))
        print(f'{n}: {dep(n)} sha256 {h}', '' if h == SHA[n] else '(DIFFERS from the live file)')
    print('realtime tenant schema sha256', sha(RT_DUMP), '' if sha(RT_DUMP) == SHA['rt'] else '(DIFFERS)')
    main_db = f'{PREFIX}_main'
    try:
        build(main_db)
        g_authorization(main_db)
        g_direct_sql(main_db)
        g_delivery(main_db)
        g_failure(main_db)
        g_catalog(main_db)
        if not QUICK:
            g_guards(PREFIX)
            g_rerun_crlf_rollback(PREFIX)
            g_option_b(PREFIX)
            g_checks(PREFIX)
            g_fcc(PREFIX)
    finally:
        out = must('postgres', f"select string_agg(datname, ' ') from pg_database where datname like '{PREFIX}%';").strip()
        for d in out.split():
            if d == main_db and os.environ.get('HAVEN_KEEP_DBS'):
                continue
            psql('postgres', f'drop database if exists {d};')
    n, ok = len(RESULTS), sum(RESULTS)
    print(f'\nRESULT {ok}/{n} passed')
    sys.exit(0 if n and ok == n else 1)


if __name__ == '__main__':
    main()
