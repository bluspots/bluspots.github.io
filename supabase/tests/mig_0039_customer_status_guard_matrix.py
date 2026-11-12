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
FORBIDDEN = ['posted', 'en_route', 'arrived', 'diagnosing', 'materials_requested', 'in_progress', 'complete']
SOURCES = [('posted', None), ('en_route', P1), ('arrived', P1), ('diagnosing', P1), ('materials_requested', P1),
           ('materials_approved', P1), ('in_progress', P1)]
CUST_OK = [('posted', None, 'cancelled'), ('materials_requested', P1, 'materials_approved')]
PRO_MOVES = [('en_route', 'arrived'), ('arrived', 'in_progress'), ('arrived', 'diagnosing'), ('in_progress', 'complete'),
             ('diagnosing', 'materials_requested'), ('materials_approved', 'in_progress')]


def apply(db, text=None, role=O, expect_ok=True):
    r = psql(db, (f'set role {role};\n' if role else '') + (text if text is not None else open(F39).read()))
    if expect_ok and r.returncode:
        raise SystemExit(f'0039 failed on {db}:\n{b.redact(r.stderr)[-1500:]}')
    return r


def drafts(db):
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
             f"{'null' if pro is None else 'now()'}, cancelled_at = null, requires_diagnosis = {'true' if status in ('diagnosing', 'materials_requested', 'materials_approved') else 'false'}"
             f"{seq} where id = '{J1}';\ncommit;\n")


def attempt(db, who, target):
    r = psql(db, 'begin;\n' + b.as_actor(who) + f"update public.jobs set status = '{target}' where id = '{J1}';\ncommit;\n", stop=False)
    now = must(db, f"select status from public.jobs where id = '{J1}';").strip()
    return now == target, r


def outcomes(db):
    res = {}
    for st, pro in SOURCES:
        for t in FORBIDDEN:
            if t == st:
                continue
            setjob(db, st, pro)
            res[('C1', st, t)] = attempt(db, 'C1', t)[0]
    for st, pro, t in CUST_OK:
        setjob(db, st, pro)
        res[('C1ok', st, t)] = attempt(db, 'C1', t)[0]
    for st, t in PRO_MOVES:
        setjob(db, st, P1)
        res[('P1', st, t)] = attempt(db, 'P1', t)[0]
    return res


def g_moves(db, label, apply_first=None, base=None):
    print(f'\n## {label}')
    base = base or outcomes(db)
    gap = sorted(f'{s}->{t}' for (w, s, t), ok in base.items() if w == 'C1' and ok)
    print(f'   baseline (no 0039): Customer moves that succeed today: {len(gap)} {gap}')
    (apply_first or apply)(db)
    after = outcomes(db)
    for k, ok in sorted(after.items()):
        w, s, t = k
        if w == 'C1':
            check(f'[{label}] Customer {s} -> {t}: refused', ok is False)
        else:
            check(f'[{label}] {"Customer" if w == "C1ok" else "Pro"} {s} -> {t}: same as without 0039 ({base[k]})', ok == base[k])
    setjob(db, 'arrived', P1)
    ok, r = attempt(db, 'C1', 'complete')
    check(f'[{label}] refusal is SQLSTATE 42501 "The customer cannot set this job status"', not ok and 'The customer cannot set this job status' in r.stderr, b.redact(r.stderr)[-160:])
    setjob(db, 'arrived', P1)
    r = psql(db, 'begin;\n' + b.as_actor('C1') + f"update public.jobs set status = 'arrived', title = title where id = '{J1}' returning 'same';\ncommit;\n", stop=False)
    check(f'[{label}] same-status write by the Customer is not a move (allowed by 0039)', 'ERROR' not in r.stderr or 'cannot set this job status' not in r.stderr)
    setjob(db, 'en_route', P1)
    must(db, b.OWNER + f"update public.jobs set status = 'arrived' where id = '{J1}';")
    check(f'[{label}] owner / SQL editor moves are not limited', must(db, f"select status from public.jobs where id = '{J1}';").strip() == 'arrived')
    setjob(db, 'en_route', P1)
    r = psql(db, 'begin;\n' + b.as_actor('service_role') + f"update public.jobs set status = 'arrived' where id = '{J1}';\ncommit;\n", stop=False)
    check(f'[{label}] service_role is privileged (not limited)', must(db, f"select status from public.jobs where id = '{J1}';").strip() == 'arrived', b.redact(r.stderr)[-120:])
    setjob(db, 'posted', None)
    r = psql(db, 'begin;\n' + b.as_actor('P1') + f"select count(*) from public.pro_claim_job('{J1}');\ncommit;\n", stop=False)
    check(f'[{label}] pro_claim_job (posted -> en_route, SECURITY DEFINER) unaffected', r.returncode == 0 and 'ERROR' not in r.stderr and must(db, f"select status from public.jobs where id = '{J1}';").strip() == 'en_route', b.redact(r.stderr)[-160:])
    # a job whose customer is also its assigned Pro (e.g. a Pro posting a job for their own home): Pro moves stay allowed
    setjob(db, 'en_route', P1)
    must(db, b.OWNER + f"begin; set local session_replication_role = replica; update public.jobs set customer_id = '{P1}' where id = '{J1}'; commit;")
    ok, r = attempt(db, 'P1', 'arrived')
    if has29(db):   # 0029 IV.3 refuses this edge by itself (customer check without a Pro exemption); 0039 must add nothing
        check(f'[{label}] customer = assigned Pro: 0039 adds no refusal (0029 decides this edge)', 'Only the assigned Pro (or Haven)' not in r.stderr, b.redact(r.stderr)[-160:])
    else:
        check(f'[{label}] customer = assigned Pro: Pro move en_route -> arrived still allowed', ok, b.redact(r.stderr)[-160:])
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


