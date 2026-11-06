#!/usr/bin/env python3
"""MIG-0032 matrix: live tracking v1 (job_live_locations + pro_update_live_location +
get_job_live_location + jobs_discard_live_location trigger).

LOCAL THROWAWAY Postgres only. Never Supabase, never production.
Builds databases from this repo's migrations (0001 ... latest on master, excluding
0032) + 0027 (PR #88, HAVEN_0027 unless already in supabase/migrations) + 0030
(PR #94 head 21ee835b, HAVEN_0030 unless already in supabase/migrations), emulating
Supabase (anon / authenticated / service_role, auth.uid() from request.jwt.claims,
Supabase default privileges, an empty supabase_realtime publication).
Every check runs in its own transaction and is rolled back unless stated.

Coordinates: fixture points are synthetic test values. Output NEVER prints a
coordinate: checks compare inside SQL / Python and print booleans or redacted text.

Usage:
  HAVEN_PG='-h /tmp -p 54329 -U postgres' HAVEN_0027=/path/0027.sql HAVEN_0030=/path/0030.sql \
    python3 supabase/tests/mig_0032_live_location_matrix.py
Env:
  HAVEN_0032       file under test (default supabase/migrations/0032_job_live_location.sql; mutants override)
  HAVEN_DB_PREFIX  database name prefix (default codey0032_<pid>)
  HAVEN_KEEP_DBS=1 keep <prefix>_main (the PostgREST smoke uses it)
  HAVEN_QUICK=1    skip the version-guard / CRLF / rollback group (mutant runs)
Exit code 0 only if every expectation holds.
"""
import hashlib, json, os, re, shlex, subprocess, sys, time

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
MIG = os.path.join(ROOT, 'migrations')
F32 = os.environ.get('HAVEN_0032') or os.path.join(MIG, '0032_job_live_location.sql')
R32 = os.path.join(ROOT, 'rollback', '0032_job_live_location_rollback.sql')
PSQL = ['psql'] + shlex.split(os.environ.get('HAVEN_PG', '-h /tmp -p 54329 -U postgres')) + ['-X', '-q', '-tA']
PREFIX = os.environ.get('HAVEN_DB_PREFIX', 'codey0032_%d' % os.getpid())
QUICK = bool(os.environ.get('HAVEN_QUICK'))
SHA_0027 = 'd2896728b6024d79935586e271eb83b3b0e798b87994c2bc2e48f1155b0d7cbc'
SHA_0030 = '9155218d26ad5b883c603aea044cd18b2b9a6f488fd7e1119ba469098ca9a28d'
MD5_0030 = {'public.jobs_posted_within_radius()': '52b6bff79c99a734c8da2521ce6cbbb8',
            'public.pro_claim_job(uuid)': '789cb65e77775da031012f78227d76ad',
            'public.get_assigned_job_destination(uuid)': 'de20ad54497bc81c4619b09124900f4f'}

