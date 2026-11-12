#!/usr/bin/env python3
"""MIG-0039 local matrix: the Customer cannot move their own job into a work / dispatch status (F5).

LOCAL ONLY: throwaway Postgres 17 (default -h /tmp -p 54329), databases HAVEN_DB_PREFIX_*, dropped at the
end. Never point it at Supabase. Builds on the 0036 harness in this directory (live set: master 0001-0025,
0027, 0030, 0032, 0036; HAVEN_DEPS holds 0026-0032 + Hub FCC files). Every move is tried through RLS as the
real actor, first WITHOUT 0039 (baseline, shows the gap) and then WITH it. Stacks: live set; live set +
0026/0028/0029 drafts (0039 after them); and 0039 first, then 0026/0028/0029.
Env: HAVEN_0039 (file under test), HAVEN_QUICK=1 (mutant mode: live set only, no guards group).
"""
import os, re, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault('HAVEN_DB_PREFIX', 'codey0039_%d' % os.getpid())
import mig_0036_realtime_signal_matrix as b   # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, '..'))
F39 = os.environ.get('HAVEN_0039') or os.path.join(ROOT, 'migrations', '0039_customer_status_guard.sql')
R39 = os.path.join(ROOT, 'rollback', '0039_customer_status_guard_rollback.sql')
CHK_A = os.path.join(ROOT, 'checks', '0039a_check_before_READ_ONLY.sql')
CHK_B = os.path.join(ROOT, 'checks', '0039b_check_after_READ_ONLY.sql')
PREFIX = os.environ['HAVEN_DB_PREFIX']
QUICK = os.environ.get('HAVEN_QUICK') == '1'
O = b.OWNER_ROLE
C1, P1, P2, J1 = b.C1, b.P1, b.P2, b.J1
check, must, psql = b.check, b.must, b.psql
ALL_ST = ['posted', 'en_route', 'arrived', 'diagnosing', 'materials_requested', 'materials_approved', 'materials_declined',
          'in_progress', 'inspection_completed', 'complete', 'cancelled']
SOURCES = [('posted', None), ('en_route', P1), ('arrived', P1), ('diagnosing', P1), ('materials_requested', P1),
           ('materials_approved', P1), ('in_progress', P1), ('inspection_completed', P1), ('materials_declined', P1), ('complete', P1)]
PRO_MOVES = [('en_route', 'arrived'), ('arrived', 'in_progress'), ('arrived', 'diagnosing'), ('in_progress', 'complete'),
             ('diagnosing', 'materials_requested'), ('materials_approved', 'in_progress'),
             ('en_route', 'complete'), ('arrived', 'complete'), ('diagnosing', 'complete'), ('materials_requested', 'complete'),
             ('materials_approved', 'complete')]
# production jobs grants (CoS read-only probe 2026-11-12 4:31 PM ET): service_role has only REFERENCES/TRIGGER/TRUNCATE
PROD_JOBS_GRANTS = ("revoke delete on table public.jobs from anon, authenticated;\n"
                    "revoke select, insert, update, delete on table public.jobs from service_role;\n")


def cust_allowed(st, pro, t):
    """0039 v2 = 0029 IV.3 / I / III.4 sources: the only status moves the job's Customer may make."""
    return ((t == 'cancelled' and st == 'posted' and pro is None)
            or (t in ('materials_approved', 'materials_declined') and st == 'materials_requested')
            or (t == 'inspection_completed' and st in ('diagnosing', 'materials_requested')))


def pro_allowed(st, t):
    """0039 v2 LOW-1 = 0029 IV.1: complete only from in_progress."""
    return not (t == 'complete' and st != 'in_progress')


def build(db):
    b.build(db)
    # production: the SQL-editor role (postgres) owns pro_claim_job; the local owner stand-in must too
    must(db, f'alter function public.pro_claim_job(uuid) owner to {O};\n'
             f'grant execute on function public.haven_caller_within_radius(numeric, numeric) to {O};')


def apply(db, text=None, role=O, expect_ok=True):
    r = psql(db, (f'set role {role};\n' if role else '') + (text if text is not None else open(F39).read()))
    if expect_ok and r.returncode:
        raise SystemExit(f'0039 failed on {db}:\n{b.redact(r.stderr)[-1500:]}')
    return r


