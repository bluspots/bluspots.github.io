#!/usr/bin/env python3
"""MIG-0038 local matrix: customer_cancel_job (Customer cancel, including after a Pro accepted).

LOCAL ONLY: throwaway Postgres 17 (default -h /tmp -p 54329), databases HAVEN_DB_PREFIX_*, all dropped
at the end. Never point HAVEN_PG at Supabase. Coordinates are synthetic and never printed.
Base = the 0036 harness (master 0001-0025, 0027, 0030, 0032 (+ drafts 0026/0028/0029/0031), real Supabase
realtime schema + auth.uid(), 0036 applied). Optional: HAVEN_0037_FILE = path to 0037 (Customer PR) to
also test with live-location sessions. Env: HAVEN_DEPS, HAVEN_0038 (file under test), HAVEN_QUICK.
"""
import json, os, re, subprocess, sys, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault('HAVEN_DB_PREFIX', 'codey0038_%d' % os.getpid())
import mig_0036_realtime_signal_matrix as b   # noqa: E402

ROOT = b.ROOT
F38 = os.environ.get('HAVEN_0038') or os.path.join(ROOT, 'migrations', '0038_customer_cancel_job.sql')
R38 = os.path.join(ROOT, 'rollback', '0038_customer_cancel_job_rollback.sql')
CHK_A = os.path.join(ROOT, 'checks', '0038a_check_before_READ_ONLY.sql')
CHK_B = os.path.join(ROOT, 'checks', '0038b_check_after_READ_ONLY.sql')
F37 = os.environ.get('HAVEN_0037_FILE', '')
PREFIX = os.environ['HAVEN_DB_PREFIX']
QUICK = b.QUICK
O = b.OWNER_ROLE
C1, P1, C2, P2, P3, J1, J2, J3 = b.C1, b.P1, b.C2, b.P2, b.P3, b.J1, b.J2, b.J3
check, must, psql = b.check, b.must, b.psql
JX = 'e0380000-0000-4000-8000-0000000000e1'
OWN = f"""
alter default privileges for role {O} in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role {O} in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role {O} in schema public grant all on sequences to anon, authenticated, service_role;
alter table public.job_live_locations owner to {O};
alter table public.job_status_events owner to {O};
alter table public.materials_requests owner to {O};
alter table public.materials_receipts owner to {O};
alter table public.tips owner to {O};
alter table public.earnings_statements owner to {O};
alter function public.pro_update_live_location(uuid,double precision,double precision,timestamptz) owner to {O};
alter function public.get_job_live_location(uuid) owner to {O};
alter function public.jobs_discard_live_location() owner to {O};
"""


def apply_0038(db, text=None, role=O, expect_ok=True):
    r = psql(db, (f'set role {role};\n' if role else '') + (text if text is not None else open(F38).read()))
    if expect_ok and r.returncode:
        raise SystemExit(f'0038 failed on {db}:\n{b.redact(r.stderr)[-2000:]}')
    return r


def build(db, with_0038=True, drafts=True, with_0037=False):
    b.build(db, drafts=drafts)
    must(db, OWN)
    if with_0037:
        r = psql(db, f'set role {O};\n' + open(F37).read())
        if r.returncode:
            raise SystemExit('0037 failed: ' + r.stderr[-500:])
    if with_0038:
        apply_0038(db)


def q(db, who, sql, stop=True):
    pre = 'begin;\n' + (b.as_actor(who) if who != 'owner' else b.OWNER)
    r = psql(db, pre + sql + '\ncommit;\n', stop=stop)
    out = [l for l in r.stdout.strip().splitlines() if l.strip()]
    return (out[-1] if out else ''), r


def cancel(db, who, job):
    j = 'null' if job is None else f"'{job}'"
    out, r = q(db, who, f"select public.customer_cancel_job({j});", stop=False)
    try:
        return json.loads(out)
    except Exception:
        return {'raw': out, 'err': (r.stderr.splitlines() or [''])[0]}