SHIM = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create publication supabase_realtime;
"""

# ── actors (QA ids for the customer and the assigned Pro; local DB only) ──
C1 = 'b79c42e9-6e09-4335-9035-a11ecf37d032'   # QA customer, owns J1
P1 = '971c6625-afa7-455b-9b8b-672c8dc562d9'   # QA Pro, assigned to J1 (en_route)
C2 = 'e0320000-0000-4000-8000-0000000000c2'   # different customer (owns J_OTHER)
P2 = 'e0320000-0000-4000-8000-0000000000a2'   # Pro in range, unassigned
P3 = 'e0320000-0000-4000-8000-0000000000a3'   # Pro out of range
P5 = 'e0320000-0000-4000-8000-0000000000a5'   # Pro with their own active job (J_OTHER)
P6 = 'e0320000-0000-4000-8000-0000000000a6'   # free Pro, used for committed race jobs
NP = 'e0320000-0000-4000-8000-0000000000e9'   # authenticated sub with no profile / no auth.users row
SUB = {'C1': C1, 'P1': P1, 'C2': C2, 'P2': P2, 'P3': P3, 'P5': P5, 'P6': P6, 'NP': NP}
# synthetic test points (not a real address; never printed)
JOBPT = ('27.111111', '-80.222222')
NEARPT = ('27.120000', '-80.230000')
FARPT = ('35.333333', '-70.444444')
LIVE = ('27.155555', '-80.266666')     # a live point
LIVE2 = ('27.166666', '-80.277777')
J1 = 'e0320000-0000-4000-8000-0000000000f1'
J_POST = 'e0320000-0000-4000-8000-0000000000f2'
J_OTHER = 'e0320000-0000-4000-8000-0000000000f4'
J_RACE = 'e0320000-0000-4000-8000-0000000000f5'
J_NONE = 'e0320000-0000-4000-8000-0000000000ff'   # does not exist
STATUSES = ['posted', 'en_route', 'arrived', 'diagnosing', 'materials_requested', 'materials_approved',
            'materials_declined', 'in_progress', 'inspection_completed', 'complete', 'cancelled']
NOT_EN_ROUTE = [s for s in STATUSES if s != 'en_route']
NOT_FOUND = '{"ok": false, "error": "not_found"}'
NOT_ACTIVE = '{"ok": false, "error": "tracking_not_active"}'
NOT_AUTH = '{"ok": false, "error": "not_authenticated"}'
INVALID = '{"ok": false, "error": "invalid_point"}'
WAITING = '{"ok": true, "reason": "waiting", "available": false}'
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
        raise SystemExit(f'psql failed on {db}:\n{redact(r.stderr)}')
    return r.stdout


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def dep(prefix, env):
    inrepo = [os.path.join(MIG, f) for f in sorted(os.listdir(MIG)) if f.startswith(prefix)]
    if inrepo:
        return inrepo[0]
    p = os.environ.get(env)
    if not p or not os.path.exists(p):
        raise SystemExit(f'{env} is required ({prefix} is not in supabase/migrations).')
    return p


P27 = dep('0027', 'HAVEN_0027')
P30 = dep('0030', 'HAVEN_0030')


def base_files():
    out = []
    for f in sorted(f for f in os.listdir(MIG) if re.match(r'^\d{4}.*\.sql$', f)):
        if f[:4] in ('0027', '0030', '0032'):
            continue
        out.append(os.path.join(MIG, f))
        if f.startswith('0020'):
            out.append(None)   # minimal 0021 shim (profiles.pro_workspace)
    return out


def job_insert(jid, cust, pro, st):
    acc = "'2026-11-06T05:00:00Z'" if pro else 'null'
    return ("insert into public.jobs(id, customer_id, pro_id, status, category, title, city_label, lat, lng, "
            "fixed_customer_labor_price_cents, fixed_pro_labor_payout_cents, accepted_at) values "
            f"('{jid}', '{cust}', {'null' if pro is None else repr(pro)}, '{st}', 'Plumbing', 'job {jid[-2:]}', "
            f"'Test City', {JOBPT[0]}, {JOBPT[1]}, 8900, 7120, {acc});\n")


def fixture_sql():
    users = [(C1, 'customer'), (C2, 'customer'), (P1, 'pro'), (P2, 'pro'), (P3, 'pro'), (P5, 'pro'), (P6, 'pro')]
    s = ''.join(f"insert into auth.users(id, email, raw_user_meta_data) values ('{u}', null, "
                f"'{json.dumps({'role': r})}');\n" for u, r in users)
    s += ("insert into public.profiles(id, role) select id, raw_user_meta_data->>'role' from auth.users "
          "on conflict (id) do nothing;\n")
    for pro, pt, rad in ((P1, NEARPT, 25), (P2, NEARPT, 25), (P5, NEARPT, 25), (P6, NEARPT, 25), (P3, FARPT, 5)):
        s += (f"update public.profiles set operating_lat = {pt[0]}, operating_lng = {pt[1]}, "
              f"pro_workspace = '{{\"travelRadius\":\"{rad}\"}}' where id = '{pro}';\n")
    for jid, cust, pro, st in ((J1, C1, P1, 'en_route'), (J_POST, C1, None, 'posted'), (J_OTHER, C2, P5, 'en_route')):
        s += job_insert(jid, cust, pro, st)
    return s


def crlf(sql):
    return sql.replace('\r\n', '\n').replace('\n', '\r\n')


def build(db, with_0027=True, with_0030=True, crlf_0030=False):
    psql('postgres', f'drop database if exists {db};')
    must('postgres', f'create database {db};')
    must(db, SHIM)
    for p in base_files():
        if p is None:
            must(db, 'alter table public.profiles add column if not exists pro_workspace jsonb;')
        else:
            must(db, open(p).read())
    if with_0027:
        must(db, open(P27).read())
    if with_0030:
        t = open(P30).read()
        must(db, crlf(t) if crlf_0030 else t)
    must(db, fixture_sql())


def as_actor(who):
    if who == 'anon':
        return "set local role anon;\nselect set_config('request.jwt.claims', '{\"role\":\"anon\"}', true) \\g /dev/null\n"
    if who == 'nosub':
        return "set local role authenticated;\nselect set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', true) \\g /dev/null\n"
    if who == 'service_role':
        return "set local role service_role;\nselect set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true) \\g /dev/null\n"
    claims = json.dumps({'sub': SUB[who], 'role': 'authenticated'})
    return f"set local role authenticated;\nselect set_config('request.jwt.claims', '{claims}', true) \\g /dev/null\n"


OWNER = "reset role;\nselect set_config('request.jwt.claims', '', true) \\g /dev/null\n"


def owner_setup(sql):
    """Owner-side fixture tweak inside the check's transaction (triggers off; rolled back)."""
    return f"set local session_replication_role = replica;\n{sql};\nset local session_replication_role = origin;\n"


def q(db, who, sql, setup='', readonly=False):
    r = psql(db, f"begin{' read only' if readonly and not setup else ''};\n{owner_setup(setup) if setup else ''}"
                 f"{'set transaction read only;' if readonly and setup else ''}"
                 f"{as_actor(who) if who != 'postgres' else ''}{sql};\nrollback;\n")
    if r.returncode:
        m = re.search(r'ERROR:\s+(.*)', r.stderr)
        return 'ERR:' + (m.group(1).strip() if m else r.stderr.strip())
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    return ','.join(lines) if lines else '-'


def check(group, label, got, expect):
    ok = bool(expect(got) if callable(expect) else got == expect)
    RESULTS.append((group, label, ok))
    print(f"{'PASS' if ok else 'FAIL'} [{group}] {label}: {redact(got)[:300]}"
          + ('' if ok else f'   expected {redact(expect) if not callable(expect) else "(predicate)"}'))


def denied(got):
    return got.startswith('ERR:permission denied')


def W(jid, lat=LIVE[0], lng=LIVE[1], cap='null'):
    return f"select public.pro_update_live_location('{jid}', {lat}, {lng}, {cap})::text"


def R(jid):
    return f"select public.get_job_live_location('{jid}')::text"


def seed(jid=J1, pro=P1, pt=LIVE, age="'0 seconds'", cap='null'):
    return (f"insert into public.job_live_locations(job_id, pro_id, lat, lng, received_at, captured_at) values "
            f"('{jid}', '{pro}', {pt[0]}, {pt[1]}, now() - interval {age}, {cap})")


def set_status(st, jid=J1):
    return f"update public.jobs set status = '{st}' where id = '{jid}'"


