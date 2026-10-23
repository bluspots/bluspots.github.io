#!/usr/bin/env python3
"""0027 policy matrix — LOCAL throwaway Postgres only. Never Supabase.

Builds two databases from this repo's migrations, applied in order, on a
local cluster: BEFORE (0001 ... 0026) and AFTER (the same + 0027). Supabase
is emulated: roles anon / authenticated / service_role (BYPASSRLS), an
auth schema with auth.users and auth.uid() read from request.jwt.claims,
and Supabase's default privileges (ALL on new public tables / sequences to
anon, authenticated, service_role). Each check runs in its own transaction
and is rolled back, so every check sees the same fixture.

Usage:
  python3 supabase/tests/rls_0027_policy_matrix.py
Env:
  HAVEN_PG          psql connection args (default: -h /tmp -p 54331 -U postgres)
  HAVEN_PRO_0021    path to haven-pro docs/0021_pro_profile_source_of_truth.sql
                    (optional; without it only the profiles.pro_workspace
                    column 0023 needs is added)
  HAVEN_0025, HAVEN_0026  paths to 0025 / 0026 when they are not in this
                    repo's migrations folder yet (optional)
Exit code 0 only if every expectation holds.
"""
import json, os, re, shlex, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MIG = os.path.normpath(os.path.join(HERE, '..', 'migrations'))
PSQL = ['psql'] + shlex.split(os.environ.get('HAVEN_PG', '-h /tmp -p 54331 -U postgres')) + ['-X', '-q', '-tA']
F27 = '0027_jobs_read_rls_and_unused_tables.sql'
UNUSED = ['job_status_events', 'materials_requests', 'materials_receipts', 'tips',
          'job_messages', 'job_media', 'job_notes', 'earnings_statements']

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

# ── ids ──────────────────────────────────────────────────────────────────
CUST_A = 'a0000000-0000-4000-8000-00000000000a'
CUST_B = 'b0000000-0000-4000-8000-00000000000b'
PRO_IN = 'c0000000-0000-4000-8000-0000000000c1'     # in radius, assigned to the *_proin jobs
PRO_OUT = 'c0000000-0000-4000-8000-0000000000c2'    # far away, nothing assigned
PRO_OTHER = 'c0000000-0000-4000-8000-0000000000c3'  # in radius, assigned to A_enroute_other
PRO_M = 'c0000000-0000-4000-8000-0000000000c4'      # in radius, assigned to A_matreq_m
PRO_B = 'c0000000-0000-4000-8000-0000000000c5'      # in radius, assigned to B_inprog_b
# (one_active_job_per_pro: each Pro holds at most one active job)
NEAR = (28.538336, -81.379234)   # Orlando
FAR = (40.712776, -74.005974)    # New York
JOBS = [  # name, customer, pro, status, point
    ('A_posted',          CUST_A, None,      'posted',              NEAR),
    ('A_posted_far',      CUST_A, None,      'posted',              FAR),
    ('A_enroute_other',   CUST_A, PRO_OTHER, 'en_route',            NEAR),
    ('A_matreq_m',        CUST_A, PRO_M,     'materials_requested', NEAR),
    ('A_complete_proin',  CUST_A, PRO_IN,    'complete',            NEAR),
    ('A_cancelled_nopro', CUST_A, None,      'cancelled',           NEAR),
    ('B_posted',          CUST_B, None,      'posted',              NEAR),
    ('B_inprog_b',        CUST_B, PRO_B,     'in_progress',         NEAR),
    ('B_complete_proin',  CUST_B, PRO_IN,    'complete',            NEAR),
    ('B_cancelled_nopro', CUST_B, None,      'cancelled',           NEAR),
]
JID = {name: '%08x-0000-4000-8000-%012x' % (0xd0000000 + i, i) for i, (name, *_r) in enumerate(JOBS)}
ACTORS = ['anon', 'cust_A', 'cust_B', 'pro_in', 'pro_out', 'pro_other', 'pro_m', 'pro_b', 'service_role']
SUB = {'cust_A': CUST_A, 'cust_B': CUST_B, 'pro_in': PRO_IN, 'pro_out': PRO_OUT, 'pro_other': PRO_OTHER,
       'pro_m': PRO_M, 'pro_b': PRO_B}