def setjob(db, status, pro=P1, extra='', job=J1, cust=C1):
    """Put a job into an exact state (replica mode: bypasses triggers; test fixture only)."""
    p = 'null' if pro is None else f"'{pro}'"
    acc = 'null' if pro is None else "now() - interval '10 minutes'"
    cols = must(db, "select string_agg(attname, ',') from pg_attribute where attrelid = 'public.jobs'::regclass and not attisdropped;").strip().split(',')
    mat = ''.join(f', {c} = {v}' for c, v in (('materials_requested_at', 'null'), ('materials_approved_cents', 'null'), ('materials_approved_at', 'null'),
                                               ('materials_request_seq', '0'), ('materials_decided_seq', '0')) if c in cols)
    must(db, "begin;\nset local session_replication_role = replica;\n"
             + (f"delete from public.job_pro_releases where job_id = '{job}';\n" if must(db, "select to_regclass('public.job_pro_releases') is not null;").strip() == 't' else '')
             + f"delete from public.job_status_events where job_id = '{job}';\n"
             f"delete from public.materials_requests where job_id = '{job}'; delete from public.tips where job_id = '{job}';\n"
             f"delete from public.materials_receipts where job_id = '{job}'; delete from public.earnings_statements where job_id = '{job}';\n"
             f"delete from public.job_live_locations where job_id = '{job}';\n"
             + ("delete from public.job_live_sessions;\n" if F37 and must(db, "select to_regclass('public.job_live_sessions') is not null;").strip() == 't' else '')
             + f"update public.jobs set status = '{status}', pro_id = {p}, customer_id = '{cust}', accepted_at = {acc}, cancelled_at = null, "
               f"tip_amount_cents = 0, materials_reimbursed_cents = 0, payment_snapshot = '{{\"note\":\"placeholder\"}}'{mat} where id = '{job}';\n"
             + extra + "\ncommit;\n")


def row(db, job=J1):
    return json.loads(must(db, f"select json_build_object('status', status, 'pro_id', pro_id, 'accepted_at', accepted_at is not null, "
                               f"'cancelled_at', cancelled_at is not null) from public.jobs where id = '{job}';").strip())


def events(db, job=J1):
    return json.loads(must(db, f"select coalesce(json_agg(json_build_object('from', from_status, 'to', to_status, 'role', actor_role, 'actor', actor_id) order by id), '[]') "
                               f"from public.job_status_events where job_id = '{job}';").strip())


def releases(db, job=J1):
    if must(db, "select to_regclass('public.job_pro_releases') is not null;").strip() != 't':
        return None
    return json.loads(must(db, "select coalesce(json_agg(json_build_object('pro', r.released_pro_id, 'event_to', e.to_status, 'event_actor', e.actor_id) order by r.event_id), '[]') "
                               f"from public.job_pro_releases r join public.job_status_events e on e.id = r.event_id where r.job_id = '{job}';").strip())


def add_point(db, job=J1, pro=P1):
    must(db, "begin;\nset local session_replication_role = replica;\n"
             f"insert into public.job_live_locations values ('{job}', '{pro}', 27.111111, -80.222222, now(), null) on conflict (job_id) do nothing;\ncommit;\n")


def points(db, job=J1):
    return int(must(db, f"select count(*) from public.job_live_locations where job_id = '{job}';").strip())


# ───────────────────────────── groups ─────────────────────────────

