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
    check(g, 'board P2: distance_mi = round(exact * 2) / 2 (contract formula)',
          q(db, 'P2', f"select distance_mi = round(public.haven_distance_miles({NEAR[0]}, {NEAR[1]}, {POST[0]}, {POST[1]}) * 2) / 2 "
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
    check(g, 'RPC: SECURITY DEFINER, STABLE, search_path=public, jsonb, anon no, authenticated yes, PUBLIC no, owner=jobs owner',
          props, 'true|s|search_path=public|jsonb|false|true|0|true')
    check(g, 'RPC body has no INSERT/UPDATE/DELETE/PERFORM',
          q(db, 'postgres', "select prosrc !~* '\\m(insert|update|delete|perform|execute)\\M' from pg_proc "
                            "where oid = 'public.get_assigned_job_destination(uuid)'::regprocedure"), 't')
    bprops = q(db, 'postgres', "select p.prosecdef || '|' || p.provolatile::text || '|' || array_to_string(p.proconfig, ',') || '|' "
                               "|| has_function_privilege('anon', p.oid, 'EXECUTE') || '|' || has_function_privilege('authenticated', p.oid, 'EXECUTE') "
                               "|| '|' || (select count(*) from aclexplode(p.proacl) a where a.grantee = 0) "
                               "from pg_proc p where p.oid = 'public.jobs_posted_within_radius()'::regprocedure")
    check(g, 'board: SECURITY DEFINER, STABLE, search_path=public, anon no, authenticated yes, PUBLIC no',
          bprops, 'true|s|search_path=public|false|true|0')


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

    rc, err = apply_file(db, F30)
    check('apply', '0030 applies cleanly on master + 0027', rc, 0)
    if rc:
        print(err)
    post1 = state(db)
    d = diff(pre, post1)
    allowed = [x for x in d if re.match(r'^[+-]fn\|(jobs_posted_within_radius\(\)|get_assigned_job_destination\(uuid\))\|', x)]
    check('apply', '0030 changes only the board function + new RPC (policies, triggers, grants, tables, rows untouched)',
          len(d) == len(allowed) and len(allowed) == 3, True)
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
    check('rollback', 'after rollback: RPC absent', q(db, 'postgres', "select coalesce(to_regprocedure('public.get_assigned_job_destination(uuid)')::text, 'absent')"), 'absent')
    check('rollback', 'after rollback: board back to 0023 behaviour (exact lat)',
          q(db, 'P2', "select lat || ',' || lng from public.jobs_posted_within_radius()"), f'{POST[0]},{POST[1]}')
    rc, err = apply_file(db, R30)
    check('rollback', 'rollback run twice: no error, state still == before', (rc, diff(pre, state(db))), (0, []))
    rc, err = apply_file(db, F30)
    check('rollback', '0030 re-applied after rollback: no error, state == first apply', (rc, diff(post1, state(db))), (0, []))
    matrix(db, 'matrix-after-rollback-reapply')

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
        for x in (db, db2):
            psql('postgres', f'drop database if exists {x};')
    npass = sum(1 for r in RESULTS if r[2])
    nfail = len(RESULTS) - npass
    print(f'\nTOTAL {len(RESULTS)} PASS {npass} FAIL {nfail}')
    sys.exit(1 if nfail else 0)


if __name__ == '__main__':
    main()
