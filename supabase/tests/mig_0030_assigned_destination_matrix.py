#!/usr/bin/env python3
"""MIG-0030 matrix: assigned-Pro destination RPC + board trim.

LOCAL THROWAWAY Postgres only. Never Supabase, never production.
Builds databases from this repo's migrations (0001 ... latest on master,
excluding 0030) plus 0027 (PR #88; required, passed via HAVEN_0027 when it is
not in the migrations folder yet), emulating Supabase (anon / authenticated /
service_role, auth.uid() from request.jwt.claims, Supabase default
privileges). Every check runs in its own transaction and is rolled back.

Usage:
  HAVEN_PG='-h /tmp -p 54329 -U postgres' HAVEN_0027=/path/0027.sql \
    python3 supabase/tests/mig_0030_assigned_destination_matrix.py
Env:
  HAVEN_PG       psql connection args (default: -h /tmp -p 54329 -U postgres)
  HAVEN_0027     path to 0027_jobs_read_rls_and_unused_tables.sql (required
                 unless it is already in supabase/migrations)
  HAVEN_DB_PREFIX  database name prefix (default codey0030_<pid>)
  HAVEN_KEEP_DBS=1 keep the databases after the run
Exit code 0 only if every expectation holds.
"""
import hashlib, json, os, re, shlex, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
MIG = os.path.join(ROOT, 'migrations')
F30 = os.path.join(MIG, '0030_assigned_job_destination.sql')
R30 = os.path.join(ROOT, 'rollback', '0030_assigned_job_destination_rollback.sql')
PSQL = ['psql'] + shlex.split(os.environ.get('HAVEN_PG', '-h /tmp -p 54329 -U postgres')) + ['-X', '-q', '-tA']
PREFIX = os.environ.get('HAVEN_DB_PREFIX', 'codey0030_%d' % os.getpid())

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
"""

# ── actors (QA ids for the customer and the assigned Pro; local DB only) ──
C1 = 'b79c42e9-6e09-4335-9035-a11ecf37d032'   # QA customer, owns J1 / J_post
P1 = '971c6625-afa7-455b-9b8b-672c8dc562d9'   # QA Pro, assigned to J1
C2 = 'e0300000-0000-4000-8000-0000000000c2'   # different customer
P2 = 'e0300000-0000-4000-8000-0000000000a2'   # Pro in range, unassigned
P3 = 'e0300000-0000-4000-8000-0000000000a3'   # Pro out of range (New York, 5 mi)
P5 = 'e0300000-0000-4000-8000-0000000000a5'   # Pro assigned to J_other
SUB = {'C1': C1, 'P1': P1, 'C2': C2, 'P2': P2, 'P3': P3, 'P5': P5}
NEAR = ('28.538336', '-81.379234')     # Orlando (J1 stored point)
POST = ('28.601234', '-81.302468')     # Orlando area, a few miles away
FAR = ('40.712776', '-74.005974')      # New York
J1 = 'e0300000-0000-4000-8000-0000000000f1'
J_POST = 'e0300000-0000-4000-8000-0000000000f2'
J_FAR = 'e0300000-0000-4000-8000-0000000000f3'
J_OTHER = 'e0300000-0000-4000-8000-0000000000f4'
J_NONE = 'e0300000-0000-4000-8000-0000000000ff'   # does not exist
ACTIVE = ['en_route', 'arrived', 'diagnosing', 'materials_requested', 'materials_approved', 'in_progress']
INACTIVE = ['posted', 'complete', 'cancelled', 'inspection_completed', 'materials_declined']
NOT_FOUND = '{"ok": false, "error": "not_found"}'

RESULTS = []


def psql(db, sql, stop=True):
    args = PSQL + ['-d', db] + (['-v', 'ON_ERROR_STOP=1'] if stop else [])
    return subprocess.run(args, input=sql, capture_output=True, text=True)


def must(db, sql):
    r = psql(db, sql)
    if r.returncode:
        raise SystemExit(f'psql failed on {db}:\n{r.stderr}')
    return r.stdout


def migration_files():
    files = sorted(f for f in os.listdir(MIG) if re.match(r'^\d{4}.*\.sql$', f) and not f.startswith('0030'))
    out = []
    for f in files:
        out.append(os.path.join(MIG, f))
        if f.startswith('0020'):
            out.append(None)  # minimal 0021 shim (profiles.pro_workspace)
    if not any(is_0027(p) for p in out if p):
        p27 = os.environ.get('HAVEN_0027')
        if not p27 or not os.path.exists(p27):
            raise SystemExit('HAVEN_0027 is required (0027 is not in supabase/migrations). 0030 relies on it.')
        out.append(p27)
    return out


def is_0027(p):
    return os.path.basename(p).startswith('0027') or p == os.environ.get('HAVEN_0027')


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def fixture_sql():
    users = [(C1, 'customer'), (C2, 'customer'), (P1, 'pro'), (P2, 'pro'), (P3, 'pro'), (P5, 'pro')]
    s = ''.join(f"insert into auth.users(id, email, raw_user_meta_data) values ('{u}', null, "
                f"'{json.dumps({'role': r})}');\n" for u, r in users)
    s += ("insert into public.profiles(id, role) select id, raw_user_meta_data->>'role' from auth.users "
          "on conflict (id) do nothing;\n")
    for pro, pt, rad in ((P1, NEAR, 25), (P2, NEAR, 25), (P5, NEAR, 25), (P3, FAR, 5)):
        s += (f"update public.profiles set operating_lat = {pt[0]}, operating_lng = {pt[1]}, "
              f"pro_workspace = '{{\"travelRadius\":\"{rad}\"}}' where id = '{pro}';\n")
    jobs = [(J1, C1, P1, 'en_route', NEAR), (J_POST, C1, None, 'posted', POST),
            (J_FAR, C2, None, 'posted', FAR), (J_OTHER, C2, P5, 'en_route', NEAR)]
    for jid, cust, pro, st, pt in jobs:
        acc = "'2026-11-01T18:00:00Z'" if pro else 'null'
        s += ("insert into public.jobs(id, customer_id, pro_id, status, category, title, city_label, lat, lng, "
              "fixed_customer_labor_price_cents, fixed_pro_labor_payout_cents, accepted_at) values "
              f"('{jid}', '{cust}', {'null' if pro is None else repr(pro)}, '{st}', 'Plumbing', 'job {jid[-2:]}', "
              f"'Orlando, FL', {pt[0]}, {pt[1]}, 8900, 7120, {acc});\n")
    return s


def build(db, with_0027=True):
    psql('postgres', f'drop database if exists {db};')
    must('postgres', f'create database {db};')
    must(db, SHIM)
    for p in migration_files():
        if p is None:
            must(db, 'alter table public.profiles add column if not exists pro_workspace jsonb;')
        elif not with_0027 and is_0027(p):
            continue
        else:
            must(db, open(p).read())
    must(db, fixture_sql())


def as_actor(who):
    if who == 'anon':
        return "set local role anon;\nselect set_config('request.jwt.claims', '{\"role\":\"anon\"}', true) \\g /dev/null\n"
    if who == 'nosub':
        return "set local role authenticated;\nselect set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', true) \\g /dev/null\n"
    claims = json.dumps({'sub': SUB[who], 'role': 'authenticated'})
    return f"set local role authenticated;\nselect set_config('request.jwt.claims', '{claims}', true) \\g /dev/null\n"


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
    ok = (expect(got) if callable(expect) else got == expect)
    RESULTS.append((group, label, ok, got, expect if not callable(expect) else '(predicate)'))
    print(f"{'PASS' if ok else 'FAIL'} [{group}] {label}: {got}" + ('' if ok else f'   expected {expect}'))


def denied(got):
    return got.startswith('ERR:permission denied')


def rpc(jid):
    return f"select public.get_assigned_job_destination('{jid}')::text"


def state(db):
    """Fingerprint of everything 0030 / rollback may touch, plus what they must not touch."""
    sql = r"""