def g_allowed(db):
    print('\n## A. Allowed: posted (no Pro), en_route, arrived')
    setjob(db, 'posted', pro=None)
    m = b.expect_signals(db, 'posted cancel signals the Customer only', b.as_actor('C1') + f"select public.customer_cancel_job('{J1}') \\g /dev/null\n",
                         [('C1', 'updated', 'cancelled')], J1)
    setjob(db, 'posted', pro=None)
    res = cancel(db, 'C1', J1)
    check('posted -> {ok, status cancelled, from posted, pro_released false}', res == {'ok': True, 'status': 'cancelled', 'from_status': 'posted', 'pro_released': False}, res)
    check('posted: row cancelled, cancelled_at set, no Pro', row(db) == {'status': 'cancelled', 'pro_id': None, 'accepted_at': False, 'cancelled_at': True}, row(db))
    check('posted: one event customer posted->cancelled by C1', events(db) == [{'from': 'posted', 'to': 'cancelled', 'role': 'customer', 'actor': C1}], events(db))
    check('posted: no released-Pro record (no Pro)', releases(db) == [], releases(db))
    for st in ('en_route', 'arrived'):
        setjob(db, st)
        if st == 'en_route':
            add_point(db)
        m = b.expect_signals(db, f'{st} cancel: Customer updated + old Pro removed (both cancelled)',
                             b.as_actor('C1') + f"select public.customer_cancel_job('{J1}') \\g /dev/null\n",
                             [('C1', 'updated', 'cancelled'), ('P1', 'removed', 'cancelled')], J1)
        if m is not None:
            check(f'{st}: signal reaches Customer + old Pro only', b.receivers(db, {x['topic'] for x in m}) == {'C1', 'P1'})
        setjob(db, st)
        if st == 'en_route':
            add_point(db)
        res = cancel(db, 'C1', J1)
        check(f'{st} -> {{ok, cancelled, from {st}, pro_released true}}', res == {'ok': True, 'status': 'cancelled', 'from_status': st, 'pro_released': True}, res)
        check(f'{st}: row cancelled, Pro + accepted_at cleared, cancelled_at set', row(db) == {'status': 'cancelled', 'pro_id': None, 'accepted_at': False, 'cancelled_at': True}, row(db))
        check(f'{st}: exactly one event (customer, from {st})', events(db) == [{'from': st, 'to': 'cancelled', 'role': 'customer', 'actor': C1}], events(db))
        check(f'{st}: released Pro P1 recorded (owner-only), linked to that event', releases(db) == [{'pro': P1, 'event_to': 'cancelled', 'event_actor': C1}], releases(db))
        check(f'{st}: live point gone', points(db) == 0)
        out, _ = q(db, 'P1', f"select count(*) from public.jobs where id = '{J1}';")
        check(f'{st}: old Pro can no longer read the job (RLS)', out == '0', out)
        out, r = q(db, 'P1', f"select public.get_assigned_job_destination('{J1}')->>'error';", stop=False)
        check(f'{st}: old Pro destination RPC -> not_found', out == 'not_found', out + r.stderr[-100:])
        if not F37:
            out, _ = q(db, 'P1', f"select public.pro_update_live_location('{J1}', 27.1, -80.2, now())->>'error';")
            check(f'{st}: old Pro live write -> not_found, no point', out == 'not_found' and points(db) == 0, out)
        out, _ = q(db, 'C1', f"select public.get_job_live_location('{J1}')->>'error';")
        check(f'{st}: Customer live view -> tracking_not_active', out == 'tracking_not_active', out)
    # released-Pro record and job history are not readable by any app role
    for w in ('C1', 'P1', 'P2'):
        _, r = q(db, w, 'select count(*) from public.job_pro_releases;', stop=False)
        check(f'{w} cannot read job_pro_releases (permission denied)', 'permission denied' in r.stderr, r.stderr[-100:])
        _, r = q(db, w, 'select count(*) from public.job_status_events;', stop=False)
        check(f'{w} cannot read job_status_events (0027: RLS on, no grants)', 'permission denied' in r.stderr, r.stderr[-100:])
    # inspection fee value alone is not an obligation (t674 definition; OPEN for the founder)
    for st in ('en_route', 'arrived'):
        setjob(db, st, extra=f"update public.jobs set requires_diagnosis = true, inspection_fee_cents = 4500 where id = '{J1}';")
        res = cancel(db, 'C1', J1)
        check(f'{st} + requires_diagnosis + inspection_fee_cents 4500 (not started) -> allowed', res.get('ok') is True and res.get('from_status') == st, res)
    setjob(db, 'diagnosing', extra=f"update public.jobs set requires_diagnosis = true, inspection_fee_cents = 4500 where id = '{J1}';")
    check('inspection started (diagnosing) -> refused work_started', cancel(db, 'C1', J1) == {'ok': False, 'error': 'work_started', 'status': 'diagnosing'})
    # payment_snapshot is not a money signal
    setjob(db, 'en_route', extra=f"update public.jobs set payment_snapshot = '{{\"brand\":\"visa\",\"last4\":\"4242\"}}' where id = '{J1}';")
    check('payment_snapshot set (placeholder) does NOT block', cancel(db, 'C1', J1).get('ok') is True)
    setjob(db, 'en_route', extra=f"insert into public.tips(job_id, amount_cents, status) values ('{J1}', 0, 'not_added');")
    check('tips row with status not_added does NOT block', cancel(db, 'C1', J1).get('ok') is True)