def drafts(db):
    if has29(db):   # the production-equivalent wrapper (HAVEN_FIN=1) already pasted 0025-0029
        return
    if must(db, "select exists (select 1 from pg_attribute where attrelid = 'public.jobs'::regclass and attname = 'materials_approved_cents' and not attisdropped);").strip() != 't':
        must(db, open(os.environ.get('HAVEN_0025', b.dep('0025'))).read())   # production has no 0025: paste it first
    for n in ('0026', '0028', '0029'):
        must(db, open(b.dep(n)).read())


def has29(db):
    return must(db, "select exists (select 1 from pg_proc where oid = to_regprocedure('public.jobs_lock_pricing_and_inspection()'));").strip() == 't'


def setjob(db, status, pro):
    p = 'null' if pro is None else f"'{pro}'"
    cols = must(db, "select string_agg(attname, ',') from pg_attribute where attrelid = 'public.jobs'::regclass and not attisdropped;").strip().split(',')
    seq = ''
    if 'materials_request_seq' in cols:
        seq = ', materials_request_seq = ' + ('1' if status == 'materials_requested' else '0') + ', materials_decided_seq = 0'
    must(db, "begin;\nset local session_replication_role = replica;\n"
             f"update public.jobs set status = '{status}', pro_id = {p}, customer_id = '{C1}', accepted_at = "
             f"{'null' if pro is None else 'now()'}, cancelled_at = null, requires_diagnosis = {'true' if status in ('diagnosing', 'materials_requested', 'materials_approved', 'inspection_completed') else 'false'}"
             f"{seq} where id = '{J1}';\ncommit;\n")


def attempt(db, who, target):
    r = psql(db, 'begin;\n' + b.as_actor(who) + f"update public.jobs set status = '{target}' where id = '{J1}';\ncommit;\n", stop=False)
    now = must(db, f"select status from public.jobs where id = '{J1}';").strip()
    return now == target, r


def self_claim(db):
    """HIGH-1 path: the Customer points their own profile at their own posted job and claims it."""
    setjob(db, 'posted', None)
    must(db, 'begin;\n' + b.as_actor('C1') + f"update public.profiles set operating_lat = {b.NEARPT[0]}, operating_lng = {b.NEARPT[1]}, "
             f"pro_workspace = '{{\"travelRadius\":\"25\"}}' where id = '{C1}';\ncommit;\n")
    r = psql(db, 'begin;\n' + b.as_actor('C1') + f"select count(*) from public.pro_claim_job('{J1}');\ncommit;\n", stop=False)
    now = must(db, f"select status || ',' || coalesce(pro_id::text, '-') from public.jobs where id = '{J1}';").strip()
    must(db, b.OWNER + f"update public.profiles set operating_lat = null, operating_lng = null, pro_workspace = null where id = '{C1}';")
    return now == f'en_route,{C1}', r


def outcomes(db):
    res = {}
    for st, pro in SOURCES:
        for t in ALL_ST:
            if t == st:
                continue
            setjob(db, st, pro)
            res[('C1', st, t)] = attempt(db, 'C1', t)[0]
    for st, t in PRO_MOVES:
        setjob(db, st, P1)
        res[('P1', st, t)] = attempt(db, 'P1', t)[0]
    res[('SC', 'posted', 'self-claim')] = self_claim(db)[0]
    return res