def psql(db, sql, stop=True):
    args = PSQL + ['-d', db] + (['-v', 'ON_ERROR_STOP=1'] if stop else [])
    return subprocess.run(args, input=sql, capture_output=True, text=True)


def must(db, sql):
    r = psql(db, sql)
    if r.returncode:
        raise SystemExit(f'psql failed on {db}:\n{r.stderr}')
    return r.stdout


def migration_files():
    files = sorted(f for f in os.listdir(MIG) if re.match(r'^\d{4}.*\.sql$', f) and f != F27)
    out = []
    for f in files:
        out.append(os.path.join(MIG, f))
        if f.startswith('0020'):
            p21 = os.environ.get('HAVEN_PRO_0021')
            out.append(p21 if p21 and os.path.exists(p21) else None)  # None = minimal 0021 shim
    have = {os.path.basename(p)[:4] for p in out if p}
    for num in ('0025', '0026'):
        p = os.environ.get('HAVEN_' + num)
        if num not in have and p and os.path.exists(p):
            out.append(p)
    return out


def build(db, files, with_0027):
    psql('postgres', f'drop database if exists {db};')
    must('postgres', f'create database {db};')
    must(db, SHIM)
    for p in files:
        if p is None:
            must(db, 'alter table public.profiles add column if not exists pro_workspace jsonb;')
        else:
            must(db, open(p).read())
    if with_0027:
        must(db, open(os.path.join(MIG, F27)).read())
    must(db, fixture_sql())


def fixture_sql():
    users = [(CUST_A, 'customer', 'Ann Customer'), (CUST_B, 'customer', 'Bob Customer'),
             (PRO_IN, 'pro', 'Ina Pro'), (PRO_OUT, 'pro', 'Otto Pro'), (PRO_OTHER, 'pro', 'Oli Pro'),
             (PRO_M, 'pro', 'Mo Pro'), (PRO_B, 'pro', 'Bea Pro')]
    s = ''.join(f"insert into auth.users(id, email, raw_user_meta_data) values ('{u}', '{n.split()[0].lower()}@example.com', "
                f"'{json.dumps({'role': r, 'display_name': n})}');\n" for u, r, n in users)
    s += f"insert into public.profiles(id, role, display_name) select id, raw_user_meta_data->>'role', raw_user_meta_data->>'display_name' from auth.users on conflict (id) do nothing;\n"
    s += "update public.profiles set display_name = u.raw_user_meta_data->>'display_name' from auth.users u where u.id = profiles.id;\n"
    for pro, pt in ((PRO_IN, NEAR), (PRO_OTHER, NEAR), (PRO_M, NEAR), (PRO_B, NEAR), (PRO_OUT, FAR)):
        s += (f"update public.profiles set operating_lat = {pt[0]}, operating_lng = {pt[1]}, "
              f"pro_workspace = '{{\"travelRadius\":\"{25 if pro != PRO_OUT else 5}\"}}' where id = '{pro}';\n")
    for name, cust, pro, status, pt in JOBS:
        s += ("insert into public.jobs(id, customer_id, pro_id, status, category, title, city_label, lat, lng, "
              "fixed_customer_labor_price_cents, fixed_pro_labor_payout_cents, materials_estimate_cents) values "
              f"('{JID[name]}', '{cust}', {'null' if pro is None else repr(pro)}, '{status}', 'Plumbing', '{name}', "
              f"'Orlando, FL', {pt[0]}, {pt[1]}, 8900, 7120, {1800 if status == 'materials_requested' else 0});\n")
    return s