def g_one_active(db):
    print('\n## B. one_active_job_per_pro slot is freed')
    setjob(db, 'en_route')
    setjob(db, 'posted', pro=None, job=J3, cust=C2)
    out, r = q(db, 'P1', f"select count(*) from public.pro_claim_job('{J3}');", stop=False)
    check('before cancel: P1 cannot claim a second job (one active)', 'one_active_job_per_pro' in r.stderr or 'duplicate key' in r.stderr, r.stderr[-160:])
    cancel(db, 'C1', J1)
    out, r = q(db, 'P1', f"select count(*) from public.pro_claim_job('{J3}');", stop=False)
    check('after cancel: P1 claims another job', r.returncode == 0 and out == '1' and row(db, J3)['status'] == 'en_route', r.stderr[-160:])
    setjob(db, 'posted', pro=None, job=J3, cust=C2)


def g_refusals(db):
    print('\n## C. Refusals (distinct codes; row, events, live point unchanged; no signal)')
    cases = [
        ('cancelled', None, '', 'already_cancelled'),
        ('complete', P1, '', 'job_finished'),
        ('materials_declined', P1, '', 'job_finished'),
        ('inspection_completed', P1, '', 'inspection_fee_due'),
        ('diagnosing', P1, '', 'work_started'),
        ('in_progress', P1, '', 'work_started'),
        ('materials_requested', P1, '', 'materials_pending'),
        ('materials_approved', P1, '', 'materials_approved'),
        ('en_route', P1, f"insert into public.materials_requests(job_id, estimated_total_cents, status) values ('{J1}', 100, 'pending');", 'materials_pending'),
        ('arrived', P1, f"update public.jobs set materials_requested_at = now() where id = '{J1}';", 'materials_pending'),
        ('en_route', P1, f"insert into public.materials_requests(job_id, estimated_total_cents, status) values ('{J1}', 100, 'approved');", 'materials_approved'),
        ('arrived', P1, f"update public.jobs set materials_approved_cents = 500, materials_approved_at = now() where id = '{J1}';", 'materials_approved'),
        ('en_route', P1, f"update public.jobs set materials_reimbursed_cents = 1 where id = '{J1}';", 'money_involved'),
        ('en_route', P1, f"update public.jobs set tip_amount_cents = 100 where id = '{J1}';", 'money_involved'),
        ('arrived', P1, f"insert into public.tips(job_id, amount_cents, status) values ('{J1}', 100, 'processing');", 'money_involved'),
        ('arrived', P1, f"insert into public.materials_receipts(job_id, actual_total_cents, receipt_photo_url, submitted_by) values ('{J1}', 1, 'x', '{P1}');", 'money_involved'),
        ('en_route', P1, f"insert into public.earnings_statements(job_id, pro_id, financial_snapshot) values ('{J1}', '{P1}', '{{}}');", 'money_involved'),
        ('en_route', None, '', 'not_allowed_status'),
        ('arrived', None, '', 'not_allowed_status'),
        ('posted', P1, '', 'not_allowed_status'),
    ]
    if 'materials_request_seq' in must(db, "select string_agg(attname, ',') from pg_attribute where attrelid = 'public.jobs'::regclass;"):
        cases.append(('arrived', P1, f"update public.jobs set materials_request_seq = 1, materials_decided_seq = 0 where id = '{J1}';", 'materials_pending'))
    cols = must(db, "select string_agg(attname, ',') from pg_attribute where attrelid = 'public.jobs'::regclass and not attisdropped;").strip().split(',')
    skipped = [c for c in cases if 'materials_approved_cents' in c[2] and 'materials_approved_cents' not in cols]
    if skipped:
        print(f'   (no 0025 columns on this stack: {len(skipped)} materials_approved_cents case skipped)')
    for st, pro, extra, want in cases:
        if (st, pro, extra, want) in skipped:
            continue
        setjob(db, st, pro=pro, extra=extra)
        if st == 'en_route' and pro:
            add_point(db)
        before, ev, pts = row(db), events(db), points(db)
        rc, err, msgs = b.run_and_collect(db, b.as_actor('C1') + f"select public.customer_cancel_job('{J1}');\n")
        res = cancel(db, 'C1', J1)
        tag = f"{st}{' no Pro' if pro is None else ''}{' + ' + extra.split(' ')[1 if extra.startswith('update') else 2] if extra else ''}"
        check(f'{tag} -> {want}', res == {'ok': False, 'error': want, 'status': st}, res)
        check(f'{tag}: row/events/point unchanged, no signal', row(db) == before and events(db) == ev and points(db) == pts and msgs == [], msgs)


