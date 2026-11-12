#!/usr/bin/env python3
"""MIG-0031 (refreshed 2026-11-12, t674) local matrix: server-side amount validation at posting (F2).

LOCAL ONLY: throwaway Postgres 17 (default -h /tmp -p 54329), databases HAVEN_DB_PREFIX_*, dropped at the
end. Never point it at Supabase. Coordinates are synthetic and never printed.
Uses the 0036 harness from Customer PR #97 (supabase/tests/mig_0036_realtime_signal_matrix.py): put its
directory in HAVEN_0036_TESTS. HAVEN_DEPS = dir with 0026/0027/0028/0029(#90 eff1315e)/0030/0032 + Hub FCC.
Stack: the 0036 harness's live set (master 0001-0025, 0027, 0030, 0032, 0036), then 0026 -> 0028 -> 0029
as the superuser (skipped when the caller's stack already has 0029-v2), then 0031 as the owner stand-in.
Env: HAVEN_0031 (file under test), HAVEN_QUICK=1 (mutant mode).
"""
import json, os, re, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get('HAVEN_0036_TESTS', HERE))
os.environ.setdefault('HAVEN_DB_PREFIX', 'codey0031_%d' % os.getpid())
import mig_0036_realtime_signal_matrix as b   # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, '..'))
F31 = os.environ.get('HAVEN_0031') or os.path.join(ROOT, 'migrations', '0031_posting_amounts_validation.sql')
R31 = os.path.join(ROOT, 'rollback', '0031_posting_amounts_validation_rollback.sql')
CHK_A = os.path.join(ROOT, 'checks', '0031a_check_before_READ_ONLY.sql')
CHK_B = os.path.join(ROOT, 'checks', '0031b_check_after_READ_ONLY.sql')
PREFIX = os.environ['HAVEN_DB_PREFIX']
QUICK = os.environ.get('HAVEN_QUICK') == '1'
O = b.OWNER_ROLE
C1, C2, P1, J3 = b.C1, b.C2, b.P1, b.J3
check, must, psql = b.check, b.must, b.psql
NEW = 'e0310000-0000-4000-8000-0000000000'


def has29(db):
    return must(db, "select exists (select 1 from pg_proc where oid = to_regprocedure('public.jobs_lock_pricing_and_inspection()') "
                    "and prosrc like '%haven-version: 0029-v2 %');").strip() == 't'


def build(db, with_0031=True, with_0029=True):
    b.build(db)
    if with_0029 and not has29(db):
        for n in ('0026', '0028', '0029'):
            must(db, open(b.dep(n)).read())
    if with_0031:
        apply(db)


def apply(db, text=None, role=O, expect_ok=True):
    r = psql(db, (f'set role {role};\n' if role else '') + (text if text is not None else open(F31).read()))
    if expect_ok and r.returncode:
        raise SystemExit(f'0031 failed on {db}:\n{b.redact(r.stderr)[-1500:]}')
    return r


APP = dict(fixed_customer_labor_price_cents=8900, fixed_pro_labor_payout_cents=7120, margin_rate_bps=2000,
           requires_diagnosis=False, inspection_fee_cents=0, emergency=False, emergency_fee_cents=0,
           materials_reimbursed_cents=0, tip_amount_cents=0)


def post(db, who, n, cust=None, **over):
    """Insert one job the way the Customer app does (home_services_app.jsx postJob payload)."""
    vals = dict(APP, **over)
    cols = dict(id=f"'{NEW}{n:02d}'", customer_id=f"'{cust or C1}'", status="'posted'", category="'Plumbing'", title="'synthetic'",
                city_label="'Test City'", lat=b.JOBPT[0], lng=b.JOBPT[1], payment_snapshot="'{\"brand\":\"Card\",\"last4\":\"----\"}'")
    for k, v in vals.items():
        cols[k] = 'null' if v is None else (str(v).lower() if isinstance(v, bool) else str(v))
    sql = (f"insert into public.jobs ({', '.join(cols)}) values ({', '.join(cols.values())}) returning 'inserted';")
    pre = 'begin;\n' + (b.as_actor(who) if who != 'owner' else b.OWNER)
    r = psql(db, pre + sql + '\ncommit;\n', stop=False)
    return r