def as_actor(who):
    if who == 'postgres':
        return ''
    if who == 'service_role':
        return "set local role service_role;\nselect set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true) \\g /dev/null\n"
    if who == 'anon':
        return "set local role anon;\nselect set_config('request.jwt.claims', '{\"role\":\"anon\"}', true) \\g /dev/null\n"
    claims = json.dumps({'sub': SUB[who], 'role': 'authenticated'})
    return f"set local role authenticated;\nselect set_config('request.jwt.claims', '{claims}', true) \\g /dev/null\n"


def q(db, who, sql):
    """Run statements as `who` in a rolled-back transaction. ('OK', last output) or ('ERR', message)."""
    r = psql(db, f"begin;\n{as_actor(who)}{sql};\nrollback;\n")
    if r.returncode:
        m = re.search(r'ERROR:\s+(.*)', r.stderr)
        return ('ERR', m.group(1).strip() if m else r.stderr.strip())
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    return ('OK', lines)


def cell(res):
    if res[0] == 'ERR':
        return 'denied' if 'permission denied' in res[1] else 'ERR:' + res[1][:40]
    return ','.join(res[1]) if res[1] else '-'


def read_matrix(db):
    out = {}
    for name, *_r in JOBS:
        for who in ACTORS:
            out[(name, who)] = cell(q(db, who, f"select count(*) from public.jobs where id = '{JID[name]}'"))
    return out


def expected_after(name, who):
    _, cust, pro, status, _pt = next(j for j in JOBS if j[0] == name)
    if who == 'anon':
        return 'denied'
    if who == 'service_role':
        return '1'
    uid = SUB[who]
    return '1' if uid in (cust, pro) else '0'


def ret(sql):
    return sql