def g_not_found(db):
    print('\n## D. Ownership: identical not_found; auth; roles')
    setjob(db, 'en_route')
    nf = {'ok': False, 'error': 'not_found'}
    for who in ('C2', 'P1', 'P2', 'P3'):
        check(f'{who} cancel C1\'s job -> not_found, unchanged', cancel(db, who, J1) == nf and row(db)['status'] == 'en_route')
    check('missing id -> not_found', cancel(db, 'C1', 'e0380000-0000-4000-8000-000000000000') == nf)
    check('null id -> not_found', cancel(db, 'C1', None) == nf)
    check('no sub -> not_authenticated', cancel(db, 'nosub', J1) == {'ok': False, 'error': 'not_authenticated'})
    for who in ('anon', 'service_role'):
        out, r = q(db, who, f"select public.customer_cancel_job('{J1}');", stop=False)
        check(f'{who} cannot EXECUTE customer_cancel_job', 'permission denied' in r.stderr, r.stderr[-120:])
    check('row still en_route with P1', row(db)['status'] == 'en_route' and row(db)['pro_id'] == P1)


def g_client_paths(db, before_policies):
    print('\n## E. No new client UPDATE path')
    setjob(db, 'en_route')
    for sql, label in ((f"update public.jobs set status = 'cancelled' where id = '{J1}' returning 1;", 'PATCH en_route -> cancelled'),
                       (f"update public.jobs set status = 'cancelled', pro_id = null where id = '{J1}' returning 1;", 'PATCH cancelled + pro_id null'),
                       (f"update public.jobs set pro_id = null where id = '{J1}' returning 1;", 'PATCH pro_id null')):
        out, r = q(db, 'C1', sql, stop=False)
        check(f'Customer direct {label}: refused or 0 rows; row unchanged', out != '1' and row(db)['status'] == 'en_route' and row(db)['pro_id'] == P1, r.stderr[-120:])
    out, r = q(db, 'C1', f"insert into public.job_status_events(job_id, to_status, actor_role, actor_id) values ('{J1}', 'cancelled', 'customer', '{C1}') returning 1;", stop=False)
    check('Customer cannot write job_status_events directly', out != '1', r.stderr[-120:])
    after = must(db, "select string_agg(policyname || ':' || cmd, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'jobs';").strip()
    check('jobs policies identical before/after 0038', after == before_policies)
    setjob(db, 'posted', pro=None)
    out, r = q(db, 'C1', f"update public.jobs set status = 'cancelled', cancelled_at = now() where id = '{J1}' returning 1;", stop=False)
    check('existing 0010 posted PATCH cancel still works (unchanged)', out == '1' and row(db)['status'] == 'cancelled', r.stderr[-120:])
    out = must(db, "select p.prosecdef::text || array_to_string(p.proconfig, ';') from pg_proc p where p.oid = 'public.customer_cancel_job(uuid)'::regprocedure;").strip()
    check('SECURITY DEFINER + pinned search_path', out == 'truesearch_path=pg_catalog, public, pg_temp', out)