def ok_write(s):
    try:
        d = json.loads(s)
    except Exception:
        return False
    return d.get('ok') is True and set(d) == {'ok', 'received_at'} and bool(re.match(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$', d['received_at']))


def nrows(jid=J1):
    return f"select count(*) from public.job_live_locations where job_id = '{jid}'"


TABLE_OPS = {
    'select': "select count(*) from public.job_live_locations",
    'insert': f"insert into public.job_live_locations(job_id, pro_id, lat, lng, received_at) values ('{J1}', '{P1}', 1, 1, now())",
    'update': "update public.job_live_locations set lat = 1",
    'delete': "delete from public.job_live_locations",
}
ACTORS = ['P1', 'C1', 'P2', 'P3', 'P5', 'C2', 'NP', 'nosub', 'anon', 'service_role']


def state(db):
    sql = r"""
select 'fn|' || p.oid::regprocedure || '|' || md5(replace(pg_get_functiondef(p.oid), E'\r', '')) || '|' || coalesce(p.proacl::text, '')
       || '|' || pg_get_userbyid(p.proowner)
  from pg_proc p where p.pronamespace = 'public'::regnamespace
union all
select 'pol|' || tablename || '|' || policyname || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  from pg_policies where schemaname = 'public'
union all
select 'trg|' || c.relname || '|' || t.tgname || '|' || md5(pg_get_triggerdef(t.oid)) || '|' || t.tgenabled::text
  from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
union all
select 'rel|' || c.relname || '|' || c.relkind::text || '|' || c.relrowsecurity || '|' || coalesce(c.relacl::text, '')
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m','S','i')
union all
select 'col|' || table_name || '|' || column_name || '|' || data_type || '|' || is_nullable
  from information_schema.columns where table_schema = 'public'
union all
select 'pub|' || pubname || '|' || schemaname || '.' || tablename from pg_publication_tables
union all
select 'rows|jobs|' || md5(string_agg(t::text, ';' order by t.id)) from public.jobs t
union all
select 'rows|profiles|' || md5(string_agg(t::text, ';' order by t.id)) from public.profiles t
order by 1;"""
    return must(db, sql).splitlines()


def diff(a, b):
    sa, sb = set(a), set(b)
    return sorted(['-' + x for x in sa - sb] + ['+' + x for x in sb - sa])


def apply_file(db, path=None, text=None):
    r = psql(db, text if text is not None else open(path).read())
    return r.returncode, r.stderr


def md5s_0030(db):
    return {fn: q(db, 'postgres', f"select md5(replace(prosrc, E'\\r', '')) from pg_proc where oid = '{fn}'::regprocedure")
            for fn in MD5_0030}


# ── groups ──────────────────────────────────────────────────────────────
def g1_auth(db, g):
    check(g, 'P1 (assigned, en_route) writes: ok + received_at only', q(db, 'P1', W(J1)), ok_write)
    check(g, 'P1 write stores the exact point (6 dp) for J1 with pro_id = P1',
          q(db, 'P1', W(J1) + " \\g /dev/null\n" + OWNER +
            f"select (lat, lng, pro_id) = ({LIVE[0]}::numeric, {LIVE[1]}::numeric, '{P1}'::uuid) from public.job_live_locations where job_id = '{J1}'"), 't')
    check(g, 'P1 (assigned Pro) reads: not_found (Pro never reads the live point)', q(db, 'P1', R(J1), setup=seed()), NOT_FOUND)
    check(g, 'C1 (owner) reads fresh point: ok, available, exact stored point',
          q(db, 'C1', f"select (r->>'ok')::bool and (r->>'available')::bool and (r->'point'->>'lat')::numeric = {LIVE[0]} "
                      f"and (r->'point'->>'lng')::numeric = {LIVE[1]} from (select public.get_job_live_location('{J1}') r) x", setup=seed()), 't')
    check(g, 'C1 (owner) writes: not_found', q(db, 'C1', W(J1)), NOT_FOUND)
    check(g, 'C1 (owner) write created no row', q(db, 'C1', W(J1) + " \\g /dev/null\n" + OWNER + nrows()), '0')
    for who, label in (('P2', 'unassigned Pro in range'), ('P3', 'Pro out of range'), ('P5', 'Pro with own active job'),
                       ('C2', 'other customer'), ('NP', 'authenticated, no profile')):
        check(g, f'{label} ({who}) write J1: not_found', q(db, who, W(J1), setup=seed()), NOT_FOUND)
        check(g, f'{label} ({who}) read J1 (point exists): not_found', q(db, who, R(J1), setup=seed()), NOT_FOUND)
        check(g, f'{label} ({who}) write left the stored point unchanged',
              q(db, who, W(J1, LIVE2[0], LIVE2[1]) + " \\g /dev/null\n" + OWNER +
                f"select lat = {LIVE[0]} from public.job_live_locations where job_id = '{J1}'", setup=seed(age="'10 seconds'")), 't')
    check(g, 'P5 write to own job J_OTHER: ok (control: writer path works for a different assignment)', q(db, 'P5', W(J_OTHER)), ok_write)
    check(g, 'P1 write to another Pro\'s job J_OTHER: not_found', q(db, 'P1', W(J_OTHER)), NOT_FOUND)
    check(g, 'C1 read of another customer\'s job J_OTHER (point exists): not_found', q(db, 'C1', R(J_OTHER), setup=seed(J_OTHER, P5)), NOT_FOUND)
    check(g, 'C2 (owner of J_OTHER) read: ok available (control)',
          q(db, 'C2', f"select (public.get_job_live_location('{J_OTHER}')->>'available')", setup=seed(J_OTHER, P5)), 'true')
    for fn, sql in (('write', W(J1)), ('read', R(J1))):
        check(g, f'anon {fn}: permission denied (no EXECUTE)', q(db, 'anon', sql), denied)
        check(g, f'authenticated without sub {fn}: not_authenticated', q(db, 'nosub', sql, setup=seed()), NOT_AUTH)
        check(g, f'service_role {fn}: not_authenticated (F4: no auth.uid(), no special path)', q(db, 'service_role', sql, setup=seed()), NOT_AUTH)
    check(g, 'service_role write created no row', q(db, 'service_role', W(J1) + " \\g /dev/null\n" + OWNER + nrows()), '0')
    for who in ACTORS:
        for op, sql in TABLE_OPS.items():
            check(g, f'direct {op} on job_live_locations as {who}: permission denied', q(db, who, sql, setup=seed()), denied)
    check(g, 'board (P2) after a write: no live point in any column',
          q(db, 'P1', W(J1) + " \\g /dev/null\n" + OWNER + as_actor('P2') +
            f"select count(*) from public.jobs_posted_within_radius() b where b::text like '%{LIVE[0][:6]}%'"), '0')
    check(g, 'get_assigned_job_destination (P1) after a write: still the stored job point, not the live point',
          q(db, 'P1', W(J1) + " \\g /dev/null\n" +
            f"select (d->'destination'->>'lat')::numeric = {JOBPT[0]} and (d->'destination'->>'lng')::numeric = {JOBPT[1]} "
            f"from (select public.get_assigned_job_destination('{J1}') d) x"), 't')
    check(g, 'owner C1 select * on jobs after a write: no live point anywhere in the row',
          q(db, 'P1', W(J1) + " \\g /dev/null\n" + OWNER + as_actor('C1') +
            f"select count(*) from public.jobs j where j::text like '%{LIVE[0][:6]}%'"), '0')


def g2_identical(db, g):
    cases = [('missing job', J_NONE, ''), ('J1 no point', J1, ''), ('J1 with point', J1, seed())]
    cases += [(f'J1 {st} with point', J1, seed() + ';\n' + set_status(st)) for st in STATUSES]
    for who, fn in (('P2', 'both'), ('P3', 'both'), ('P5', 'both'), ('C2', 'both'), ('NP', 'both'), ('P1', 'read'), ('C1', 'write')):
        outs = set()
        for label, jid, setup in cases:
            if fn in ('both', 'read'):
                outs.add(q(db, who, R(jid), setup=setup))
            if fn in ('both', 'write'):
                outs.add(q(db, who, W(jid), setup=setup))
        check(g, f'{who} ({fn}): byte-identical not_found across missing / no point / point / all 11 statuses',
              sorted(outs), [NOT_FOUND])
    check(g, 'null job id (write, P1): not_found', q(db, 'P1', "select public.pro_update_live_location(null, 1, 1)::text"), NOT_FOUND)
    check(g, 'null job id (read, C1): not_found', q(db, 'C1', "select public.get_job_live_location(null)::text"), NOT_FOUND)


def g3_status(db, g):
    for st in NOT_EN_ROUTE:
        check(g, f'P1 write while {st}: tracking_not_active, no row created',
              q(db, 'P1', W(J1) + ";\n" + OWNER + nrows(), setup=set_status(st)), f'{NOT_ACTIVE},0')
        check(g, f'C1 read while {st} (no row): tracking_not_active', q(db, 'C1', R(J1), setup=set_status(st)), NOT_ACTIVE)
    check(g, 'P1 write to a posted, unassigned job: not_found, no row', q(db, 'P1', W(J_POST) + ";\n" + OWNER + nrows(J_POST)), f'{NOT_FOUND},0')
    check(g, 'C1 read of own posted, unassigned job: tracking_not_active', q(db, 'C1', R(J_POST)), NOT_ACTIVE)
    check(g, 'C1 read en_route, no row: waiting', q(db, 'C1', R(J1)), WAITING)
    check(g, 'a read never creates a row', q(db, 'C1', R(J1) + " \\g /dev/null\n" + OWNER + nrows()), '0')


def transition(db, who, sql, setup=None):
    """Run a real transition (triggers on) as `who`, then report status|live rows as owner."""
    act = (as_actor(who) if who != 'postgres' else '') + sql + ";\n" + OWNER
    return q(db, 'postgres', act + f"select (select status::text from public.jobs where id = '{J1}') || '|' || "
                                    f"(select count(*) from public.job_live_locations where job_id = '{J1}')",
             setup=setup or seed())


def g4_discard(db, g):
    for st in ('arrived', 'complete', 'inspection_completed', 'materials_declined', 'materials_requested'):
        check(g, f'P1 moves en_route -> {st} (real RLS path): point discarded', transition(db, 'P1', set_status(st)), f'{st}|0')
    check(g, 'customer C1 sets arrived (allowed by current RLS): point discarded', transition(db, 'C1', set_status('arrived')), 'arrived|0')
    check(g, 'DB owner cancels en_route job: point discarded', transition(db, 'postgres', set_status('cancelled')), 'cancelled|0')
    check(g, 'service_role cancels en_route job: point discarded', transition(db, 'service_role', set_status('cancelled')), 'cancelled|0')
    check(g, 'DB owner changes pro_id (still en_route): point discarded',
          transition(db, 'postgres', f"update public.jobs set pro_id = '{P6}' where id = '{J1}'"), 'en_route|0')
    check(g, 'job deleted: live row removed by FK cascade',
          q(db, 'postgres', f"delete from public.jobs where id = '{J1}';\n" + nrows(), setup=seed()), '0')
    check(g, 'Arrived rolled back (savepoint): point kept',
          transition(db, 'P1', "savepoint s;\n" + set_status('arrived') + ";\nrollback to savepoint s"), 'en_route|1')
    check(g, 'non-status update (title) on en_route job: point kept',
          transition(db, 'postgres', f"update public.jobs set title = 'renamed' where id = '{J1}'"), 'en_route|1')
    check(g, 'status set to the same en_route: point kept', transition(db, 'postgres', set_status('en_route')), 'en_route|1')
    check(g, 'another job\'s arrival does not discard J1',
          q(db, 'postgres', f"update public.jobs set status = 'arrived' where id = '{J_OTHER}';\n" + nrows(), setup=seed()), '1')
    check(g, 'after Arrived, P1 write is refused and no row is recreated',
          q(db, 'P1', set_status('arrived') + ";\n" + W(J1) + ";\n" + OWNER + nrows(), setup=seed()), f'{NOT_ACTIVE},0')


def race(db, g, label, first):
    """Two connections, committed job J_RACE (P6, en_route, customer C2). first = 'write' or 'arrive'."""
    must(db, "set session_replication_role = replica;\n" + job_insert(J_RACE, C2, P6, 'en_route'))
    base = PSQL + ['-d', db, '-v', 'ON_ERROR_STOP=1']
    w = f"select public.pro_update_live_location('{J_RACE}', {LIVE[0]}, {LIVE[1]})::text;\n"
    a = f"update public.jobs set status = 'arrived' where id = '{J_RACE}';\n"
    hold = "select pg_sleep(1.5) \\g /dev/null\n"
    first_sql, second_sql = (w, a) if first == 'write' else (a, w)
    p = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write("begin;\n" + as_actor('P6') + first_sql + hold + "commit;\n"); p.stdin.close()
    time.sleep(0.5)
    t0 = time.time()
    second = subprocess.run(base, input="begin;\n" + as_actor('P6') + second_sql + "commit;\n", capture_output=True, text=True)
    waited = time.time() - t0
    fo = p.stdout.read(); p.wait()
    final = must(db, f"select status || '|' || (select count(*) from public.job_live_locations where job_id = '{J_RACE}') "
                     f"from public.jobs where id = '{J_RACE}'").strip()
    must(db, f"delete from public.jobs where id = '{J_RACE}';")
    if first == 'write':
        check(g, f'{label}: write committed first, Arrived waited for it (>0.6 s), then the point was discarded',
              (ok_write(fo.strip()), second.returncode, waited > 0.6, final), (True, 0, True, 'arrived|0'))
    else:
        check(g, f'{label}: Arrived first; the concurrent write waited (>0.6 s), re-read arrived, refused; no point',
              (second.stdout.strip(), waited > 0.6, final), (NOT_ACTIVE, True, 'arrived|0'))


def g5_race(db, g):
    race(db, g, 'race write-then-arrive', 'write')
    race(db, g, 'race arrive-then-write', 'arrive')


COUNTS = ("(select string_agg(relname || '=' || n, ',' order by relname) from (select c.relname, "
          "(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text n "
          "from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'job_live_locations') z)")


def g6_history(db, g):
    shift = OWNER + f"update public.job_live_locations set received_at = received_at - interval '5 seconds' where job_id = '{J1}';\n"
    body = ''.join(as_actor('P1') + W(J1, f'27.1{i:05d}', LIVE[1]) + " \\g /dev/null\n" + shift for i in range(20))
    pre = f"create temp table c0 as select (select count(*) from public.job_status_events) e, {COUNTS} t;\n"
    post = (OWNER + "select (select count(*) from public.job_live_locations) || '|' || ((select e from c0) = (select count(*) from public.job_status_events)) "
            f"|| '|' || ((select t from c0) = {COUNTS}) "
            f"|| '|' || ((select lat from public.job_live_locations where job_id = '{J1}') = 27.100019)")
    check(g, '20 writes: exactly one row, job_status_events unchanged, every other table row count unchanged, row = latest point',
          q(db, 'postgres', pre + body + post), '1|true|true|true')


def g7_isolation(db, g):
    tables = must(db, "select string_agg(format('select %L || md5(coalesce(string_agg(t::text, %L order by t::text), %L)) from public.%I t', "
                      "relname || ':', ';', '', relname), ' union all ' order by relname) "
                      "from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> 'job_live_locations'").strip()
    fns = ' union all '.join(f"select md5(replace(prosrc, E'\\r', '')) from pg_proc where oid = '{fn}'::regprocedure" for fn in MD5_0030)
    dest = as_actor('P1') + f"select public.get_assigned_job_destination('{J1}')::text;\n"
    board = as_actor('P2') + "select coalesce(string_agg(b::text, ';' order by b.id), '') from public.jobs_posted_within_radius() b;\n"
    shift = OWNER + f"update public.job_live_locations set received_at = received_at - interval '5 seconds' where job_id = '{J1}';\n"
    writes = ''.join(as_actor('P1') + W(J1, f'27.2{i:05d}', f'-80.3{i:05d}') + " \\g /dev/null\n" + shift for i in range(100))
    one = OWNER + tables + ";\n" + fns + ";\n" + dest + board
    r = psql(db, "begin;\n" + one + writes + one + OWNER + "select count(*) from public.job_live_locations;\nrollback;\n")
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    last = lines.pop() if lines else ''
    half = len(lines) // 2
    check(g, '100 writes: every public table row (jobs incl. lat/lng, profiles incl. operating_*/pro_workspace, all others), '
             'the three 0030 md5s, get_assigned_job_destination and board output byte-identical; still one live row',
          (r.returncode, len(lines) % 2, lines[:half] == lines[half:], half > 10, last), (0, 0, True, True, '1'))
    check(g, 'the three 0030 function bodies are still 0030', md5s_0030(db), MD5_0030)


def g8_validation(db, g):
    bad = [('null lat', 'null', LIVE[1]), ('null lng', LIVE[0], 'null'),
           ('NaN lat', "'NaN'::float8", LIVE[1]), ('NaN lng', LIVE[0], "'NaN'::float8"),
           ('+Inf lat', "'Infinity'::float8", LIVE[1]), ('-Inf lat', "'-Infinity'::float8", LIVE[1]),
           ('+Inf lng', LIVE[0], "'Infinity'::float8"), ('-Inf lng', LIVE[0], "'-Infinity'::float8"),
           ('lat 90.000001', '90.000001', LIVE[1]), ('lat -90.000001', '-90.000001', LIVE[1]),
           ('lng 180.000001', LIVE[0], '180.000001'), ('lng -180.000001', LIVE[0], '-180.000001'),
           ('(0, 0)', '0', '0'), ('(0.0000001, -0.0000004) rounds to (0, 0)', '0.0000001', '-0.0000004')]
    for label, la, ln in bad:
        check(g, f'{label}: invalid_point, no row', q(db, 'P1', W(J1, la, ln) + ";\n" + OWNER + nrows()), f'{INVALID},0')
    for la, ln in (('90', '180'), ('-90', '-180'), ('90', '-180'), ('-90', '180'), ('0', '12.5'), ('12.5', '0')):
        check(g, f'boundary ({la}, {ln}) accepted and stored exactly',
              q(db, 'P1', W(J1, la, ln) + " \\g /dev/null\n" + OWNER +
                f"select (lat, lng) = ({la}::numeric, {ln}::numeric) from public.job_live_locations where job_id = '{J1}'"), 't')
    check(g, '6 dp rounding (synthetic 12.3456789, -45.6789014 -> 12.345679, -45.678901)',
          q(db, 'P1', W(J1, '12.3456789', '-45.6789014') + " \\g /dev/null\n" + OWNER +
            f"select (lat, lng) = (12.345679, -45.678901) from public.job_live_locations where job_id = '{J1}'"), 't')
    for label, cap, exp in (('now() - 3 min', "now() - interval '3 minutes'", 'null'), ('now() + 1 min', "now() + interval '1 minute'", 'null'),
                            ('now() - 30 s', "now() - interval '30 seconds'", 'kept'), ('now() + 10 s', "now() + interval '10 seconds'", 'kept'),
                            ('now() - 2 min (edge)', "now() - interval '2 minutes'", 'kept'), ('now() + 30 s (edge)', "now() + interval '30 seconds'", 'kept'),
                            ('null', 'null', 'null')):
        got = q(db, 'P1', W(J1, cap=cap) + " \\g /dev/null\n" + OWNER +
                f"select case when captured_at is null then 'null' when captured_at = {cap} then 'kept' else 'other' end "
                f"from public.job_live_locations where job_id = '{J1}'")
        check(g, f'captured_at {label}: {exp}', got, exp)
    check(g, 'write returns received_at = server now() (not the client captured_at)',
          q(db, 'P1', f"select (public.pro_update_live_location('{J1}', {LIVE[0]}, {LIVE[1]}, now() - interval '1 minute')->>'received_at') = "
                      "to_char(now() at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')"), 't')


def g9_rate(db, g):
    def shift(s):
        return OWNER + f"update public.job_live_locations set received_at = received_at - interval '{s}' where job_id = '{J1}';\n"

    def point(v):
        return OWNER + f"select lat = {v} from public.job_live_locations where job_id = '{J1}';\n"
    sql = (as_actor('P1') + W(J1) + " \\g /dev/null\n" + as_actor('P1') + W(J1, LIVE2[0], LIVE2[1]) + ";\n"
           + point(LIVE[0]) + shift('3 seconds') + as_actor('P1') + W(J1, LIVE2[0], LIVE2[1]) + ";\n"
           + point(LIVE[0]) + shift('1 second') + as_actor('P1') + W(J1, LIVE2[0], LIVE2[1]) + ";\n" + point(LIVE2[0]))
    r = psql(db, "begin;\n" + sql + "rollback;\n")
    parts = [l for l in r.stdout.splitlines() if l.strip()]
    check(g, 'second write at +0 s: rate_limited retry_after_s 4, point unchanged',
          parts[:2], ['{"ok": false, "error": "rate_limited", "retry_after_s": 4}', 't'])
    check(g, 'write at +3 s: rate_limited retry_after_s 1, point unchanged',
          parts[2:4], ['{"ok": false, "error": "rate_limited", "retry_after_s": 1}', 't'])
    check(g, 'write at +4 s: accepted, point updated', (len(parts) > 5 and ok_write(parts[4]), parts[5:6]), (True, ['t']))
    check(g, 'P2 (not assigned) at +0 s after a write: not_found (rate_limited only reaches the assigned Pro)',
          q(db, 'P2', W(J1), setup=seed()), NOT_FOUND)


def g10_states(db, g):
    check(g, 'owner, en_route, no point: waiting (exact body)', q(db, 'C1', R(J1)), WAITING)

    def js(s):
        try:
            return json.loads(s)
        except Exception:
            return {}
    got = q(db, 'C1', R(J1), setup=seed(age="'5 minutes 1 second'"))
    check(g, 'owner, point 5 min 1 s old: paused + last_received_at, NO coordinates',
          got, lambda s: set(js(s)) == {'ok', 'available', 'reason', 'last_received_at'} and js(s)['reason'] == 'paused'
          and js(s)['available'] is False and LIVE[0][:6] not in s and 'point' not in s)
    got = q(db, 'C1', R(J1), setup=seed(age="'4 minutes 59 seconds'"))
    check(g, 'owner, point 4 min 59 s old: available, age_s 299', got, lambda s: js(s).get('available') is True and js(s).get('age_s') == 299)
    got = q(db, 'C1', R(J1), setup=seed(age="'5 minutes'"))
    check(g, 'owner, point exactly 5 min old: still available (paused only AFTER 5 min)', got, lambda s: js(s).get('available') is True)
    got = q(db, 'C1', R(J1), setup=seed(age="'12 seconds'", cap="now() - interval '13 seconds'"))
    check(g, 'owner, fresh point: keys {ok, available, point, received_at, captured_at, age_s}, age_s 12, captured_at set',
          got, lambda s: set(js(s)) == {'ok', 'available', 'point', 'received_at', 'captured_at', 'age_s'}
          and js(s)['age_s'] == 12 and js(s)['captured_at'] is not None and set(js(s)['point']) == {'lat', 'lng'})
    check(g, 'owner, fresh point: point equals stored row exactly',
          q(db, 'C1', f"select (r->'point'->>'lat')::numeric = {LIVE[0]} and (r->'point'->>'lng')::numeric = {LIVE[1]} "
                      f"from (select public.get_job_live_location('{J1}') r) x", setup=seed()), 't')
    check(g, 'owner, fresh point without captured_at: captured_at null',
          q(db, 'C1', f"select public.get_job_live_location('{J1}')->'captured_at'", setup=seed()), 'null')
    check(g, 'read works in a READ ONLY transaction (no writes)', q(db, 'C1', R(J1), setup=seed(), readonly=True),
          lambda s: js(s).get('available') is True)
    check(g, 'end-to-end: P1 writes then C1 reads the same exact point',
          q(db, 'P1', W(J1) + " \\g /dev/null\n" + as_actor('C1') +
            f"select (r->'point'->>'lat')::numeric = {LIVE[0]} from (select public.get_job_live_location('{J1}') r) x"), 't')


def g11_backstop(db, g):
    for st in ('arrived', 'complete', 'cancelled', 'in_progress'):
        check(g, f'orphan row planted on a {st} job (triggers bypassed): owner read tracking_not_active, no coordinates',
              q(db, 'C1', R(J1), setup=set_status(st) + ';\n' + seed()), NOT_ACTIVE)
    check(g, 'row with a mismatched pro_id (P2) on en_route J1: waiting, never the point',
          q(db, 'C1', R(J1), setup=seed(pro=P2)), WAITING)
    check(g, 'orphan on arrived: assigned Pro read still not_found', q(db, 'P1', R(J1), setup=set_status('arrived') + ';\n' + seed()), NOT_FOUND)


def g12_guards(db, g):
    def Q(s):
        return q(db, 'postgres', s)
    check(g, 'job_live_locations in no publication (incl. supabase_realtime)',
          Q("select count(*) from pg_publication_tables where tablename = 'job_live_locations'"), '0')
    check(g, 'RLS enabled', Q("select relrowsecurity from pg_class where oid = 'public.job_live_locations'::regclass"), 't')
    check(g, 'zero policies', Q("select count(*) from pg_policies where tablename = 'job_live_locations'"), '0')
    check(g, 'table ACL: no entry for public, anon, authenticated or service_role',
          Q("select count(*) from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a "
            "where c.oid = 'public.job_live_locations'::regclass and (a.grantee = 0 or a.grantee in "
            "(select oid from pg_roles where rolname in ('anon','authenticated','service_role')))"), '0')
    for role in ('anon', 'authenticated', 'service_role'):
        check(g, f'has_table_privilege({role}, any of S/I/U/D/TRUNCATE/REFERENCES/TRIGGER) false',
              Q(f"select has_table_privilege('{role}', 'public.job_live_locations', 'select,insert,update,delete,truncate,references,trigger')"), 'f')
    fns = {'pro_update_live_location(uuid,double precision,double precision,timestamp with time zone)': ('v', True),
           'get_job_live_location(uuid)': ('s', True), 'jobs_discard_live_location()': ('v', False)}
    for fn, (vol, client) in fns.items():
        got = Q(f"select prosecdef || '|' || provolatile::text || '|' || array_to_string(proconfig, ';') || '|' || "
                f"(proowner = (select relowner from pg_class where oid = 'public.jobs'::regclass)) "
                f"from pg_proc where oid = 'public.{fn}'::regprocedure")
        check(g, f'{fn}: SECURITY DEFINER, volatility {vol}, search_path pinned, owned by the jobs owner',
              got, f'true|{vol}|search_path=pg_catalog, public, pg_temp|true')
        acl = Q(f"select string_agg(r || '=' || has_function_privilege(r, 'public.{fn}'::regprocedure, 'execute'), ',' order by r) "
                f"from unnest(array['anon','authenticated']) r")
        check(g, f'{fn}: EXECUTE anon=false, authenticated={str(client).lower()}', acl, f'anon=false,authenticated={str(client).lower()}')
        check(g, f'{fn}: no PUBLIC EXECUTE',
              Q(f"select count(*) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a "
                f"where p.oid = 'public.{fn}'::regprocedure and a.grantee = 0"), '0')
    check(g, 'trigger fn: service_role has no EXECUTE',
          Q("select has_function_privilege('service_role', 'public.jobs_discard_live_location()'::regprocedure, 'execute')"), 'f')
    check(g, 'authenticated calling the trigger function directly: permission denied',
          q(db, 'P1', "select public.jobs_discard_live_location()"), denied)
    check(g, 'trigger definition: AFTER UPDATE OF status, pro_id, FOR EACH ROW, WHEN leaving en_route or pro_id change',
          Q("select pg_get_triggerdef(oid) from pg_trigger where tgname = 'jobs_discard_live_location'"),
          lambda s: 'AFTER UPDATE OF status, pro_id ON public.jobs FOR EACH ROW WHEN' in s
          and "(old.status = 'en_route'::job_status)" in s and "(new.status IS DISTINCT FROM 'en_route'::job_status)" in s
          and '(new.pro_id IS DISTINCT FROM old.pro_id)' in s and 'jobs_discard_live_location()' in s)
    check(g, 'table columns exactly job_id, pro_id, lat, lng, received_at, captured_at',
          Q("select string_agg(attname || ':' || format_type(atttypid, atttypmod) || ':' || attnotnull, ',' order by attnum) "
            "from pg_attribute where attrelid = 'public.job_live_locations'::regclass and attnum > 0 and not attisdropped"),
          'job_id:uuid:true,pro_id:uuid:true,lat:numeric(9,6):true,lng:numeric(9,6):true,received_at:timestamp with time zone:true,captured_at:timestamp with time zone:false')
    check(g, 'only the PK index; FK to jobs ON DELETE CASCADE',
          Q("select (select count(*) from pg_index where indrelid = 'public.job_live_locations'::regclass) || '|' || "
            "(select confdeltype::text from pg_constraint where conrelid = 'public.job_live_locations'::regclass and contype = 'f')"), '1|c')
    check(g, 'jobs triggers = the existing two + jobs_discard_live_location only',
          Q("select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'public.jobs'::regclass and not tgisinternal"),
          'jobs_discard_live_location,jobs_enforce_claim_radius,jobs_lock_materials_approved')


def matrix(db, tag=''):
    g1_auth(db, 'g1-auth' + tag)
    g2_identical(db, 'g2-identical' + tag)
    g3_status(db, 'g3-status' + tag)
    g4_discard(db, 'g4-discard' + tag)
    g5_race(db, 'g5-race' + tag)
    g6_history(db, 'g6-history' + tag)
    g7_isolation(db, 'g7-isolation' + tag)
    g8_validation(db, 'g8-validation' + tag)
    g9_rate(db, 'g9-rate' + tag)
    g10_states(db, 'g10-states' + tag)
    g11_backstop(db, 'g11-backstop' + tag)
    g12_guards(db, 'g12-guards' + tag)


def drifted(db, fn):
    d = must(db, f"select pg_get_functiondef('{fn}'::regprocedure)")
    out = re.sub(r'(AS \$function\$)', r'\1\n-- drift', d, count=1)
    assert out != d
    return out + ';\n'


def g13_guard(g):
    dbs = []

    def fresh(tag, **kw):
        d = PREFIX + '_g' + tag
        dbs.append(d)
        build(d, **kw)
        return d
    cases = [('0030 not applied (master + 0027 only)', dict(with_0030=False), '', 'is not 0030')]
    for fn in MD5_0030:
        cases.append((f'0030 drift: {fn} + one comment line', {}, 'drift:' + fn, 'is not 0030'))
    cases += [('0027 absent: jobs_select_assigned_pro dropped', {}, 'drop policy jobs_select_assigned_pro on public.jobs', 'Apply 0027 first'),
              ('0027 absent: 0007 jobs_select_assigned_or_active recreated', {},
               "create policy jobs_select_assigned_or_active on public.jobs for select to anon, authenticated using (pro_id is not null)", 'Apply 0027 first'),
              ('existing job_live_locations with different columns', {},
               "create table public.job_live_locations (job_id uuid primary key, lat numeric, lng numeric)", 'different columns'),
              ('existing job_live_locations with a policy', {}, 'APPLY32;create policy x on public.job_live_locations for select to authenticated using (true)', 'has RLS policies'),
              ('a FOR ALL TABLES publication would publish the table', {}, 'create publication all_tables for all tables', 'is in a publication')]
    for i, (label, kw, sql, msg) in enumerate(cases):
        d = fresh(f'r{i}', **kw)
        if sql.startswith('drift:'):
            must(d, drifted(d, sql[6:]))
        elif sql.startswith('APPLY32;'):
            must(d, open(F32).read())
            must(d, sql[8:])
        elif sql:
            must(d, sql)
        s0 = state(d)
        rc, err = apply_file(d, F32)
        check(g, f'refuse: {label}', (rc != 0, msg in err, 'Nothing was changed' in err), (True, True, True))
        check(g, f'refuse: {label} -> nothing changed', diff(s0, state(d)), [])
    d = fresh('crlf', crlf_0030=True)
    raw = q(d, 'postgres', "select bool_and(prosrc like E'%\\r\\n%') from pg_proc where oid in "
                           "('public.jobs_posted_within_radius()'::regprocedure, 'public.pro_claim_job(uuid)'::regprocedure, "
                           "'public.get_assigned_job_destination(uuid)'::regprocedure)")
    check(g, 'CRLF base: the three 0030 bodies are stored with CRLF (as production pastes)', raw, 't')
    rc, err = apply_file(d, F32)
    check(g, 'CRLF base: 0032 (LF) applies', (rc, redact(err.strip())[:200] if rc else ''), (0, ''))
    s1 = state(d)
    rc, _ = apply_file(d, text=crlf(open(F32).read()))
    check(g, 'CRLF base: 0032 re-pasted as CRLF: no error, state identical (defs hashed CR-removed)', (rc, diff(s1, state(d))), (0, []))
    check(g, 'CRLF base: writer/reader work', q(d, 'P1', W(J1) + " \\g /dev/null\n" + as_actor('C1') +
                                                f"select public.get_job_live_location('{J1}')->>'available'"), 'true')
    d = fresh('cycle')
    pre = state(d)
    check(g, 'before 0032: the three 0030 md5s match check 5b (52b6bff7 / 789cb65e / de20ad54)', md5s_0030(d), MD5_0030)
    rc, _ = apply_file(d, F32)
    post = state(d)
    dd = diff(pre, post)
    allowed = [x for x in dd if re.match(r'^\+(fn\|(pro_update_live_location|get_job_live_location|jobs_discard_live_location)\(|'
                                         r'trg\|jobs\|jobs_discard_live_location\||rel\|job_live_locations(_pkey)?\||col\|job_live_locations\|)', x)]
    check(g, '0032 applies; diff = only the new table (+pkey, 6 columns), 3 functions, 1 trigger; nothing removed or altered',
          (rc, len(dd) == len(allowed), len(allowed)), (0, True, 2 + 6 + 3 + 1))
    check(g, 'after 0032: the three 0030 md5s unchanged', md5s_0030(d), MD5_0030)
    rc, _ = apply_file(d, F32)
    check(g, 're-apply 0032: no error, state identical', (rc, diff(post, state(d))), (0, []))
    must(d, "begin;\n" + as_actor('P1') + W(J1) + " \\g /dev/null\ncommit;\n")
    rb = open(R32).read()
    check(g, 'rollback file drops the trigger before the functions and the table',
          rb.index('drop trigger') < rb.index('drop function') < rb.index('drop table'), True)
    rc, _ = apply_file(d, R32)
    check(g, 'rollback applies; state == before 0032 (defs, ACLs, policies, triggers, tables, jobs/profiles rows)', (rc, diff(pre, state(d))), (0, []))
    check(g, 'after rollback: P1 can still mark Arrived (no dangling trigger)',
          q(d, 'P1', set_status('arrived') + f";\nselect status from public.jobs where id = '{J1}'"), 'arrived')
    check(g, 'after rollback: RPCs and table absent',
          q(d, 'postgres', "select coalesce(to_regprocedure('public.pro_update_live_location(uuid,double precision,double precision,timestamptz)')::text, 'x') "
                           "|| coalesce(to_regprocedure('public.get_job_live_location(uuid)')::text, 'x') || coalesce(to_regclass('public.job_live_locations')::text, 'x')"), 'xxx')
    rc, _ = apply_file(d, R32)
    check(g, 'rollback twice: no error, state still == before', (rc, diff(pre, state(d))), (0, []))
    rc, _ = apply_file(d, F32)
    check(g, '0032 re-applied after rollback: state == first apply', (rc, diff(post, state(d))), (0, []))
    return dbs


def main():
    print('0032 sha256', sha(F32))
    if os.path.exists(R32):
        print('rollback sha256', sha(R32))
    print('0027 file', os.path.basename(P27), 'sha256', sha(P27))
    print('0030 file', os.path.basename(P30), 'sha256', sha(P30))
    check('files', '0027 = 2_paste_0027 / #88 2182832e (sha256 d2896728...)', sha(P27), SHA_0027)
    check('files', '0030 = #94 21ee835b / 5_paste_0030 (sha256 9155218d...)', sha(P30), SHA_0030)
    if not QUICK:
        m = open(F32).read()
        blk = m[m.index('-- ── Rollback (only if this file must be undone'):]
        blk = '\n'.join(l[3:] if l.startswith('-- ') else l[2:] for l in blk.split('\n') if l.startswith('--'))
        rb = open(R32).read()
        check('files', 'commented rollback block in 0032 == rollback file (begin..commit)',
              blk[blk.index('begin;'):blk.index('commit;')] == rb[rb.index('begin;'):rb.index('commit;')], True)
    db = PREFIX + '_main'
    build(db)
    check('pre', 'base: 0027 policies present, 0007 absent',
          q(db, 'postgres', "select string_agg(policyname, ',' order by policyname) from pg_policies where tablename = 'jobs' and cmd = 'SELECT'"),
          'jobs_select_assigned_pro,jobs_select_own_customer,jobs_select_own_posted')
    check('pre', 'base: 0030 live (three md5s)', md5s_0030(db), MD5_0030)
    rc, err = apply_file(db, F32)
    check('apply', '0032 applies on master + 0027 + 0030', (rc, redact(err.strip())[:300] if rc else ''), (0, ''))
    matrix(db)
    dbs = [db]
    if not QUICK:
        dbs += g13_guard('g13-guard')
    for x in dbs:
        if x == db and os.environ.get('HAVEN_KEEP_DBS'):
            continue
        psql('postgres', f'drop database if exists {x};')
    npass = sum(1 for r in RESULTS if r[2])
    nfail = len(RESULTS) - npass
    groups = {}
    for gname, _, ok in RESULTS:
        groups.setdefault(gname, [0, 0])[0 if ok else 1] += 1
    print('\nPER GROUP: ' + ', '.join(f'{k} {v[0]}/{v[0] + v[1]}' for k, v in groups.items()))
    print(f'TOTAL {len(RESULTS)} PASS {npass} FAIL {nfail}')
    sys.exit(1 if nfail else 0)


if __name__ == '__main__':
    main()