def scenarios():
    J = JID
    return [
      # (label, who, sql, expected_after)
      ('board RPC: pro_in sees posted jobs in radius', 'pro_in',
       'select string_agg(title, \',\' order by title) from public.jobs_posted_within_radius()', 'A_posted,B_posted'),
      ('board RPC: pro_out (New York, 5 mi) sees only the New York job', 'pro_out',
       'select string_agg(title, \',\' order by title) from public.jobs_posted_within_radius()', 'A_posted_far'),
      ('board RPC: customer has no operating point', 'cust_A',
       'select count(*) from public.jobs_posted_within_radius()', '0'),
      ('board RPC: anon', 'anon', 'select count(*) from public.jobs_posted_within_radius()', 'denied'),
      ('direct SELECT of posted jobs by a Pro (board does not use it)', 'pro_in',
       "select count(*) from public.jobs where status = 'posted'", '0'),
      ('claim RPC in radius, then the Pro reads the claimed job', 'pro_in',
       f"select status || ':' || (pro_id = '{PRO_IN}') from public.pro_claim_job('{J['B_posted']}');\n"
       f"select status from public.jobs where id = '{J['B_posted']}'", 'en_route:true,en_route'),
      ('claim RPC, then the customer reads it (B)', 'pro_in',
       f"select 1 from public.pro_claim_job('{J['B_posted']}') \\g /dev/null\n"
       f"select set_config('request.jwt.claims', '{json.dumps({'sub': CUST_B, 'role': 'authenticated'})}', true) \\g /dev/null\n"
       f"select status from public.jobs where id = '{J['B_posted']}'", 'en_route'),
      ('claim RPC, then another customer (A) reads it', 'pro_in',
       f"select 1 from public.pro_claim_job('{J['B_posted']}') \\g /dev/null\n"
       f"select set_config('request.jwt.claims', '{json.dumps({'sub': CUST_A, 'role': 'authenticated'})}', true) \\g /dev/null\n"
       f"select count(*) from public.jobs where id = '{J['B_posted']}'", '0'),
      ('claim RPC, then a different Pro reads it', 'pro_in',
       f"select 1 from public.pro_claim_job('{J['B_posted']}') \\g /dev/null\n"
       f"select set_config('request.jwt.claims', '{json.dumps({'sub': PRO_OTHER, 'role': 'authenticated'})}', true) \\g /dev/null\n"
       f"select count(*) from public.jobs where id = '{J['B_posted']}'", '0'),
      ('claim race: a second Pro claims the same job after the first', 'pro_in',
       f"select 1 from public.pro_claim_job('{J['B_posted']}') \\g /dev/null\n"
       f"reset role;\nupdate public.jobs set status = 'complete' where id = '{J['B_inprog_b']}';\n"
       f"set local role authenticated;\n"
       f"select set_config('request.jwt.claims', '{json.dumps({'sub': PRO_B, 'role': 'authenticated'})}', true) \\g /dev/null\n"
       f"select count(*) from public.pro_claim_job('{J['B_posted']}')", 'ERR:job not claimable'),
      ('claim RPC out of radius', 'pro_out', f"select count(*) from public.pro_claim_job('{J['A_posted']}')",
       'ERR:job outside operating radius'),
      ('claim RPC on a job already assigned to another Pro', 'pro_in',
       f"select count(*) from public.pro_claim_job('{J['B_inprog_b']}')", 'ERR:job not claimable'),
      ('fallback direct claim PATCH (Pro app, RPC failed)', 'pro_in',
       f"update public.jobs set status = 'en_route', pro_id = '{PRO_IN}', accepted_at = now() "
       f"where id = '{J['B_posted']}' and status = 'posted' and pro_id is null returning id", '-'),
      ('Pro active jobs read (Pro app)', 'pro_other',
       f"select count(*) from public.jobs where pro_id = '{PRO_OTHER}' and status in "
       "('en_route','arrived','diagnosing','materials_requested','materials_approved','in_progress')", '1'),
      ('Pro history incl. complete', 'pro_in', 'select count(*) from public.jobs', '2'),
      ('Pro status PATCH en_route->arrived, return=representation', 'pro_other',
       f"update public.jobs set status = 'arrived' where id = '{J['A_enroute_other']}' and pro_id = '{PRO_OTHER}' "
       "and status = 'en_route' returning status", 'arrived'),
      ('Pro status PATCH in_progress->complete, return=representation', 'pro_b',
       f"update public.jobs set status = 'complete', completed_at = now() where id = '{J['B_inprog_b']}' "
       f"and pro_id = '{PRO_B}' returning status", 'complete'),
      ('Pro PATCH on another Pro\'s job (blocked both ways)', 'pro_in',
       f"update public.jobs set status = 'complete' where id = '{J['B_inprog_b']}' returning status", '-'),
      ('customer posts a job, INSERT ... RETURNING', 'cust_A',
       "insert into public.jobs(customer_id, status, category, title, city_label, lat, lng, "
       "fixed_customer_labor_price_cents, fixed_pro_labor_payout_cents) values "
       f"('{CUST_A}', 'posted', 'Plumbing', 'new', 'Orlando, FL', {NEAR[0]}, {NEAR[1]}, 8900, 7120) returning status", 'posted'),
      ('customer cancels own posted job, UPDATE ... RETURNING', 'cust_A',
       f"update public.jobs set status = 'cancelled', cancelled_at = now() where id = '{J['A_posted']}' returning status",
       'cancelled'),
      ('customer B cancels A\'s posted job', 'cust_B',
       f"update public.jobs set status = 'cancelled' where id = '{J['A_posted']}' returning status", '-'),
      ('customer approves materials, return=representation', 'cust_A',
       f"update public.jobs set status = 'materials_approved' where id = '{J['A_matreq_m']}' returning status",
       'materials_approved'),
      ('customer my-jobs read (customer_id = me)', 'cust_A',
       f"select count(*) from public.jobs where customer_id = '{CUST_A}'", '6'),
      ('customer reads every job it can see (no filter)', 'cust_A', 'select count(*) from public.jobs', '6'),
      ('customer reads B\'s jobs with customer_id = B', 'cust_A',
       f"select count(*) from public.jobs where customer_id = '{CUST_B}'", '0'),
      ('0022 receipt Pro name: own job only', 'cust_A',
       f"select string_agg(job_id::text || '=' || coalesce(display_name, '?'), ',') from public.job_assigned_pro_labels("
       f"array['{J['A_enroute_other']}', '{J['B_inprog_b']}']::uuid[])", f"{J['A_enroute_other']}=Oli Pro"),
      ('0022 RPC: anon', 'anon', f"select count(*) from public.job_assigned_pro_labels(array['{J['A_enroute_other']}']::uuid[])",
       'denied'),
      ('haven_caller_within_radius callable directly?', 'pro_in',
       f"select public.haven_caller_within_radius({NEAR[0]}, {NEAR[1]})", None),
      ('anon SELECT jobs', 'anon', 'select count(*) from public.jobs', 'denied'),
      ('service_role SELECT jobs', 'service_role', 'select count(*) from public.jobs', str(len(JOBS))),
      ('own profile read (profiles RLS, unchanged)', 'pro_in', 'select count(*) from public.profiles', '1'),
    ] + [
      (f'{t}: authenticated SELECT', 'cust_A', f'select count(*) from public.{t}', 'denied') for t in UNUSED
    ] + [
      (f'{t}: anon SELECT', 'anon', f'select count(*) from public.{t}', 'denied') for t in UNUSED
    ] + [
      ('job_status_events: authenticated INSERT', 'pro_b',
       f"insert into public.job_status_events(job_id, to_status, actor_role, actor_id) values "
       f"('{J['B_inprog_b']}', 'complete', 'pro', '{PRO_B}')", 'denied'),
      ('job_messages: authenticated INSERT', 'cust_A',
       f"insert into public.job_messages(job_id, sender_role, body) values ('{J['A_enroute_other']}', 'customer', 'hi')", 'denied'),
      ('tips: authenticated INSERT', 'cust_A',
       f"insert into public.tips(job_id, amount_cents, status) values ('{J['A_complete_proin']}', 500, 'paid')", 'denied'),
    ] + [
      (f'{t}: service_role SELECT', 'service_role', f'select count(*) from public.{t}', '0') for t in UNUSED
    ] + [
      (f'{t}: postgres (SQL editor) SELECT', 'postgres', f'select count(*) from public.{t}', '0') for t in UNUSED
    ]