def g_moves(db, label, apply_first=None, base=None):
    print(f'\n## {label}')
    own_base = base is None
    base = base or outcomes(db)
    gap = sorted(f'{s}->{t}' for (w, s, t), ok in base.items() if w == 'C1' and ok and not cust_allowed(s, dict(SOURCES)[s], t))
    print(f'   baseline (no 0039): Customer moves outside the 0029 Customer set that succeed today: {len(gap)} {gap}')
    print(f'   baseline (no 0039): Customer self-claim of their own posted job lands: {base[("SC", "posted", "self-claim")]}')
    if own_base and not has29(db):
        check(f'[{label}] baseline reproduces HIGH-1: without 0039 (and without 0029) a Customer can claim their own posted job',
              base[('SC', 'posted', 'self-claim')] is True)
    (apply_first or apply)(db)
    after = outcomes(db)
    for k, ok in sorted(after.items()):
        w, s, t = k
        if w == 'C1':
            exp = base[k] and cust_allowed(s, dict(SOURCES)[s], t)
            check(f'[{label}] Customer {s} -> {t}: {"allowed (as without 0039)" if exp else "refused"}', ok == exp, (base[k], ok))
        elif w == 'P1':
            exp = base[k] and pro_allowed(s, t)
            check(f'[{label}] Pro {s} -> {t}: {"same as without 0039 (" + str(base[k]) + ")" if pro_allowed(s, t) else "refused (complete only from in_progress)"}', ok == exp, (base[k], ok))
        else:
            check(f'[{label}] HIGH-1: Customer self-claim of their own posted job refused', ok is False)
    setjob(db, 'arrived', P1)
    ok, r = attempt(db, 'C1', 'complete')
    check(f'[{label}] Customer refusal is SQLSTATE 42501 "The customer cannot set this job status"', not ok and 'The customer cannot set this job status' in r.stderr, b.redact(r.stderr)[-160:])
    setjob(db, 'complete', P1)
    ok, r = attempt(db, 'C1', 'materials_approved')
    check(f'[{label}] MED-1: Customer complete -> materials_approved refused (42501)', not ok and 'The customer cannot set this job status' in r.stderr, b.redact(r.stderr)[-160:])
    setjob(db, 'arrived', P1)
    ok, r = attempt(db, 'P1', 'complete')
    check(f'[{label}] LOW-1: Pro arrived -> complete refused "A job can only be completed from in_progress"', not ok and 'completed from in_progress' in r.stderr, b.redact(r.stderr)[-160:])
    setjob(db, 'arrived', P1)
    r = psql(db, 'begin;\n' + b.as_actor('C1') + f"update public.jobs set status = 'arrived', title = title where id = '{J1}' returning 'same';\ncommit;\n", stop=False)
    check(f'[{label}] same-status write by the Customer is not a move (allowed by 0039)', 'ERROR' not in r.stderr or 'cannot set this job status' not in r.stderr)
    setjob(db, 'en_route', P1)
    must(db, b.OWNER + f"update public.jobs set status = 'arrived' where id = '{J1}';")
    check(f'[{label}] owner / SQL editor status moves are not limited', must(db, f"select status from public.jobs where id = '{J1}';").strip() == 'arrived')
    # HIGH-1 details
    setjob(db, 'posted', None)
    ok, r = self_claim(db)
    check(f'[{label}] HIGH-1: self-claim gets P0002 "job not claimable" (same as a taken job; no existence leak)', not ok and 'job not claimable' in r.stderr, b.redact(r.stderr)[-160:])
    must(db, "begin;\nset local session_replication_role = replica;\n"
             f"update public.jobs set status = 'en_route', pro_id = '{C1}', customer_id = '{b.C2}' where id = '{b.J3}';\ncommit;\n")
    ok, r = self_claim(db)
    check(f'[{label}] HIGH-1: a busy Customer self-claiming still gets P0002 first (claimable lookup before the C1 busy check)', not ok and 'job not claimable' in r.stderr and 'one_active_job_per_pro' not in r.stderr, b.redact(r.stderr)[-160:])
    must(db, "begin;\nset local session_replication_role = replica;\n"
             f"update public.jobs set status = 'posted', pro_id = null, customer_id = '{b.C2}' where id = '{b.J3}';\ncommit;\n")
    setjob(db, 'en_route', P1)
    r = psql(db, b.OWNER + f"update public.jobs set pro_id = customer_id where id = '{J1}';", stop=False)
    check(f'[{label}] IV.2: even the owner cannot reassign a job to its own Customer (42501)', 'ERROR' in r.stderr and 'account that posted it' in r.stderr, b.redact(r.stderr)[-160:])
    setjob(db, 'en_route', P1)
    r = psql(db, b.OWNER + f"update public.jobs set customer_id = '{P1}' where id = '{J1}';", stop=False)
    check(f'[{label}] IV.2: changing customer_id to the assigned Pro is refused', 'ERROR' in r.stderr and 'account that posted it' in r.stderr, b.redact(r.stderr)[-160:])
    r = psql(db, b.OWNER + "insert into public.jobs(id, customer_id, pro_id, status, category, title, city_label, lat, lng, fixed_customer_labor_price_cents, fixed_pro_labor_payout_cents) "
                          f"values ('e0390000-0000-4000-8000-0000000000aa', '{C1}', '{C1}', 'en_route', 'Plumbing', 't', 'x', 40.7, -74.0, 8900, 7120);", stop=False)
    check(f'[{label}] IV.2: an INSERT with pro_id = customer_id is refused', 'ERROR' in r.stderr and 'account that posted it' in r.stderr, b.redact(r.stderr)[-160:])
    setjob(db, 'en_route', P1)
    r = psql(db, b.OWNER + f"update public.jobs set title = title where id = '{J1}';", stop=False)
    check(f'[{label}] IV.2: unrelated column updates are not affected', 'ERROR' not in r.stderr, b.redact(r.stderr)[-160:])
    # service_role under the PRODUCTION jobs grants (no SELECT/INSERT/UPDATE/DELETE)
    setjob(db, 'en_route', P1)
    must(db, PROD_JOBS_GRANTS)
    r = psql(db, 'begin;\n' + b.as_actor('service_role') + f"update public.jobs set status = 'arrived' where id = '{J1}';\ncommit;\n", stop=False)
    check(f'[{label}] service_role under production grants: permission denied for table jobs, nothing written',
          'permission denied for table jobs' in r.stderr and must(db, f"select status from public.jobs where id = '{J1}';").strip() == 'en_route', b.redact(r.stderr)[-120:])
    setjob(db, 'posted', None)
    r = psql(db, 'begin;\n' + b.as_actor('P1') + f"select count(*) from public.pro_claim_job('{J1}');\ncommit;\n", stop=False)
    check(f'[{label}] pro_claim_job by another Pro (posted -> en_route, SECURITY DEFINER) unaffected', r.returncode == 0 and 'ERROR' not in r.stderr and must(db, f"select status from public.jobs where id = '{J1}';").strip() == 'en_route', b.redact(r.stderr)[-160:])
    # a legacy row whose customer is also its assigned Pro (only possible before 0039 / 0029): no Pro exemption any more
    setjob(db, 'en_route', P1)
    must(db, b.OWNER + f"begin; set local session_replication_role = replica; update public.jobs set customer_id = '{P1}' where id = '{J1}'; commit;")
    ok, r = attempt(db, 'P1', 'arrived')
    check(f'[{label}] legacy customer = assigned Pro: the Customer rule applies (no exemption; v1 HIGH-1)', not ok and 'cannot set this job status' in r.stderr, b.redact(r.stderr)[-160:])
    setjob(db, 'en_route', P1)
    return base