select 'fn|' || p.oid::regprocedure || '|' || md5(pg_get_functiondef(p.oid)) || '|' || coalesce(p.proacl::text, '')
       || '|' || pg_get_userbyid(p.proowner)
  from pg_proc p where p.pronamespace = 'public'::regnamespace
union all
select 'pol|' || policyname || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  from pg_policies where schemaname = 'public'
union all
select 'trg|' || tgrelid::regclass || '|' || tgname || '|' || md5(pg_get_triggerdef(oid))
  from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'public.%'
union all
select 'rel|' || c.relname || '|' || c.relrowsecurity || '|' || coalesce(c.relacl::text, '')
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m','S')
union all
select 'col|' || table_name || '|' || column_name || '|' || data_type
  from information_schema.columns where table_schema = 'public'
union all
select 'rows|jobs|' || md5(string_agg(t::text, ';' order by t.id)) from public.jobs t
order by 1;"""
    return must(db, sql).splitlines()


def diff(a, b):
    sa, sb = set(a), set(b)
    return sorted(['-' + x for x in sa - sb] + ['+' + x for x in sb - sa])


def apply_file(db, path):
    r = psql(db, open(path).read())
    return r.returncode, r.stderr


def matrix(db, g):
    """The full RPC / board / direct-select matrix on a database that has 0027 + 0030."""
    # ── assigned Pro gets the exact stored point in every active status
    for st in ACTIVE:
        got = q(db, 'P1', rpc(J1), setup=f"update public.jobs set status = '{st}' where id = '{J1}'")
        exp = json.dumps({"ok": True, "status": st, "job_id": J1, "address": {"line": None, "unit": None, "access_notes": None},
                          "city_label": "Orlando, FL", "accepted_at": "2026-11-01T18:00:00Z",
                          "destination": {"lat": float(NEAR[0]), "lng": float(NEAR[1]), "source": "stored_job_point"}})
        check(g, f'P1 assigned, {st}: ok + exact stored point',
              got, lambda s, exp=exp: s.startswith('{') and json.loads(s) == json.loads(exp)
              and '"lat": 28.538336' in s and '"lng": -81.379234' in s)
    got = q(db, 'P1', f"select (public.get_assigned_job_destination('{J1}')->'destination'->>'lat')::numeric = j.lat "
                      f"and (public.get_assigned_job_destination('{J1}')->'destination'->>'lng')::numeric = j.lng "
                      f"from public.jobs j where j.id = '{J1}'")
    check(g, 'P1 RPC lat/lng == stored jobs.lat/lng (6 dp, P1 own row read)', got, 't')
    got = q(db, 'P1', rpc(J1), setup=f"update public.jobs set address_snapshot = '12 Test St' where id = '{J1}'")
    check(g, 'P1 RPC returns address_snapshot as address.line', got,
          lambda s: s.startswith('{') and json.loads(s)['address'] == {"line": "12 Test St", "unit": None, "access_notes": None})
    check(g, 'P1 RPC works in a READ ONLY transaction (no writes)', q(db, 'P1', rpc(J1), readonly=True),
          lambda s: s.startswith('{') and json.loads(s)['ok'] is True)
    # ── disallowed statuses (job still assigned to P1)
    for st in INACTIVE:
        got = q(db, 'P1', rpc(J1), setup=f"update public.jobs set status = '{st}' where id = '{J1}'")
        check(g, f'P1 assigned, {st}: refused', got, json.dumps({"ok": False, "error": "status_not_active", "status": st}))
    check(g, 'P1 on a posted, unassigned job (J_post): not_found', q(db, 'P1', rpc(J_POST)), NOT_FOUND)
    # ── no coordinates
    for col in ('lat', 'lng'):
        got = q(db, 'P1', rpc(J1), setup=f"update public.jobs set {col} = null where id = '{J1}'")
        check(g, f'P1 assigned + active, {col} null: no_coordinates', got,
              '{"ok": false, "error": "no_coordinates", "city_label": "Orlando, FL"}')
    # ── auth
    check(g, 'authenticated, no sub: not_authenticated', q(db, 'nosub', rpc(J1)),
          '{"ok": false, "error": "not_authenticated"}')
    check(g, 'anon RPC: permission denied', q(db, 'anon', rpc(J1)), denied)
    # ── non-assigned accounts: RPC
    for who, label in (('P2', 'unassigned Pro in range'), ('P3', 'Pro out of range'), ('C1', 'customer owner'),
                       ('C2', 'different customer'), ('P5', 'Pro assigned to another job')):
        check(g, f'RPC {label} ({who}) on J1: not_found', q(db, who, rpc(J1)), NOT_FOUND)
    check(g, 'RPC P1 on another Pro\'s job (J_other): not_found', q(db, 'P1', rpc(J_OTHER)), NOT_FOUND)
    check(g, 'RPC P1 on a nonexistent job: identical not_found (no oracle)', q(db, 'P1', rpc(J_NONE)), NOT_FOUND)
    check(g, 'RPC P2 nonexistent == P2 not-assigned (byte-identical)', q(db, 'P2', rpc(J_NONE)), q(db, 'P2', rpc(J1)))
    check(g, 'RPC null job id: not_found', q(db, 'P1', "select public.get_assigned_job_destination(null)::text"), NOT_FOUND)
    # ── non-assigned accounts: direct table read (0027)
    for who, label in (('P2', 'unassigned Pro in range'), ('P3', 'Pro out of range'), ('C2', 'different customer'),
                       ('P5', 'Pro assigned to another job')):
        check(g, f'direct select lat/lng of J1, {label} ({who}): 0 rows',
              q(db, who, f"select count(*) from public.jobs where id = '{J1}'"), '0')
        check(g, f'direct select of any non-null point not own, {who}: 0 rows',
              q(db, who, f"select count(*) from public.jobs where lat is not null and customer_id <> auth.uid() "
                         f"and coalesce(pro_id::text,'') <> auth.uid()::text"), '0')
    check(g, 'direct select anon: permission denied', q(db, 'anon', f"select lat from public.jobs where id = '{J1}'"), denied)
    check(g, 'direct select P2 of posted J_post (0023/0027): 0 rows',
          q(db, 'P2', f"select count(*) from public.jobs where id = '{J_POST}'"), '0')
    check(g, 'direct select C2 of C1 posted J_post: 0 rows',
          q(db, 'C2', f"select count(*) from public.jobs where id = '{J_POST}'"), '0')
    check(g, 'direct select P1 assigned J1: own row with exact point (REQ-01b)',
          q(db, 'P1', f"select lat || ',' || lng from public.jobs where id = '{J1}'"), f'{NEAR[0]},{NEAR[1]}')
    check(g, 'direct select P1 of J_other / J_post: 0 rows',
          q(db, 'P1', f"select count(*) from public.jobs where id in ('{J_OTHER}', '{J_POST}')"), '0')
    # Owner customer: 0027 jobs_select_own_customer returns their own row incl. lat/lng (documented, not changed here)
    check(g, 'direct select C1 (owner) of own J1: own row incl. point [0027 by design; see report]',
          q(db, 'C1', f"select lat || ',' || lng from public.jobs where id = '{J1}'"), f'{NEAR[0]},{NEAR[1]}')
    # ── board
    for who in ('P1', 'P2', 'P3', 'C1', 'C2'):
        check(g, f'board {who}: no row with non-null lat/lng',
              q(db, who, "select count(*) from public.jobs_posted_within_radius() where lat is not null or lng is not null"), '0')
        check(g, f'board {who}: never lists assigned J1 / J_other',
              q(db, who, f"select count(*) from public.jobs_posted_within_radius() where id in ('{J1}','{J_OTHER}')"), '0')
    setup_c2 = (f"update public.profiles set operating_lat = {NEAR[0]}, operating_lng = {NEAR[1]}, "
                f"pro_workspace = '{{\"travelRadius\":\"25\"}}' where id = '{C2}'")
    check(g, 'board C2 with a self-set operating point: rows but lat/lng null',
          q(db, 'C2', "select count(*) || ':' || count(lat) || ':' || count(lng) from public.jobs_posted_within_radius()",
            setup=setup_c2), '1:0:0')
    check(g, 'board anon: permission denied', q(db, 'anon', "select count(*) from public.jobs_posted_within_radius()"), denied)
    check(g, 'board P2: J_post present, lat/lng null, city_label kept',
          q(db, 'P2', "select id || '|' || coalesce(lat::text,'NULL') || '|' || coalesce(lng::text,'NULL') || '|' || city_label "
                      "from public.jobs_posted_within_radius()"), f'{J_POST}|NULL|NULL|Orlando, FL')
    check(g, 'board P3 (New York): only J_far, lat/lng null',
          q(db, 'P3', "select id || '|' || coalesce(lat::text,'NULL') from public.jobs_posted_within_radius()"), f'{J_FAR}|NULL')
    pc = cell(*POST)
    check(g, f'board P2: distance_mi = round(d * 2) / 2, d = distance to J_post cell centre {pc[0]},{pc[1]:.6f} (B1)',
          q(db, 'P2', f"select distance_mi = round(public.haven_distance_miles({NEAR[0]}, {NEAR[1]}, {pc[0]}, {pc[1]:.12f}) * 2) / 2 "
                      "from public.jobs_posted_within_radius()"), 't')
    check(g, 'board P2: distance_mi value (6.5 mi fixture)',
          q(db, 'P2', "select distance_mi = 6.5 from public.jobs_posted_within_radius()"), 't')
    check(g, 'board P2: distance_mi is a multiple of 0.5 and != full precision',
          q(db, 'P2', f"select (distance_mi * 2 = trunc(distance_mi * 2)) and distance_mi <> "
                      f"public.haven_distance_miles({NEAR[0]}, {NEAR[1]}, {POST[0]}, {POST[1]}) from public.jobs_posted_within_radius()"), 't')
    for d, e in (('0.24', '0.0'), ('0.26', '0.5'), ('3.74', '3.5'), ('3.76', '4.0'), ('24.99', '25.0')):
        check(g, f'rounding rule round(d*2)/2: {d} -> {e}', q(db, 'postgres', f"select round({d}::numeric * 2) / 2 = {e}"), 't')
    # ── claim flow: winner gets the point, others do not
    claim = f"select 1 from public.pro_claim_job('{J_POST}') \\g /dev/null\n"
    got = q(db, 'P2', claim + f"select public.get_assigned_job_destination('{J_POST}')->'destination'")
    check(g, 'P2 claims J_post, then P2 RPC: exact stored point', got,
          lambda s: s.startswith('{') and json.loads(s) == {"lat": float(POST[0]), "lng": float(POST[1]), "source": "stored_job_point"})
    for other in ('P3', 'C1', 'C2', 'P5'):
        sw = f"select set_config('request.jwt.claims', '{json.dumps({'sub': SUB[other], 'role': 'authenticated'})}', true) \\g /dev/null\n"
        check(g, f'after P2 claims J_post, {other} RPC: not_found', q(db, 'P2', claim + sw + rpc(J_POST)), NOT_FOUND)
        if other != 'C1':
            check(g, f'after P2 claims J_post, {other} direct select: 0 rows',
                  q(db, 'P2', claim + sw + f"select count(*) from public.jobs where id = '{J_POST}'"), '0')
    # ── function properties
    props = q(db, 'postgres', "select p.prosecdef || '|' || p.provolatile::text || '|' || array_to_string(p.proconfig, ',') || '|' "
                              "|| pg_get_function_result(p.oid) || '|' || has_function_privilege('anon', p.oid, 'EXECUTE') || '|' "
                              "|| has_function_privilege('authenticated', p.oid, 'EXECUTE') || '|' "
                              "|| (select count(*) from aclexplode(p.proacl) a where a.grantee = 0) || '|' "
                              "|| (p.proowner = (select relowner from pg_class where oid = 'public.jobs'::regclass)) "
                              "from pg_proc p where p.oid = 'public.get_assigned_job_destination(uuid)'::regprocedure")
    check(g, 'RPC: SECURITY DEFINER, STABLE, search_path=pg_catalog, public, pg_temp, jsonb, anon no, authenticated yes, PUBLIC no, owner=jobs owner',
          props, 'true|s|search_path=pg_catalog, public, pg_temp|jsonb|false|true|0|true')
    check(g, 'RPC body has no INSERT/UPDATE/DELETE/PERFORM',
          q(db, 'postgres', "select prosrc !~* '\\m(insert|update|delete|perform|execute)\\M' from pg_proc "
                            "where oid = 'public.get_assigned_job_destination(uuid)'::regprocedure"), 't')
    bprops = q(db, 'postgres', "select p.prosecdef || '|' || p.provolatile::text || '|' || array_to_string(p.proconfig, ',') || '|' "
                               "|| has_function_privilege('anon', p.oid, 'EXECUTE') || '|' || has_function_privilege('authenticated', p.oid, 'EXECUTE') "
                               "|| '|' || (select count(*) from aclexplode(p.proacl) a where a.grantee = 0) "
                               "from pg_proc p where p.oid = 'public.jobs_posted_within_radius()'::regprocedure")
    check(g, 'board: SECURITY DEFINER, STABLE, search_path=pg_catalog, public, pg_temp, anon no, authenticated yes, PUBLIC no',
          bprops, 'true|s|search_path=pg_catalog, public, pg_temp|false|true|0')


# ── B1: board grid + triangulation attacks ────────────────────────────────
# Python model of the board's grid (must match the SQL in 0030 exactly).
import math
from decimal import Decimal as D

R_MI = 3958.8
J_SEC1 = 'e0300000-0000-4000-8000-0000000000e1'   # secret posted job, off-centre in cell K
J_SEC2 = 'e0300000-0000-4000-8000-0000000000e2'   # second job in the same cell K, other corner
ATTACK_BASE = (28.540000, -81.380000)              # the attacking Pro's (P2) own starting point


def cell(lat, lng):
    lat, lng = D(str(lat)), D(str(lng))
    row = min(max(math.floor((lat + 90) / D('0.01')), 0), 17999)
    clat = D(-90) + (D(row) + D('0.5')) * D('0.01')
    n = max(1, math.floor(36000 * math.cos(math.radians(float(clat)))))
    col = math.floor((lng + 180) * n / 360) % n
    return (float(clat), -180 + (col + 0.5) * 360 / n, n)


def hav(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    x = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 2 * R_MI * math.asin(min(1, math.sqrt(x)))


def move(o, brg, miles):
    return (o[0] + miles / 69.093 * math.cos(brg), o[1] + miles / (69.093 * math.cos(math.radians(o[0]))) * math.sin(brg))


K = cell(28.5655, -81.3555)
T1 = (round(K[0] + 0.0042, 6), round(K[1] - 0.0049, 6))
T2 = (round(K[0] - 0.0040, 6), round(K[1] + 0.0050, 6))
KC = (K[0], K[1])


def job_insert(jid, pt, cust=None):
    lat, lng = ('null', 'null') if pt is None else (pt[0] if pt[0] is not None else 'null', pt[1] if pt[1] is not None else 'null')
    return ("insert into public.jobs(id, customer_id, pro_id, status, category, title, city_label, lat, lng, "
            "fixed_customer_labor_price_cents, fixed_pro_labor_payout_cents, posted_at) values "
            f"('{jid}', '{cust or C2}', null, 'posted', 'Plumbing', 'secret {jid[-2:]}', 'Orlando, FL', {lat}, {lng}, "
            f"8900, 7120, now())")


SEC_SETUP = job_insert(J_SEC1, T1) + ';\n' + job_insert(J_SEC2, T2)


def set_own(pt, r):
    return (f"update public.profiles set operating_lat = {pt[0]:.6f}, operating_lng = {pt[1]:.6f}, "
            f"pro_workspace = jsonb_build_object('travelRadius', '{r}') where id = auth.uid() \\g /dev/null\n")


class Oracle:
    """What an ordinary Pro (P2) can do: PATCH own profile, read the board. Counts board calls."""
    def __init__(self, db, jid):
        self.db, self.jid, self.calls = db, jid, 0

    def board(self, pt, r):
        self.calls += 1
        got = q(self.db, 'P2', set_own(pt, r) + f"select coalesce((select distance_mi::text from public.jobs_posted_within_radius() "
                                                 f"where id = '{self.jid}'), 'absent')", setup=SEC_SETUP)
        if got.startswith('ERR'):
            raise SystemExit('oracle error: ' + got)
        return None if got == 'absent' else D(got)


def solve(anchors, start):
    """Least-squares (Gauss-Newton) point P with hav(P, B_i) = d_i."""
    P = list(start)
    for _ in range(80):
        a = b = c = g0 = g1 = 0.0
        for B, d in anchors:
            f = hav(P, B) - d; e = 1e-7
            fa = (hav((P[0] + e, P[1]), B) - hav(P, B)) / e
            fb = (hav((P[0], P[1] + e), B) - hav(P, B)) / e
            a += fa * fa; b += fa * fb; c += fb * fb; g0 += fa * f; g1 += fb * f
        det = a * c - b * b
        if det == 0:
            break
        P[0] -= (c * g0 - b * g1) / det; P[1] -= (-b * g0 + a * g1) / det
    return tuple(P)


def attack_radius(o, radii=(5,), bearings=(0, 2.1, 4.2)):
    """Membership oracle at the radius edge: bisect along each bearing where the job (dis)appears."""
    anchors = []
    for i, brg in enumerate(bearings):
        r = radii[i % len(radii)]
        lo, hi = 0.0, r + 4.0
        assert o.board(move(ATTACK_BASE, brg, lo), r) is not None
        for _ in range(40):
            mid = (lo + hi) / 2
            if o.board(move(ATTACK_BASE, brg, mid), r) is not None:
                lo = mid
            else:
                hi = mid
        anchors.append((move(ATTACK_BASE, brg, lo), float(r)))
    return solve(anchors, ATTACK_BASE)


def attack_step(o, bearings=(0, 2.1, 4.2)):
    """Distance-step oracle at radius 25: bisect where the rounded distance_mi flips (k/2 + 0.25)."""
    anchors = []
    for brg in bearings:
        d0 = o.board(ATTACK_BASE, 25); lo, t = 0.0, 0.0
        while True:
            t += 0.2; d = o.board(move(ATTACK_BASE, brg, t), 25)
            if d != d0:
                hi = t; break
            lo = t
        for _ in range(40):
            mid = (lo + hi) / 2
            if o.board(move(ATTACK_BASE, brg, mid), 25) == d0:
                lo = mid
            else:
                hi = mid
        d1 = o.board(move(ATTACK_BASE, brg, hi), 25)
        anchors.append((move(ATTACK_BASE, brg, lo), float(d0 + d1) / 2))
    return solve(anchors, ATTACK_BASE)


ATTACKS = (
    ('A operating-point sweep, radius-edge oracle (radius 5, 3 bearings)', lambda o: attack_radius(o)),
    ('B radius sweep 5/10/15/25/50 x 5 bearings, radius-edge oracle',
     lambda o: attack_radius(o, radii=(5, 10, 15, 25, 50), bearings=tuple(i * 2 * math.pi / 5 for i in range(5)))),
    ('C operating-point sweep, distance-step oracle (radius 25)', lambda o: attack_step(o)),
)


def triangulation(db, g, coarse=True):
    """coarse=True: after 0030 the best estimate is the cell centre. coarse=False (control, 0023 board):
    the same attacks recover the exact point, proving they are real attacks."""
    tol_m = 5.0
    est = {}
    for name, fn in ATTACKS:
        for jid, T in ((J_SEC1, T1), (J_SEC2, T2)):
            o = Oracle(db, jid)
            E = fn(o)
            est[(name, jid)] = E
            e_true = hav(E, T) * 1609.344
            e_cell = hav(E, KC) * 1609.344
            floor_m = hav(KC, T) * 1609.344
            tag = f'{name} on {jid[-2:]} ({o.calls} board calls): est {E[0]:.6f},{E[1]:.6f} err_true {e_true:.1f} m, err_cell_centre {e_cell:.2f} m'
            if coarse:
                check(g, f'{tag}: converges to cell centre (< {tol_m} m)', e_cell < tol_m, True)
                check(g, f'{tag}: error vs true point >= dist(true, cell centre) {floor_m:.0f} m - {tol_m} m',
                      e_true >= floor_m - tol_m, True)
                check(g, f'{tag}: error vs true point >= 400 m (test point placed off-centre)', e_true >= 400, True)
            else:
                check(g, f'[control, exact board] {tag}: recovers true point (< {tol_m} m)', e_true < tol_m, True)
    if coarse:
        for name, _ in ATTACKS:
            a, b = est[(name, J_SEC1)], est[(name, J_SEC2)]
            check(g, f'{name}: two jobs {hav(T1, T2)*1609.344:.0f} m apart in one cell give the same estimate (< {tol_m} m)',
                  hav(a, b) * 1609.344 < tol_m, True)


def indistinguishable(db, g):
    """Same cell => same board answer from every point and radius (presence and distance_mi)."""
    import random
    rnd = random.Random(30)
    pts = [move(KC, rnd.uniform(0, 2 * math.pi), rnd.uniform(0, 55)) for _ in range(90)]
    pts += [move(KC, rnd.uniform(0, 2 * math.pi), r + rnd.uniform(-0.6, 0.6)) for r in (5, 10, 15, 25, 50) for _ in range(12)]
    radii = (5, 10, 15, 25, 50)
    script = 'begin;\n' + owner_setup(SEC_SETUP) + as_actor('P2')
    for pt in pts:
        for r in radii:
            script += set_own(pt, r)
            script += (f"select coalesce((select distance_mi::text from public.jobs_posted_within_radius() where id = '{J_SEC1}'), '-')"
                       f" || '|' || coalesce((select distance_mi::text from public.jobs_posted_within_radius() where id = '{J_SEC2}'), '-');\n")
    script += 'rollback;\n'
    r = psql(db, script)
    lines = [l for l in r.stdout.splitlines() if '|' in l]
    combos = [(pt, rr) for pt in pts for rr in radii]
    same = sum(1 for l in lines if l.split('|')[0] == l.split('|')[1])
    shown = sum(1 for l in lines if l.split('|')[0] != '-')
    hidden = len(lines) - shown
    exact_differs = 0
    for (pt, rr) in combos:
        p1 = (round(pt[0], 6), round(pt[1], 6))
        d1, d2 = hav(p1, T1), hav(p1, T2)
        if (d1 <= rr) != (d2 <= rr) or (d1 <= rr and round(d1 * 2) != round(d2 * 2)):
            exact_differs += 1
    check(g, f'same-cell jobs indistinguishable: {len(lines)} (point, radius) probes, identical presence + distance_mi',
          (r.returncode, len(lines), same), (0, len(combos), len(combos)))
    check(g, f'probe set is not vacuous: shown {shown}, hidden {hidden}, and an exact-point board would differ on {exact_differs}',
          shown > 50 and hidden > 50 and exact_differs > 50, True)


def grid_checks(db, g):
    # model sanity (Python model of the SQL grid; the SQL is checked against it below)
    lat_mi = hav((K[0] - 0.005, K[1]), (K[0] + 0.005, K[1]))
    lng_mi = hav((K[0], K[1] - 180 / K[2]), (K[0], K[1] + 180 / K[2]))
    check(g, f'grid cell near Orlando ({K[0]} N, n={K[2]}): {lat_mi:.3f} mi N-S x {lng_mi:.3f} mi E-W (both 0.65..0.75)',
          0.65 < lat_mi < 0.75 and 0.65 < lng_mi < 0.75, True)
    check(g, 'T1 and T2 are in the same cell, off-centre by >= 0.25 mi',
          (cell(*T1) == K and cell(*T2) == K and hav(T1, KC) > 0.25 and hav(T2, KC) > 0.25), True)
    for la in (28.5, 45.0, 60.0, 75.0):
        c = cell(la, 10.0)
        check(g, f'grid cell E-W width at {la} N ~0.69 mi (n={c[2]})',
              0.68 < hav((c[0], c[1] - 180 / c[2]), (c[0], c[1] + 180 / c[2])) < 0.70, True)
    # board uses the cell centre: Pro at the centre sees distance 0.0 for both jobs (exact would be 0.5)
    o = (round(KC[0], 6), round(KC[1], 6))
    got = q(db, 'P2', set_own(o, 5) + f"select string_agg(id || ':' || distance_mi::float8, ',' order by id) from public.jobs_posted_within_radius() "
                                      f"where id in ('{J_SEC1}','{J_SEC2}')", setup=SEC_SETUP)
    check(g, f'Pro at cell centre: both jobs distance 0.0 (exact would be {round(hav(o, T1)*2)/2} / {round(hav(o, T2)*2)/2})',
          got, f'{J_SEC1}:0,{J_SEC2}:0')
    # radius filter uses the cell centre: point where centre is inside 5 mi but T1 outside -> listed; claim refused
    brg = math.atan2((T1[1] - KC[1]) * math.cos(math.radians(KC[0])), T1[0] - KC[0]) + math.pi  # away from T1
    p_in = move(KC, brg, 4.9); p_in = (round(p_in[0], 6), round(p_in[1], 6))
    check(g, f'fixture: centre {hav(p_in, KC):.3f} mi <= 5 < true {hav(p_in, T1):.3f} mi', hav(p_in, KC) <= 5 < hav(p_in, T1), True)
    check(g, 'radius filter on cell centre: job whose TRUE point is outside 5 mi is listed (distance 5.0)',
          q(db, 'P2', set_own(p_in, 5) + f"select distance_mi::float8 from public.jobs_posted_within_radius() where id = '{J_SEC1}'",
            setup=SEC_SETUP), '5')
    check(g, 'consequence: that listed job is refused by pro_claim_job (exact-point radius check unchanged)',
          q(db, 'P2', set_own(p_in, 5) + f"select 1 from public.pro_claim_job('{J_SEC1}')", setup=SEC_SETUP),
          'ERR:job outside operating radius')
    p_out = move(KC, brg + math.pi, 5.1); p_out = (round(p_out[0], 6), round(p_out[1], 6))
    check(g, f'fixture: true {hav(p_out, T1):.3f} mi <= 5 < centre {hav(p_out, KC):.3f} mi', hav(p_out, T1) <= 5 < hav(p_out, KC), True)
    check(g, 'radius filter on cell centre: job whose TRUE point is inside 5 mi is not listed',
          q(db, 'P2', set_own(p_out, 5) + f"select count(*) from public.jobs_posted_within_radius() where id = '{J_SEC1}'",
            setup=SEC_SETUP), '0')
    check(g, 'consequence: pro_claim_job still accepts it from there (exact check unchanged; id must already be known)',
          q(db, 'P2', set_own(p_out, 5) + f"select pro_id = auth.uid() from public.pro_claim_job('{J_SEC1}')", setup=SEC_SETUP), 't')
    # edge cases: poles, antimeridian, equator, nulls, out-of-range latitude
    E = {'np': ('e0300000-0000-4000-8000-0000000000d1', (90, 0)),
         'sp': ('e0300000-0000-4000-8000-0000000000d2', (-90, 0)),
         'np2': ('e0300000-0000-4000-8000-0000000000d3', (89.999999, 123.4)),
         'am180': ('e0300000-0000-4000-8000-0000000000d4', (28.5, 180)),
         'amm180': ('e0300000-0000-4000-8000-0000000000d5', (28.5, -180)),
         'am179': ('e0300000-0000-4000-8000-0000000000d6', (28.5, 179.999999)),
         'eq': ('e0300000-0000-4000-8000-0000000000d7', (0, 0)),
         'eqs': ('e0300000-0000-4000-8000-0000000000d8', (-0.000001, -0.000001)),
         'nolat': ('e0300000-0000-4000-8000-0000000000d9', (None, -81.3)),
         'nolng': ('e0300000-0000-4000-8000-0000000000da', (28.5, None)),
         'lat95': ('e0300000-0000-4000-8000-0000000000db', (95, 10))}
    setup = ';\n'.join(job_insert(j, p) for j, p in E.values())

    def board_at(pt, r=5):
        got = q(db, 'P2', set_own(pt, r) + "select string_agg(id || ':' || distance_mi::float8, ',' order by id) from public.jobs_posted_within_radius() "
                                           "where id::text like 'e0300000-0000-4000-8000-0000000000d%'", setup=setup)
        return dict(x.split(':') for x in got.split(',')) if got not in ('-', '') and not got.startswith('ERR') else got

    def ctr(k):
        c = cell(*E[k][1]); return (round(c[0], 6), round(c[1], 6))
    b = board_at(ctr('np'))
    check(g, f'north pole job (90,0) -> cell centre {ctr("np")} (row clamped, n={cell(90, 0)[2]}): listed at 0.0; (89.999999,123.4) other polar cell listed',
          b, lambda b: isinstance(b, dict) and b.get(E['np'][0]) == '0' and E['np2'][0] in b and E['sp'][0] not in b)
    b = board_at(ctr('sp'))
    check(g, 'south pole job (-90,0): listed at 0.0 from its cell centre', b, lambda b: isinstance(b, dict) and b.get(E['sp'][0]) == '0')
    b = board_at(ctr('am180'))
    check(g, f'antimeridian: lng 180 and -180 share one cell (centre {ctr("am180")}), both 0.0; lng 179.999999 is the adjacent cell (0.5), not 24,900 mi',
          b, lambda b: isinstance(b, dict) and b.get(E['am180'][0]) == '0' and b.get(E['amm180'][0]) == '0' and b.get(E['am179'][0]) == '0.5')
    b = board_at(ctr('eq'))
    check(g, 'equator: (0,0) at 0.0, (-0.000001,-0.000001) in the cell to the south (0.5)',
          b, lambda b: isinstance(b, dict) and b.get(E['eq'][0]) == '0' and b.get(E['eqs'][0]) == '0.5')
    b50 = [board_at(pt, 50) for pt in ((28.5, -81.3), (28.5, 0.0), (0.0, 0.0), (89.0, 0.0))]
    check(g, 'null lat or null lng: never listed (any point, radius 50), no error',
          all(not isinstance(x, str) or x == '-' for x in b50) and
          all(E['nolat'][0] not in x and E['nolng'][0] not in x for x in b50 if isinstance(x, dict)), True)
    b = board_at(ctr('np'), 50)
    check(g, 'invalid lat 95 (numeric(9,6) allows it) does not break the board: clamped into the polar row',
          isinstance(b, dict) and E['lat95'][0] in b, True)


# ── C1: pro_claim_job busy-Pro oracle; H1: search_path ───────────────────
SP_PINNED = 'search_path=pg_catalog, public, pg_temp'
CLAIM_MD5_0030 = '789cb65e77775da031012f78227d76ad'   # md5(prosrc) of 0030's pro_claim_job
RACE_LOSER = ['ERROR:  P0002: job not claimable']     # today's (0023) loser response
J_RACE = 'e0300000-0000-4000-8000-0000000000b1'
J_NOPT = 'e0300000-0000-4000-8000-0000000000b2'   # posted job without coordinates


def qerr(db, who, sql, setup=''):
    """Like q(), but returns the full error a client sees: sqlstate, message, detail, hint and the
    schema/table/constraint fields (psql VERBOSITY verbose). CONTEXT / LOCATION are server-internal
    (PostgREST does not send them) and are dropped. Success returns ('OK', rows)."""
    r = psql(db, "\\set VERBOSITY verbose\nbegin;\n" + (owner_setup(setup) if setup else '') + as_actor(who) + sql + ";\nrollback;\n")
    if r.returncode == 0 and 'ERROR:' not in r.stderr:
        return ('OK', ','.join(l for l in r.stdout.splitlines() if l.strip()))
    out, keep = [], False
    for l in r.stderr.splitlines():
        m = re.match(r'^psql:.*?ERROR:\s+(\w{5}): (.*)$', l) or re.match(r'^ERROR:\s+(\w{5}): (.*)$', l)
        if m:
            out = [('code', m.group(1)), ('message', m.group(2))]; keep = True; continue
        if keep:
            m = re.match(r'^(DETAIL|HINT|SCHEMA NAME|TABLE NAME|CONSTRAINT NAME|COLUMN NAME|DATATYPE NAME):\s+(.*)$', l)
            if m:
                out.append((m.group(1), m.group(2)))
    return tuple(out) if out else ('ERR?', r.stderr.strip()[:300])


def claim_sql(jid, pt=None, r=25):
    return (set_own(pt, r) if pt else '') + f"select id || '|' || status || '|' || pro_id || '|' || (accepted_at is not null) from public.pro_claim_job('{jid}')"


def claim_cases():
    """(label, actor, sql, setup) cases whose client-visible response must be the same before and after 0030,
    plus the busy-Pro cases that 0030 is meant to change."""
    sec_in, sec_out = (round(T1[0] + 0.01, 6), round(T1[1], 6)), (40.712776, -74.005974)
    nopt = job_insert(J_NOPT, None)
    same = [
        ('free Pro P2, job inside radius: claimed (row)', 'P2', claim_sql(J_SEC1, sec_in), SEC_SETUP),
        ('free Pro P2, job outside radius: P0001', 'P2', claim_sql(J_SEC1, sec_out), SEC_SETUP),
        ('free Pro P2, job without coordinates: P0001', 'P2', claim_sql(J_NOPT, sec_in), nopt),
        ('free Pro P2, nonexistent job: P0002', 'P2', claim_sql(J_NONE, sec_in), ''),
        ('free Pro P2, job already assigned (J1): P0002', 'P2', claim_sql(J1, sec_in), ''),
        ('busy Pro P1, job already assigned (J_other): P0002 (not-claimable first, as today)', 'P1', claim_sql(J_OTHER), ''),
        ('busy Pro P1, nonexistent job: P0002', 'P1', claim_sql(J_NONE), ''),
        ('busy Pro P1, job inside radius: 23505 one_active_job_per_pro', 'P1', claim_sql(J_SEC1, sec_in), SEC_SETUP),
        ('signed-in, no sub: 28000', 'nosub', claim_sql(J_SEC1), SEC_SETUP),
        ('anon: permission denied', 'anon', claim_sql(J_SEC1), SEC_SETUP),
        ('P1 no longer busy (J1 complete), job inside: claimed (row)', 'P1', claim_sql(J_SEC1, sec_in),
         SEC_SETUP + f";\nupdate public.jobs set status = 'complete' where id = '{J1}'"),
        ('P1 no longer busy (J1 complete), job outside: P0001', 'P1', claim_sql(J_SEC1, sec_out),
         SEC_SETUP + f";\nupdate public.jobs set status = 'complete' where id = '{J1}'"),
    ]
    changed = [
        ('busy Pro P1, job OUTSIDE radius', 'P1', claim_sql(J_SEC1, sec_out), SEC_SETUP),
        ('busy Pro P1, job without coordinates', 'P1', claim_sql(J_NOPT, sec_in), nopt),
        ('busy Pro P1, job inside but radius 5 from far away', 'P1', claim_sql(J_SEC1, sec_out, 5), SEC_SETUP),
    ]
    for st in ACTIVE:
        changed.append((f'busy Pro P1 (J1 {st}), job outside radius', 'P1', claim_sql(J_SEC1, sec_out),
                        SEC_SETUP + f";\nupdate public.jobs set status = '{st}' where id = '{J1}'"))
    return same, changed


def claim_baseline(db):
    same, changed = claim_cases()
    return {lbl: qerr(db, who, sql, st) for lbl, who, sql, st in same + changed}


def c1_checks(db, g, base):
    same, changed = claim_cases()
    busy_ref = base['busy Pro P1, job inside radius: 23505 one_active_job_per_pro']
    check(g, 'reference (before 0030): busy Pro, job inside -> 23505 from the unique index', busy_ref,
          (('code', '23505'), ('message', 'duplicate key value violates unique constraint "one_active_job_per_pro"'),
           ('DETAIL', f'Key (pro_id)=({P1}) already exists.'), ('SCHEMA NAME', 'public'), ('TABLE NAME', 'jobs'),
           ('CONSTRAINT NAME', 'one_active_job_per_pro')))
    for lbl, who, sql, st in same:
        got = qerr(db, who, sql, st)
        check(g, f'claim unchanged vs before 0030: {lbl}', got, base[lbl])
    for lbl, who, sql, st in changed:
        got = qerr(db, who, sql, st)
        check(g, f'C1: {lbl} -> identical to busy+inside 23505 (before 0030: {base[lbl][0][1] if base[lbl][0][0] == "code" else base[lbl][0]})',
              got, busy_ref)
    # busy-Pro sweep: identical responses everywhere, and the attack learns nothing
    import random
    rnd = random.Random(31)
    script = "\\set VERBOSITY verbose\n\\set ON_ERROR_STOP 0\nbegin;\n" + owner_setup(SEC_SETUP) + as_actor('P1')
    pts = [(move(KC, rnd.uniform(0, 2 * math.pi), rnd.uniform(0, 60)), rnd.choice((5, 10, 15, 25, 50))) for _ in range(120)]
    for pt, rr in pts:
        script += "savepoint s;\n" + set_own(pt, rr) + f"select 1 from public.pro_claim_job('{J_SEC1}');\nrollback to savepoint s;\n"
    script += "rollback;\n"
    r = psql(db, script, stop=False)
    errs = [l for l in r.stderr.splitlines() if 'ERROR:' in l]
    kinds = sorted(set(re.sub(r'^psql:[^:]*:\d+: ', '', l) for l in errs))
    inside = sum(1 for pt, rr in pts if hav((round(pt[0], 6), round(pt[1], 6)), T1) <= rr)
    check(g, f'C1 sweep: busy Pro, 120 operating points/radii ({inside} inside, {120 - inside} outside): one identical error for all',
          (len(errs), kinds), (120, ['ERROR:  23505: duplicate key value violates unique constraint "one_active_job_per_pro"']))


def c1_attack_check(db, g, control=False):
    class ClaimOracle:
        def __init__(self):
            self.calls = 0

        def board(self, pt, rr):
            self.calls += 1
            got = q(db, 'P1', set_own(pt, rr) + f"select 1 from public.pro_claim_job('{J_SEC1}')", setup=SEC_SETUP)
            if got.startswith('ERR:') and got not in ('ERR:job outside operating radius',
                                                     'ERR:duplicate key value violates unique constraint "one_active_job_per_pro"'):
                raise SystemExit('claim oracle: unexpected ' + got)
            return None if got == 'ERR:job outside operating radius' else 1
    o = ClaimOracle()
    E = attack_radius(o)
    e_true, e_cell = hav(E, T1) * 1609.344, hav(E, KC) * 1609.344
    tag = (f'C1 attack replay (busy Pro P1 sweeps own point, radius 5, claim responses as oracle; {o.calls} claim calls): '
           f'err_true {e_true:.2f} m')
    if control:
        check(g, f'[control, 0023 pro_claim_job] {tag}: recovers the true point (< 5 m)', e_true < 5, True)
    else:
        check(g, f'{tag}: no better than the grid cell (>= true-to-centre {hav(KC, T1) * 1609.344:.0f} m)',
              e_true >= hav(KC, T1) * 1609.344 - 5, True)


def race(db, g, label, expect_loser):
    """Two free Pros claim one committed job at the same time. Winner holds its transaction 1.5 s."""
    import time
    setup = (f"insert into public.jobs(id, customer_id, pro_id, status, category, title, city_label, lat, lng, "
             f"fixed_customer_labor_price_cents, fixed_pro_labor_payout_cents) values ('{J_RACE}', '{C2}', null, 'posted', "
             f"'Plumbing', 'race', 'Orlando, FL', {NEAR[0]}, {NEAR[1]}, 8900, 7120);\n"
             f"update public.jobs set status = 'complete' where id = '{J1}';\n")   # P1 free for the race
    must(db, "set session_replication_role = replica;\n" + setup)
    base = PSQL + ['-d', db]
    win = subprocess.Popen(base + ['-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, text=True)
    win_sql = ("begin;\n" + as_actor('P2') + f"select id || '|' || status || '|' || pro_id from public.pro_claim_job('{J_RACE}');\n"
               "select pg_sleep(1.5);\ncommit;\n")
    win.stdin.write(win_sql); win.stdin.close()
    time.sleep(0.5)
    loser = subprocess.run(base + ['-v', 'ON_ERROR_STOP=1'],
                           input="\\set VERBOSITY verbose\nbegin;\n" + as_actor('P1') + f"select 1 from public.pro_claim_job('{J_RACE}');\ncommit;\n",
                           capture_output=True, text=True)
    wout = win.stdout.read(); win.wait()
    lerr = [re.sub(r'^psql:[^:]*:\d+: ', '', l) for l in loser.stderr.splitlines() if 'ERROR:' in l]
    final = must(db, f"select status || '|' || pro_id from public.jobs where id = '{J_RACE}'").strip()
    must(db, f"set session_replication_role = replica;\ndelete from public.jobs where id = '{J_RACE}';\n"
             f"update public.jobs set status = 'en_route' where id = '{J1}';\n")
    check(g, f'{label}: winner P2 gets the claimed row, job en_route for P2', (f'{J_RACE}|en_route|{P2}' in wout, final),
          (True, f'en_route|{P2}'))
    check(g, f'{label}: loser P1 response', lerr, expect_loser)
    return lerr


def h1_checks(db, g):
    rows = q(db, 'postgres', "select string_agg(p.proname || '=' || coalesce(array_to_string(p.proconfig, ';'), ''), '#' order by p.proname) "
                             "from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in "
                             "('jobs_posted_within_radius','get_assigned_job_destination','pro_claim_job',"
                             "'haven_caller_within_radius','haven_profile_radius_miles','haven_distance_miles','jobs_enforce_claim_radius')")
    got = dict(x.split('=', 1) for x in rows.split('#'))
    for fn in ('jobs_posted_within_radius', 'get_assigned_job_destination', 'pro_claim_job'):
        check(g, f'H1: {fn} proconfig = {{"{SP_PINNED}"}}', got.get(fn), SP_PINNED)
    for fn in ('haven_caller_within_radius', 'haven_profile_radius_miles', 'haven_distance_miles', 'jobs_enforce_claim_radius'):
        check(g, f'H1: 0023 {fn} left alone (search_path=public)', got.get(fn), 'search_path=public')
    for fn in ('jobs_posted_within_radius()', 'get_assigned_job_destination(uuid)', 'pro_claim_job(uuid)'):
        check(g, f'H1: {fn} is SECURITY DEFINER, owner = jobs owner, anon no, authenticated yes',
              q(db, 'postgres', f"select p.prosecdef || '|' || (p.proowner = (select relowner from pg_class where oid = 'public.jobs'::regclass)) "
                                f"|| '|' || has_function_privilege('anon', p.oid, 'EXECUTE') || '|' || has_function_privilege('authenticated', p.oid, 'EXECUTE') "
                                f"from pg_proc p where p.oid = 'public.{fn}'::regprocedure"), 'true|true|false|true')
    # Quagon's pg_temp type-shadow probe (pg_temp.text domain whose CHECK runs the caller's function).
    leak = ("create function pg_temp.leak(v varchar) returns boolean language plpgsql as $f$ declare r record; begin "
            "for r in select lat, lng from public.jobs where lat is not null loop raise notice 'LEAK as % % %', current_user, r.lat, r.lng; end loop; "
            "return true; end $f$;\ncreate domain pg_temp.text as varchar check (pg_temp.leak(value));\n")
    r = psql(db, "begin;\n" + as_actor('P2') + leak + rpc(J1) + ";\nrollback;\n", stop=False)
    check(g, 'H1: pg_temp.text shadow does not run inside get_assigned_job_destination (no LEAK, not_found)',
          ('LEAK' in r.stderr, NOT_FOUND in r.stdout), (False, True))
    r = psql(db, "begin;\n" + as_actor('P1') + leak + f"select 1 from public.pro_claim_job('{J_NONE}');\nrollback;\n", stop=False)
    check(g, "H1: pg_temp.text shadow does not run inside pro_claim_job's own body (no LEAK)", 'LEAK' in r.stderr, False)
    # Informational (not a check): the board and pro_claim_job still call 0023 helpers that pin
    # search_path = public only (brief: leave them alone); report whether the shadow reaches them.
    for label, who, setup, sql in (
            ('board', 'P2', '', "select count(*) from public.jobs_posted_within_radius()"),
            ('pro_claim_job (free Pro, claimable job)', 'P2', SEC_SETUP, f"select 1 from public.pro_claim_job('{J_SEC1}')")):
        r = psql(db, "\\set VERBOSITY verbose\n\\set SHOW_CONTEXT always\nbegin;\n" + (owner_setup(setup) if setup else '')
                 + as_actor(who) + leak + sql + ";\nrollback;\n", stop=False)
        ctx = sorted(set(re.findall(r'PL/pgSQL function (haven_\w+|jobs_\w+|pro_\w+|get_\w+)\(', r.stderr)))
        users = sorted(set(re.findall(r'LEAK as (\w+)', r.stderr)))
        print(f"INFO [{g}] {label} + pg_temp.text shadow: LEAK={'LEAK' in r.stderr} as {users or '-'} inside {ctx or '-'} "
              "(0023 helper with search_path=public; residual, see report)")

def lat90_check(db, g):
    """Quagon's survivor: lat clamp. A job at exactly +90 must land in row 17999 (cell_lat 89.995), not 90.005."""
    j90 = 'e0300000-0000-4000-8000-0000000000c9'
    got = q(db, 'P2', set_own((89.995, 0.0), 5) + f"select distance_mi::float8 from public.jobs_posted_within_radius() where id = '{j90}'",
            setup=job_insert(j90, (90, 45)))
    check(g, 'lat clamp: job at lat +90.000000 -> cell row 17999 (centre 89.995, 0): distance 0 from (89.995, 0)', got, '0')
    jm = 'e0300000-0000-4000-8000-0000000000ca'
    got = q(db, 'P2', set_own((-89.995, 0.0), 5) + f"select distance_mi::float8 from public.jobs_posted_within_radius() where id = '{jm}'",
            setup=job_insert(jm, (-90, -45)))
    check(g, 'lat clamp: job at lat -90.000000 -> row 0 (centre -89.995, 0): distance 0', got, '0')