def stored(db, n):
    out = must(db, f"select coalesce((select row_to_json(x)::text from (select fixed_customer_labor_price_cents p, fixed_pro_labor_payout_cents po, margin_rate_bps m, "
                   f"inspection_fee_cents i, emergency_fee_cents e, materials_approved_cents a from public.jobs where id = '{NEW}{n:02d}') x), '-');").strip()
    return None if out == '-' else json.loads(out)


def g_rules(db):
    print('\n## A. App-shaped posts are accepted; every off-contract amount is refused (42501, nothing written)')
    ok_cases = [
        (1, 'catalog standard job (8900 / 7120 / 2000)', {}),
        (2, 'diagnosis job: inspection 4500', dict(requires_diagnosis=True, inspection_fee_cents=4500)),
        (3, 'emergency job with the app fee 3500 (amount not validated, 5a)', dict(emergency=True, emergency_fee_cents=3500)),
        (4, 'emergency job with fee 0', dict(emergency=True, emergency_fee_cents=0)),
        (5, 'odd price 8999 -> payout floor(7199.2) = 7199', dict(fixed_customer_labor_price_cents=8999, fixed_pro_labor_payout_cents=7199)),
        (6, 'price 0 (custom path, 5b pending) -> payout 0', dict(fixed_customer_labor_price_cents=0, fixed_pro_labor_payout_cents=0)),
        (7, 'large price 2000000 -> payout 1600000 (bigint math)', dict(fixed_customer_labor_price_cents=2000000, fixed_pro_labor_payout_cents=1600000)),
    ]
    for n, label, over in ok_cases:
        r = post(db, 'C1', n, **over)
        check(f'C1 posts {label} -> inserted', 'inserted' in r.stdout and stored(db, n) is not None, b.redact(r.stderr)[-200:])
    bad = [
        (21, 'margin 1500', dict(margin_rate_bps=1500), 'margin rate'),
        (22, 'margin 0', dict(margin_rate_bps=0), 'margin rate'),
        (23, 'payout 7121 (one cent high)', dict(fixed_pro_labor_payout_cents=7121), 'Pro payout'),
        (24, 'payout = price (no margin)', dict(fixed_pro_labor_payout_cents=8900), 'Pro payout'),
        (25, 'payout 0 on a priced job', dict(fixed_pro_labor_payout_cents=0), 'Pro payout'),
        (26, 'odd price rounded up (7200)', dict(fixed_customer_labor_price_cents=8999, fixed_pro_labor_payout_cents=7200), 'Pro payout'),
        (27, 'inspection 4500 on a standard job', dict(inspection_fee_cents=4500), 'inspection fee'),
        (28, 'inspection 0 on a diagnosis job', dict(requires_diagnosis=True, inspection_fee_cents=0), 'inspection fee'),
        (29, 'inspection 1 on a diagnosis job', dict(requires_diagnosis=True, inspection_fee_cents=1), 'inspection fee'),
        (30, 'emergency fee 3500 on a non-emergency job', dict(emergency_fee_cents=3500), 'emergency fee'),
        (31, 'convenience fee 3000 at posting', dict(convenience_fee_cents=3000), 'convenience fee'),
        (32, 'tip 100 at posting', dict(tip_amount_cents=100), 'convenience fee'),
        (33, 'materials reimbursed 1 at posting', dict(materials_reimbursed_cents=1), 'convenience fee'),
        (34, 'materials estimate 1 at posting', dict(materials_estimate_cents=1), 'convenience fee'),
    ]
    for n, label, over, msg in bad:
        r = post(db, 'C1', n, **over)
        check(f'C1 posts {label} -> refused 42501, nothing written', 'inserted' not in r.stdout and msg in r.stderr and stored(db, n) is None,
              b.redact(r.stderr)[-160:])
    r = post(db, 'C1', 35, materials_approved_cents=500)
    st = stored(db, 35)
    check('materials_approved_cents 500 at posting -> stored null (0026 insert branch), not refused', 'inserted' in r.stdout and st and st['a'] is None, (st, b.redact(r.stderr)[-160:]))
    r = post(db, 'C1', 36, cust=C2)
    check("C1 posts a job for another customer -> refused by RLS (unchanged)", 'inserted' not in r.stdout and stored(db, 36) is None)
    r = post(db, 'anon', 37)
    check('anon post -> refused (unchanged)', 'inserted' not in r.stdout and stored(db, 37) is None)
    r = post(db, 'owner', 40, margin_rate_bps=1500, fixed_pro_labor_payout_cents=1)
    check('owner / SQL editor (privileged) may insert any amounts (admin repair)', 'inserted' in r.stdout and stored(db, 40) is not None, r.stderr[-160:])
    must(db, 'revoke delete on table public.jobs from anon, authenticated; revoke select, insert, update, delete on table public.jobs from service_role;')   # production jobs grants (CoS probe 2026-11-12): service_role has no INSERT on jobs
    r = post(db, 'service_role', 41, margin_rate_bps=1500)
    check('service_role under the production grants: permission denied for table jobs, nothing written (no bypass path)',
          'inserted' not in r.stdout and 'permission denied for table jobs' in r.stderr and stored(db, 41) is None, r.stderr[-160:])
    # after posting: 0029 still locks the amounts (F1), and the live job features still work
    _, r = None, psql(db, 'begin;\n' + b.as_actor('C1') + f"update public.jobs set fixed_pro_labor_payout_cents = 1 where id = '{NEW}01';\ncommit;\n", stop=False)
    check('F1 regression: Customer PATCH of a posted amount still refused (0029)', 'ERROR' in r.stderr and stored(db, 1)['po'] == 7120, b.redact(r.stderr)[-160:])
    out = must(db, 'begin;\n' + b.as_actor('P2') + "select count(*) from public.jobs_posted_within_radius() where id = '" + NEW + "01';\ncommit;\n").strip().splitlines()[-1]
    check('board: the new job is visible to the nearby free Pro (P2)', out == '1', out)
    r = psql(db, 'begin;\n' + b.as_actor('P2') + f"select count(*) from public.pro_claim_job('{NEW}01');\ncommit;\n", stop=False)
    check('claim: P2 claims the new job (pro_claim_job, privileged path unaffected)', r.returncode == 0 and 'ERROR' not in r.stderr, b.redact(r.stderr)[-160:])
    must(db, b.OWNER + f"begin; set local session_replication_role = replica; update public.jobs set status = 'cancelled', pro_id = null where id = '{NEW}01'; commit;")