def catalog(db):
    return must(db, """
select 'POL|' || tablename || '|' || policyname || '|' || cmd || '|' || permissive || '|' || array_to_string(roles, ',')
       || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  from pg_policies where schemaname = 'public' order by tablename, policyname;
select 'RLS|' || c.relname || '|' || c.relrowsecurity || '|' || c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' order by c.relname;
select 'ACL|' || c.relname || '|' || coalesce((select string_agg(x::text, ',' order by x::text) from unnest(c.relacl) x), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'S') order by c.relname;
select 'FN|' || p.oid::regprocedure || '|' || p.prosecdef || '|' || md5(p.prosrc) || '|' || coalesce((select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1;
select 'TRG|' || tgrelid::regclass || '|' || tgname || '|' || tgenabled::text
  from pg_trigger where not tgisinternal order by 1;
""")


def rollback_sql():
    text = open(os.path.join(MIG, F27)).read()
    section = text.split('-- ── Rollback', 1)[1]
    lines = [l[3:] if l.startswith('-- ') else l[2:] for l in section.splitlines() if l.startswith('--')]
    start = lines.index('begin;')
    end = lines.index('commit;')
    return '\n'.join(lines[start:end + 1]) + '\n'


def main():
    files = migration_files()
    print('migrations:', ', '.join(os.path.basename(p) if p else '0021 (shim: profiles.pro_workspace)' for p in files), '+', F27)
    build('rls27_before', files, False)
    build('rls27_after', files, True)
    failures = []

    def check(cond, msg):
        print(('  ok   ' if cond else '  FAIL ') + msg)
        if not cond:
            failures.append(msg)

    # 1. Direct SELECT matrix, before -> after.
    before, after = read_matrix('rls27_before'), read_matrix('rls27_after')
    print('\n== Direct SELECT on public.jobs: rows visible (before 0007 -> after 0027)')
    w = 20
    print('job'.ljust(w) + ''.join(a.ljust(15) for a in ACTORS))
    for name, *_r in JOBS:
        row = name.ljust(w)
        for who in ACTORS:
            b, a = before[(name, who)], after[(name, who)]
            row += (a if a == b else f'{b}->{a}').ljust(15)
        print(row)
    print()
    for name, *_r in JOBS:
        for who in ACTORS:
            check(after[(name, who)] == expected_after(name, who),
                  f'after: {who} reading {name} = {after[(name, who)]} (want {expected_after(name, who)})')

    # 2. Scenario matrix, before -> after.
    print('\n== Scenarios (before 0007 -> after 0027)')
    for label, who, sql, want in scenarios():
        b = cell(q('rls27_before', who, sql))
        a = cell(q('rls27_after', who, sql))
        print(f'  [{who:12}] {label}: {b if a == b else b + "  ->  " + a}')
        if want is not None:
            check(a == want or (want.startswith('ERR:') and a.startswith(want)), f'after: {label} = {a} (want {want})')

    # 3. Catalog: only SELECT policies on jobs and RLS on the unused tables change.
    print('\n== Catalog diff (before -> after)')
    cb, ca = set(catalog('rls27_before').splitlines()), set(catalog('rls27_after').splitlines())
    for l in sorted(cb - ca):
        print('  - ' + l)
    for l in sorted(ca - cb):
        print('  + ' + l)
    changed = {l.split('|')[0] + '|' + l.split('|')[1] for l in (cb ^ ca)}
    allowed = {'POL|jobs', 'RLS|' + '', 'FN|'} | {f'RLS|{t}' for t in UNUSED} | {f'ACL|{t}' for t in UNUSED} \
        | {f'ACL|{t}_id_seq' for t in UNUSED}
    check(changed <= allowed, f'only jobs policies and the unused tables / sequences changed: {sorted(changed - allowed)}')
    pol_diff = {l for l in (cb ^ ca) if l.startswith('POL|')}
    check(all('|SELECT|' in l for l in pol_diff), 'only SELECT policies changed')
    check(not any(l.startswith('FN|') or l.startswith('TRG|') for l in (cb ^ ca)), 'no function or trigger changed')

    # 4. Idempotent: pasting 0027 again changes nothing.
    must('rls27_after', open(os.path.join(MIG, F27)).read())
    check(set(catalog('rls27_after').splitlines()) == ca, 're-running 0027 is a no-op')

    # 5. Rollback restores the BEFORE catalog exactly.
    must('rls27_after', rollback_sql())
    cr = set(catalog('rls27_after').splitlines())
    check(cr == cb, 'rollback restores 0007, RLS off and the grants exactly' +
          ('' if cr == cb else f': {sorted(cr ^ cb)}'))
    check(read_matrix('rls27_after') == before, 'rollback restores the BEFORE read matrix')

    # 6. Fail fast: without 0023, 0027 raises and changes nothing.
    early = [p for p in files if p is None or os.path.basename(p) < '0023']
    psql('postgres', 'drop database if exists rls27_early;')
    must('postgres', 'create database rls27_early;')
    must('rls27_early', SHIM)
    for p in early:
        must('rls27_early', 'alter table public.profiles add column if not exists pro_workspace jsonb;' if p is None else open(p).read())
    pre = catalog('rls27_early')
    r = psql('rls27_early', open(os.path.join(MIG, F27)).read())
    check(r.returncode != 0 and 'prerequisites missing' in r.stderr, 'without 0023, 0027 stops with "prerequisites missing"' +
          ('' if 'prerequisites missing' in r.stderr else ': ' + r.stderr.strip()))
    check(catalog('rls27_early') == pre, 'a stopped 0027 changes nothing')

    for db in ('rls27_before', 'rls27_after', 'rls27_early'):
        psql('postgres', f'drop database if exists {db};')
    print(f'\n{len(failures)} failing')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