def g_races(db):
    print('\n## F. Races (two real sessions)')

    def bg(sql):
        p = subprocess.Popen(b.PSQL + ['-d', db], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        p.stdin.write(sql); p.stdin.close()
        return p

    def fin(p):
        p.wait(timeout=30)
        return p.stdout.read(), p.stderr.read()
    setjob(db, 'en_route')
    a = bg('begin;\n' + b.as_actor('P1') + f"update public.jobs set status = 'arrived' where id = '{J1}';\nselect pg_sleep(1.5);\ncommit;\n")
    time.sleep(0.5)
    res = cancel(db, 'C1', J1)
    ao, ae = fin(a)
    check('cancel waits for a concurrent Arrived, then cancels from arrived', res.get('ok') is True and res.get('from_status') == 'arrived' and 'ERROR' not in ae, [res, ae[-120:]])
    check('...events: exactly one customer row from arrived', [e for e in events(db) if e['role'] == 'customer'] == [{'from': 'arrived', 'to': 'cancelled', 'role': 'customer', 'actor': C1}], events(db))
    setjob(db, 'en_route')
    c = bg('begin;\n' + b.as_actor('C1') + f"select public.customer_cancel_job('{J1}');\nselect pg_sleep(1.5);\ncommit;\n")
    time.sleep(0.5)
    out, r = q(db, 'P1', f"update public.jobs set status = 'arrived' where id = '{J1}' returning 1;", stop=False)
    fin(c)
    check('Arrived after a concurrent cancel commits: 0 rows, job stays cancelled', out != '1' and row(db)['status'] == 'cancelled', r.stderr[-120:])
    setjob(db, 'en_route')
    ps = [bg('begin;\n' + b.as_actor('C1') + f"select public.customer_cancel_job('{J1}');\ncommit;\n") for _ in range(8)]
    outs = [fin(p)[0] for p in ps]
    oks = sum('"ok": true' in o for o in outs)
    already = sum('already_cancelled' in o for o in outs)
    check('8 parallel cancels: exactly 1 ok, 7 already_cancelled, 1 event', oks == 1 and already == 7 and len(events(db)) == 1, [oks, already, len(events(db))])
    setjob(db, 'posted', pro=None)
    cl = bg('begin;\n' + b.as_actor('P1') + f"select count(*) from public.pro_claim_job('{J1}');\nselect pg_sleep(1.5);\ncommit;\n")
    time.sleep(0.5)
    res = cancel(db, 'C1', J1)
    fin(cl)
    check('claim vs cancel: cancel waits, sees en_route + Pro, cancels and releases', res.get('from_status') == 'en_route' and res.get('pro_released') is True and row(db)['pro_id'] is None, res)


def g_with_0037(prefix):
    print('\n## G. With 0037 (live-location sessions) applied')
    if not F37:
        print('(skipped: HAVEN_0037_FILE not set)')
        return
    db = f'{prefix}_s37'
    build(db, with_0037=True)
    setjob(db, 'en_route')
    out, _ = q(db, 'P1', f"select public.pro_start_live_location('{J1}')->>'session_id';")
    sid = out
    out, _ = q(db, 'P1', f"select public.pro_update_live_location('{J1}', '{sid}', 27.111111, -80.222222, now())->>'ok';")
    check('0037: session + point exist before cancel', out == 'true' and points(db) == 1)
    res = cancel(db, 'C1', J1)
    n = must(db, f"select count(*) from public.job_live_sessions where job_id = '{J1}';").strip()
    check('0037: cancel ends the session and wipes the point', res.get('ok') is True and n == '0' and points(db) == 0, [res, n])
    out, _ = q(db, 'P1', f"select public.pro_update_live_location('{J1}', '{sid}', 27.111111, -80.222222, now())->>'error';")
    check('0037: late write from the old session refused, no point', out in ('not_found', 'session_stopped') and points(db) == 0, out)
    psql('postgres', f'drop database if exists {db};')


def g_fcc(prefix):
    print('\n## H. Founder Control Center 0034/0035/0035a with 0038')
    db = f'{prefix}_fcc'
    build(db, with_0038=False)
    b.fcc_apply(db)
    apply_0038(db)
    check('0035 baseline_mismatches() still clean', must(db, "select coalesce(haven_admin.baseline_mismatches(), 'clean');").strip() == 'clean')
    setjob(db, 'en_route')
    res = cancel(db, 'C1', J1)
    check('customer cancel works next to 0035a (actor_role includes admin)', res.get('ok') is True and events(db)[-1]['role'] == 'customer', res)
    out = must(db, 'begin;\n' + b.as_founder() + f"select public.admin_cancel_job_preview('{J1}')->>'error';\n" + b.OWNER + 'rollback;\n').strip().splitlines()[-1]
    check('admin cancel preview after customer cancel -> already_cancelled', out == 'already_cancelled', out)
    setjob(db, 'en_route')
    must(db, 'begin;\n' + b.admin_op('cancel', J1, 'en_route') + 'commit;\n')
    check('after an admin cancel, customer cancel -> already_cancelled', cancel(db, 'C1', J1) == {'ok': False, 'error': 'already_cancelled', 'status': 'cancelled'})
    psql('postgres', f'drop database if exists {db};')


def g_guards_rerun(prefix):
    print('\n## I. Guards, re-run, CRLF, rollback')
    db = f'{prefix}_g'
    build(db, with_0038=False)
    r = apply_0038(db, text=b.crlf(open(F38).read()))
    check('CRLF paste applies', r.returncode == 0, r.stderr[-200:])
    check('re-run is a no-op', apply_0038(db).returncode == 0)
    r = psql(db, f'set role {O};\n' + open(R38).read())
    check('rollback drops the function', r.returncode == 0 and must(db, "select to_regprocedure('public.customer_cancel_job(uuid)') is null;").strip() == 't')
    check('re-apply after rollback', apply_0038(db).returncode == 0)
    must(db, f"set role {O};\ncreate or replace function public.customer_cancel_job(p_job_id uuid) returns jsonb language sql security definer as $f$ select '{{}}'::jsonb $f$;")
    r = apply_0038(db, expect_ok=False)
    check('guard refuses a different existing customer_cancel_job', r.returncode != 0 and 'another body' in r.stderr, r.stderr[-160:])
    psql('postgres', f'drop database if exists {db};')
    db = f'{prefix}_g2'
    build(db, with_0038=False)
    must(db, "alter table public.job_status_events drop constraint job_status_events_actor_role_check;"
             "alter table public.job_status_events add constraint job_status_events_actor_role_check check (actor_role in ('pro','system'));")
    r = apply_0038(db, expect_ok=False)
    check('guard refuses when actor_role check lacks customer', r.returncode != 0 and 'Nothing was changed' in r.stderr, r.stderr[-160:])
    r = apply_0038(db, role='codey0036_nobypass', expect_ok=False)
    check('guard refuses a role without BYPASSRLS', r.returncode != 0 and 'Nothing was changed' in r.stderr, r.stderr[-160:])
    psql('postgres', f'drop database if exists {db};')


def g_checks(prefix):
    print('\n## J. 0038a / 0038b read-only checks')
    db = f'{prefix}_chk'
    build(db, with_0038=False)

    def run(path, text=None):
        r = psql(db, f'set role {O};\nbegin read only;\n' + (text or open(path).read()) + 'rollback;\n')
        rows = [l.split('|') for l in r.stdout.strip().splitlines() if '|' in l]
        return r.returncode, rows
    rc, rows = run(CHK_A)
    check('0038a before: READY (7 of 7)', rc == 0 and rows[0][1] == 'READY (7 of 7)', rows[:1])
    rc, rows = run(CHK_B)
    check('0038b before: NOT LIVE', rc == 0 and rows[0][1].startswith('NOT LIVE'), rows[:1])
    apply_0038(db)
    rc, rows = run(CHK_A)
    check('0038a after: READY: already applied (7 of 7)', rows[0][1] == 'READY: already applied (7 of 7)', rows[:1])
    rc, rows = run(CHK_B)
    check('0038b after: LIVE (6 of 6)', rows[0][1] == 'LIVE (6 of 6)', rows)
    rc, rows = run(CHK_B, b.crlf(open(CHK_B).read()))
    check('0038b CRLF copy reads the same', rows[0][1] == 'LIVE (6 of 6)')
    must(db, 'grant execute on function public.customer_cancel_job(uuid) to anon;')
    rc, rows = run(CHK_B)
    check('0038b catches an anon grant', rows[0][1].startswith('NOT LIVE'))
    for path in (CHK_A, CHK_B):
        t = open(path).read().lower()
        body = re.sub(r"'(?:[^']|'')*'", "''", re.sub(r'--[^\n]*', '', t))
        check(f'{os.path.basename(path)} is one read-only SELECT', not re.search(r'\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b', body))
    psql('postgres', f'drop database if exists {db};')


def main():
    print(f'0038 under test: {F38} sha256 {b.sha(F38)}' + (f' | with 0037 {F37} sha256 {b.sha(F37)}' if F37 else ''))
    main_db = f'{PREFIX}_main'
    try:
        build(main_db, with_0038=False)
        before = must(main_db, "select string_agg(policyname || ':' || cmd, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'jobs';").strip()
        apply_0038(main_db)
        g_allowed(main_db)
        g_one_active(main_db)
        g_refusals(main_db)
        g_not_found(main_db)
        g_client_paths(main_db, before)
        g_races(main_db)
        if not QUICK:
            g_with_0037(PREFIX)
            g_fcc(PREFIX)
            g_guards_rerun(PREFIX)
            g_checks(PREFIX)
            lean = f'{PREFIX}_lean'
            build(lean, drafts=False)
            g_allowed(lean)
            g_refusals(lean)
    finally:
        out = must('postgres', f"select string_agg(datname, ' ') from pg_database where datname like '{PREFIX}%';").strip()
        for d in out.split():
            psql('postgres', f'drop database if exists {d};')
    n, ok = len(b.RESULTS), sum(b.RESULTS)
    print(f'\nRESULT {ok}/{n} passed')
    sys.exit(0 if n and ok == n else 1)


if __name__ == '__main__':
    main()