def g_catalog(db):
    print('\n## B. Catalog')
    out = must(db, "select t.tgtype || ' ' || t.tgenabled::text || ' ' || (t.tgqual is null)::text from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_validate_posting_amounts';").strip()
    check('trigger BEFORE INSERT row, enabled, no WHEN', out == '7 O true', out)
    out = must(db, "select p.prosecdef::text || ' ' || array_to_string(p.proconfig, ';') || ' ' || has_function_privilege('authenticated', p.oid, 'execute')::text "
                   "|| has_function_privilege('anon', p.oid, 'execute')::text || has_function_privilege('service_role', p.oid, 'execute')::text "
                   "from pg_proc p where p.oid = 'public.jobs_validate_posting_amounts()'::regprocedure;").strip()
    check('SECURITY INVOKER, search_path pinned, no EXECUTE for client roles', out == 'false search_path=pg_catalog, public, pg_temp falsefalsefalse', out)
    out = must(db, "select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'public.jobs'::regclass and not tgisinternal and tgtype & 2 = 2 and tgtype & 4 = 4;").strip()
    check('BEFORE INSERT triggers fire in name order, 0031 last', out.split(',')[-1] == 'jobs_validate_posting_amounts', out)


def g_guards(prefix):
    print('\n## C. Guards, re-run, CRLF paste, rollback, re-apply')
    db = f'{prefix}_g1'
    build(db, with_0031=False, with_0029=False)
    if not has29(db):
        r = apply(db, expect_ok=False)
        check('without 0029 -> refused, nothing changed', r.returncode != 0 and 'needs 0029' in r.stderr
              and must(db, "select to_regprocedure('public.jobs_validate_posting_amounts()') is null;").strip() == 't', b.redact(r.stderr)[-200:])
    psql('postgres', f'drop database if exists {db};')
    db = f'{prefix}_g2'
    build(db, with_0031=False)
    r = apply(db, role=None if False else 'authenticated', expect_ok=False)
    check('as a client role -> refused', r.returncode != 0)
    must(db, "alter table public.jobs disable trigger jobs_lock_pricing_and_inspection;")
    r = apply(db, expect_ok=False)
    check('0029 trigger disabled -> refused', r.returncode != 0 and 'needs 0029' in r.stderr, b.redact(r.stderr)[-200:])
    must(db, "alter table public.jobs enable trigger jobs_lock_pricing_and_inspection;")
    run = lambda path: [l.split('|') for l in psql(db, f'set role {O};\nbegin read only;\n' + open(path).read() + 'rollback;\n').stdout.strip().splitlines() if '|' in l]
    rows = run(CHK_A)
    check('0031a before: READY (5 of 5)', rows and rows[0][1] == 'READY (5 of 5)', rows[:1])
    rows = run(CHK_B)
    check('0031b before: NOT LIVE', rows and rows[0][1].startswith('NOT LIVE'), rows[:1])
    apply(db, b.crlf(open(F31).read()))
    check('CRLF paste applies (CR-insensitive md5)', must(db, "select to_regprocedure('public.jobs_validate_posting_amounts()') is not null;").strip() == 't')
    rows = run(CHK_A)
    check('0031a after: READY: already applied (5 of 5)', rows and rows[0][1] == 'READY: already applied (5 of 5)', rows[:1])
    rows = run(CHK_B)
    check('0031b after: LIVE (5 of 5)', rows and rows[0][1] == 'LIVE (5 of 5)', rows)
    r = apply(db, expect_ok=False)
    check('re-run is a no-op (same body)', r.returncode == 0)
    must(db, "create or replace function public.jobs_validate_posting_amounts() returns trigger language plpgsql as $f$ begin return new; end $f$;")
    r = apply(db, expect_ok=False)
    check('another installed body -> refused, nothing changed', r.returncode != 0 and 'another body' in r.stderr
          and 'return new; end' in must(db, "select prosrc from pg_proc where oid = 'public.jobs_validate_posting_amounts()'::regprocedure;"), b.redact(r.stderr)[-200:])
    rows = run(CHK_B)
    check('0031b catches the other body', rows and rows[0][1].startswith('NOT LIVE'), rows[:1])
    rows = run(CHK_A)
    check('0031a: other body -> NOT READY', rows and rows[0][1].startswith('NOT READY'), rows[:1])
    must(db, f'set role {O};\n' + open(R31).read())
    check('rollback removes trigger + function', must(db, "select (to_regprocedure('public.jobs_validate_posting_amounts()') is null)::text || "
                                                         "(not exists (select 1 from pg_trigger where tgname = 'jobs_validate_posting_amounts'))::text;").strip() == 'truetrue')
    r = post(db, 'C1', 50, margin_rate_bps=1500)
    check('after rollback a client may again post margin 1500 (exact 0029 state)', 'inserted' in r.stdout, r.stderr[-160:])
    apply(db)
    r = post(db, 'C1', 51, margin_rate_bps=1500)
    check('re-apply after rollback works (refuses again)', 'inserted' not in r.stdout and 'margin rate' in r.stderr)
    for path in (CHK_A, CHK_B):
        t = open(path).read().lower()
        t = re.sub(r"'(?:[^']|'')*'", "''", re.sub(r'--[^\n]*', '', t))  # ignore comments and string literals
        check(f'{os.path.basename(path)} is one read-only SELECT (no DML/DDL)',
              not any(k in t for k in ('insert ', 'update ', 'delete ', 'create ', 'alter ', 'drop ', 'grant ', 'revoke ')))
    psql('postgres', f'drop database if exists {db};')


def main():
    print(f'0031 under test: {F31} sha256 {b.sha(F31)}')
    db = f'{PREFIX}_main'
    try:
        build(db)
        g_rules(db)
        g_catalog(db)
        if not QUICK:
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