def g_guards(prefix):
    print('\n## Guards, re-run, CRLF paste, rollback, read-only checks')
    db = f'{prefix}_g'
    b.build(db)
    run = lambda path: [l.split('|') for l in psql(db, f'set role {O};\nbegin read only;\n' + open(path).read() + 'rollback;\n').stdout.strip().splitlines() if '|' in l]
    rows = run(CHK_A)
    check('0039a before: READY (5 of 5)', rows and rows[0][1] == 'READY (5 of 5)', rows[:1])
    rows = run(CHK_B)
    check('0039b before: NOT LIVE', rows and rows[0][1].startswith('NOT LIVE'), rows[:1])
    r = apply(db, role='authenticated', expect_ok=False)
    check('as a client role -> refused', r.returncode != 0)
    apply(db, b.crlf(open(F39).read()))
    rows = run(CHK_A)
    check('CRLF paste applied; 0039a after: READY: already applied (5 of 5)', rows and rows[0][1] == 'READY: already applied (5 of 5)', rows[:1])
    rows = run(CHK_B)
    check('0039b after: LIVE (4 of 4)', rows and rows[0][1] == 'LIVE (4 of 4)', rows)
    check('re-run is a no-op', apply(db, expect_ok=False).returncode == 0)
    must(db, "create or replace function public.jobs_customer_status_guard() returns trigger language plpgsql as $f$ begin return new; end $f$;")
    r = apply(db, expect_ok=False)
    check('another installed body -> refused, nothing changed', r.returncode != 0 and 'another body' in r.stderr, b.redact(r.stderr)[-160:])
    check('0039b catches the other body', run(CHK_B)[0][1].startswith('NOT LIVE'))
    must(db, f'set role {O};\n' + open(R39).read())
    check('rollback removes trigger + function', must(db, "select (to_regprocedure('public.jobs_customer_status_guard()') is null)::text || "
                                                         "(not exists (select 1 from pg_trigger where tgname = 'jobs_customer_status_guard'))::text;").strip() == 'truetrue')
    setjob(db, 'arrived', P1)
    ok, _ = attempt(db, 'C1', 'complete')
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
        b.build(db)
        g_moves(db, 'live set (production-equivalent), 0039 added')
        g_catalog(db)
        if not QUICK:
            db2 = f'{PREFIX}_fin'
            b.build(db2)
            drafts(db2)
            base_fin = g_moves(db2, 'live set + 0026/0028/0029, then 0039')
            db3 = f'{PREFIX}_fin2'
            b.build(db3)
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