BOARD_COLS = ("id, category, title, fixed_pro_labor_payout_cents, requires_diagnosis, city_label, emergency, posted_at, "
              "status, pro_id, inspection_fee_cents")


def main():
    print('0030 sha256', sha(F30))
    print('rollback sha256', sha(R30))
    for p in migration_files():
        if p:
            print('base', os.path.basename(p), sha(p)[:16])
    m30 = open(F30).read()
    blk = m30[m30.index('-- ── Rollback (only if this file must be undone'):]
    blk = '\n'.join(l[3:] if l.startswith('-- ') else l[2:] for l in blk.split('\n') if l.startswith('--'))
    rb = open(R30).read()
    check('files', 'rollback block in 0030 == rollback file (begin..commit)',
          blk[blk.index('begin;'):blk.index('commit;')] == rb[rb.index('begin;'):rb.index('commit;')], True)
    db = PREFIX + '_main'
    build(db)
    G = 'pre'
    pre = state(db)
    check(G, '0027 applied: 0007 policy absent, 0027 policies present',
          q(db, 'postgres', "select string_agg(policyname, ',' order by policyname) from pg_policies "
                            "where tablename = 'jobs' and cmd = 'SELECT'"),
          'jobs_select_assigned_pro,jobs_select_own_customer,jobs_select_own_posted')
    check(G, 'before 0030: board P2 returns exact lat (the leak 0030 closes)',
          q(db, 'P2', "select lat || ',' || lng from public.jobs_posted_within_radius()"), f'{POST[0]},{POST[1]}')
    check(G, 'before 0030: RPC absent', q(db, 'postgres', "select coalesce(to_regprocedure('public.get_assigned_job_destination(uuid)')::text, 'absent')"), 'absent')
    pre_sig = q(db, 'postgres', "select pg_get_function_result('public.jobs_posted_within_radius()'::regprocedure) || '|' || pg_get_function_identity_arguments('public.jobs_posted_within_radius()'::regprocedure)")
    pre_board = {w: q(db, w, f"select {BOARD_COLS} from public.jobs_posted_within_radius()") for w in ('P1', 'P2', 'P3', 'C1')}

    claim_base = claim_baseline(db)
    pre_claim_md5 = q(db, 'postgres', "select md5(prosrc) from pg_proc where oid = 'public.pro_claim_job(uuid)'::regprocedure")
    check(G, 'before 0030: pro_claim_job body is 0023 (md5 4760bcab...)', pre_claim_md5, '4760bcab07cf0bf907addf67036f2da7')
    c1_attack_check(db, 'c1-control', control=True)
    race(db, 'c1-race', 'race before 0030 (0023 pro_claim_job)', RACE_LOSER)
    rc, err = apply_file(db, F30)
    check('apply', '0030 applies cleanly on master + 0027', rc, 0)
    check('apply', 'pro_claim_job body md5 after 0030',
          q(db, 'postgres', "select md5(prosrc) from pg_proc where oid = 'public.pro_claim_job(uuid)'::regprocedure"), CLAIM_MD5_0030)
    c1_checks(db, 'c1', claim_base)
    c1_attack_check(db, 'c1')
    race(db, 'c1-race', 'race after 0030', RACE_LOSER)
    h1_checks(db, 'h1')
    lat90_check(db, 'grid')
    grid_checks(db, 'grid')
    triangulation(db, 'b1-triangulation')
    indistinguishable(db, 'b1-triangulation')
    if rc:
        print(err)
    post1 = state(db)
    d = diff(pre, post1)
    allowed = [x for x in d if re.match(r'^[+-]fn\|(jobs_posted_within_radius\(\)|get_assigned_job_destination\(uuid\)|pro_claim_job\(uuid\))\|', x)]
    check('apply', '0030 changes only the board, pro_claim_job + new RPC (policies, triggers, grants, tables, rows untouched)',
          len(d) == len(allowed) and len(allowed) == 5, True)
    check('apply', 'board signature unchanged', q(db, 'postgres', "select pg_get_function_result('public.jobs_posted_within_radius()'::regprocedure) || '|' || pg_get_function_identity_arguments('public.jobs_posted_within_radius()'::regprocedure)"), pre_sig)
    for w, v in pre_board.items():
        check('apply', f'board {w}: every non-location column/row/order identical to before 0030',
              q(db, w, f"select {BOARD_COLS} from public.jobs_posted_within_radius()"), v)
    matrix(db, 'matrix')

    rc, err = apply_file(db, F30)
    check('reapply', '0030 re-applied: no error', rc, 0)
    check('reapply', 'state after re-apply == after first apply', diff(post1, state(db)), [])
    matrix(db, 'matrix-reapply')

    rc, err = apply_file(db, R30)
    check('rollback', 'rollback applies cleanly', rc, 0)
    check('rollback', 'state after rollback == state before 0030 (byte-for-byte defs, ACLs, policies, rows)', diff(pre, state(db)), [])
    check('rollback', 'after rollback: pro_claim_job prosrc md5 == before 0030 (0023)',
          q(db, 'postgres', "select md5(prosrc) || '|' || array_to_string(proconfig, ',') from pg_proc where oid = 'public.pro_claim_job(uuid)'::regprocedure"),
          pre_claim_md5 + '|search_path=public')
    check('rollback', 'after rollback: claim responses == before 0030 (busy Pro outside radius is P0001 again)',
          claim_baseline(db) == claim_base, True)
    check('rollback', 'after rollback: RPC absent', q(db, 'postgres', "select coalesce(to_regprocedure('public.get_assigned_job_destination(uuid)')::text, 'absent')"), 'absent')
    check('rollback', 'after rollback: board back to 0023 behaviour (exact lat)',
          q(db, 'P2', "select lat || ',' || lng from public.jobs_posted_within_radius()"), f'{POST[0]},{POST[1]}')
    rc, err = apply_file(db, R30)
    check('rollback', 'rollback run twice: no error, state still == before', (rc, diff(pre, state(db))), (0, []))
    rc, err = apply_file(db, F30)
    check('rollback', '0030 re-applied after rollback: no error, state == first apply', (rc, diff(post1, state(db))), (0, []))
    matrix(db, 'matrix-after-rollback-reapply')

    # ── control: the same attacks against the pre-B1 board (37d6e541: exact point in filter and
    #    distance, rounded output) recover the exact point, so the attacks above are real attacks.
    db3 = PREFIX + '_ctl'
    build(db3)
    ctl = open(F30).read().replace('g.cell_lat, g.cell_lng', 'j.lat, j.lng')
    check('control', 'control board = 0030 with the exact point in distance + filter (no cell point left)',
          'g.cell_lat, g.cell_lng' not in ctl and 'g.cell_lat, g.cell_lng' in open(F30).read(), True)
    r = psql(db3, ctl)
    check('control', 'control board applies', r.returncode, 0)
    triangulation(db3, 'control', coarse=False)

    # ── without 0027: refused, nothing changed; and the leak 0027 closes
    db2 = PREFIX + '_no27'
    build(db2, with_0027=False)
    s0 = state(db2)
    check('no0027', 'without 0027: P2 direct select of J1 returns the exact point (proves 0027 is the table gate)',
          q(db2, 'P2', f"select lat || ',' || lng from public.jobs where id = '{J1}'"), f'{NEAR[0]},{NEAR[1]}')
    rc, err = apply_file(db2, F30)
    check('no0027', '0030 refused without 0027', rc != 0 and 'Apply 0027 first' in err, True)
    check('no0027', 'refused run changed nothing', diff(s0, state(db2)), [])

    if not os.environ.get('HAVEN_KEEP_DBS'):
        for x in (db, db2, db3):
            psql('postgres', f'drop database if exists {x};')
    npass = sum(1 for r in RESULTS if r[2])
    nfail = len(RESULTS) - npass
    print(f'\nTOTAL {len(RESULTS)} PASS {npass} FAIL {nfail}')
    sys.exit(1 if nfail else 0)


if __name__ == '__main__':
    main()