def g_catalog(db):
    print('\n## Catalog')
    out = must(db, "select t.tgtype || ' ' || t.tgenabled::text || ' ' || (t.tgqual is null)::text || ' ' || t.tgattr::text from pg_trigger t "
                   "where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_customer_status_guard';").strip()
    att = must(db, "select attnum from pg_attribute where attrelid = 'public.jobs'::regclass and attname = 'status';").strip()
    check('trigger BEFORE UPDATE OF status, row, enabled, no WHEN', out == f'19 O true {att}', out)
    out = must(db, "select p.prosecdef::text || ' ' || array_to_string(p.proconfig, ';') || ' ' || has_function_privilege('authenticated', p.oid, 'execute')::text "
                   "|| has_function_privilege('anon', p.oid, 'execute')::text || has_function_privilege('service_role', p.oid, 'execute')::text "
                   "from pg_proc p where p.oid = 'public.jobs_customer_status_guard()'::regprocedure;").strip()
    check('SECURITY INVOKER, search_path pinned, no EXECUTE for client roles', out == 'false search_path=pg_catalog, public, pg_temp falsefalsefalse', out)
    out = must(db, "select t.tgtype || ' ' || t.tgenabled::text || ' ' || (t.tgqual is null)::text || ' ' || "
                   "(select string_agg(a.attname, ',' order by a.attname) from pg_attribute a where a.attrelid = t.tgrelid and a.attnum = any (t.tgattr::int2[])) "
                   "from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_no_self_assignment';").strip()
    check('self-assignment trigger BEFORE INSERT OR UPDATE OF pro_id, customer_id, row, enabled', out == '23 O true customer_id,pro_id', out)
    out = must(db, "select p.prosecdef::text || ' ' || array_to_string(p.proconfig, ';') || ' ' || has_function_privilege('authenticated', p.oid, 'execute')::text "
                   "|| has_function_privilege('anon', p.oid, 'execute')::text || has_function_privilege('service_role', p.oid, 'execute')::text "
                   "from pg_proc p where p.oid = 'public.jobs_no_self_assignment()'::regprocedure;").strip()
    check('jobs_no_self_assignment: SECURITY INVOKER, search_path pinned, no EXECUTE for client roles', out == 'false search_path=pg_catalog, public, pg_temp falsefalsefalse', out)
    out = must(db, "select md5(replace(prosrc, E'\\r', '')) || ' ' || prosecdef::text || ' ' || pg_get_userbyid(proowner) || ' ' || has_function_privilege('authenticated', oid, 'execute')::text "
                   "|| has_function_privilege('anon', oid, 'execute')::text from pg_proc where oid = 'public.pro_claim_job(uuid)'::regprocedure;").strip()
    check('pro_claim_job: 0039 body f72dcd37, definer, owner unchanged, EXECUTE authenticated only', out.split()[0] == 'f72dcd37731bf7379803e9be680d70f0' and out.split()[1] == 'true' and out.endswith('truefalse'), out)
    # the only change vs the live 0030 body is the two customer_id conditions
    import difflib, re as _re
    b30 = _re.search(r'create or replace function public\.pro_claim_job\(job_id uuid\).*?\nas \$\$(.*?)\$\$;', open(b.dep('0030')).read(), _re.S).group(1)
    b39 = _re.search(r'create or replace function public\.pro_claim_job\(job_id uuid\).*?\nas \$\$(.*?)\$\$;', open(F39).read(), _re.S).group(1)
    added = [l for l in difflib.ndiff(b30.splitlines(), b39.splitlines()) if l[:2] in ('+ ', '- ')]
    check('pro_claim_job = live 0030 body + only the two customer_id conditions (C1 order kept)',
          len(added) == 4 and sum(1 for l in added if l.startswith('+ ') and 'customer_id is distinct from v_pro' in l) == 2, added)


def g_guards(prefix):
    print('\n## Guards, re-run, CRLF paste, rollback, read-only checks')
    db = f'{prefix}_g'
    build(db)
    b.fcc_apply(db)   # Founder Control Center 0034/0035/0035a (live): its baseline pins the 0030 pro_claim_job
    run = lambda path: [l.split('|') for l in psql(db, f'set role {O};\nbegin read only;\n' + open(path).read() + 'rollback;\n').stdout.strip().splitlines() if '|' in l]
    rows = run(CHK_A)
    check('0039a before: READY (7 of 7)', rows and rows[0][1] == 'READY (7 of 7)', rows[:1])
    rows = run(CHK_B)
    check('0039b before: NOT LIVE', rows and rows[0][1].startswith('NOT LIVE'), rows[:1])
    r = apply(db, role='authenticated', expect_ok=False)
    check('as a client role -> refused', r.returncode != 0)
    apply(db, b.crlf(open(F39).read()))
    rows = run(CHK_A)
    check('CRLF paste applied; 0039a after: READY: already applied (7 of 7)', rows and rows[0][1] == 'READY: already applied (7 of 7)', rows[:1])
    rows = run(CHK_B)
    check('0039b after: LIVE (7 of 7)', rows and rows[0][1] == 'LIVE (7 of 7)', rows)
    check('FCC baseline_mismatches() after 0039 reports exactly pro_claim_job (expected, documented)',
          must(db, 'select coalesce(haven_admin.baseline_mismatches(), \'clean\');').strip() == 'public.pro_claim_job(uuid) (changed)')
    check('re-run is a no-op', apply(db, expect_ok=False).returncode == 0)
    must(db, "create or replace function public.jobs_customer_status_guard() returns trigger language plpgsql as $f$ begin return new; end $f$;")
    r = apply(db, expect_ok=False)
    check('another installed body -> refused, nothing changed', r.returncode != 0 and 'another body' in r.stderr, b.redact(r.stderr)[-160:])
    check('0039b catches the other body', run(CHK_B)[0][1].startswith('NOT LIVE'))
    must(db, f'set role {O};\n' + open(R39).read())
    check('rollback removes both triggers + functions', must(db, "select (to_regprocedure('public.jobs_customer_status_guard()') is null)::text || "
                                                         "(to_regprocedure('public.jobs_no_self_assignment()') is null)::text || "
                                                         "(not exists (select 1 from pg_trigger where tgname in ('jobs_customer_status_guard', 'jobs_no_self_assignment')))::text;").strip() == 'truetruetrue')
    check('rollback restores the exact live 0030 pro_claim_job (md5 789cb65e)', must(db, "select md5(replace(prosrc, E'\\r', '')) from pg_proc where oid = 'public.pro_claim_job(uuid)'::regprocedure;").strip() == '789cb65e77775da031012f78227d76ad')
    check('after rollback the FCC baseline is clean again (pg_get_functiondef identical to 0030)', must(db, "select coalesce(haven_admin.baseline_mismatches(), 'clean');").strip() == 'clean')
    rows = run(CHK_A)
    check('0039a after rollback: READY (7 of 7)', rows and rows[0][1] == 'READY (7 of 7)', rows[:1])
    must(db, "create or replace function public.pro_claim_job(job_id uuid) returns setof public.jobs language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $f$ begin return; end $f$;")
    rows = run(CHK_A)
    check('0039a with another pro_claim_job body: NOT READY', rows and rows[0][1].startswith('NOT READY'), rows[:1])
    r = apply(db, expect_ok=False)
    check('0039 with another pro_claim_job body -> refused, nothing changed', r.returncode != 0 and 'neither 0030 nor 0039' in r.stderr
          and must(db, "select (to_regprocedure('public.jobs_customer_status_guard()') is null)::text;").strip() == 'true', b.redact(r.stderr)[-160:])
    r = psql(db, f'set role {O};\n' + open(R39).read())
    check('rollback with another pro_claim_job body -> refused, nothing changed', r.returncode != 0 and 'neither 0039 nor 0030' in r.stderr, b.redact(r.stderr)[-160:])
    m30 = __import__('re').search(r'create or replace function public\.pro_claim_job\(job_id uuid\).*?\$\$;', open(b.dep('0030')).read(), __import__('re').S).group(0)
    must(db, m30)
    setjob(db, 'arrived', P1)
    ok, _ = attempt(db, 'C1', 'complete')
    if has29(db):   # production-equivalent wrapper with 0025-0029 in the base: 0029 still closes F5 on its own
        check('after rollback (0029 in base) Customer arrived -> complete is still refused by 0029', not ok)
    else:
        check('after rollback (no 0029) the F5 gap is back: Customer arrived -> complete succeeds', ok)
    apply(db)
    setjob(db, 'arrived', P1)
    check('re-apply closes it again', attempt(db, 'C1', 'complete')[0] is False)
    for path in (CHK_A, CHK_B):
        t = open(path).read().lower()
        t = re.sub(r"'(?:[^']|'')*'", "''", re.sub(r'--[^\n]*', '', t))  # ignore comments and string literals
        check(f'{os.path.basename(path)} is one read-only SELECT (no DML/DDL)',
              not any(k in t for k in ('insert ', 'update ', 'delete ', 'create ', 'alter ', 'drop ', 'grant ', 'revoke ')))
    psql('postgres', f'drop database if exists {db};')


def main():
    print(f'0039 under test: {F39} sha256 {b.sha(F39)}')
    try:
        db = f'{PREFIX}_live'
        build(db)
        g_moves(db, 'live set (production-equivalent), 0039 added')
        g_catalog(db)
        if not QUICK:
            db2 = f'{PREFIX}_fin'
            build(db2)
            drafts(db2)
            base_fin = g_moves(db2, 'live set + 0026/0028/0029, then 0039')
            db3 = f'{PREFIX}_fin2'
            build(db3)
            g_moves(db3, '0039 first, then 0026/0028/0029 (baseline: the 0026-0029 stack without 0039)',
                    apply_first=lambda d: (apply(d), drafts(d)), base=base_fin)
            g_guards(PREFIX)
    finally:
        out = must('postgres', f"select string_agg(datname, ' ') from pg_database where datname like '{PREFIX}%';").strip()
        for d in out.split():
            psql('postgres', f'drop database if exists {d};')
    n, ok = len(b.RESULTS), sum(b.RESULTS)
    print(f'\nRESULT {ok}/{n} passed')
    sys.exit(0 if n and ok == n else 1)


if __name__ == '__main__':
    main()
