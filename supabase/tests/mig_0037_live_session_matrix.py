#!/usr/bin/env python3
"""MIG-0037 local matrix: live-location sessions + immediate stop.

LOCAL ONLY: throwaway Postgres 17 (default -h /tmp -p 54329), databases named HAVEN_DB_PREFIX_*,
all dropped at the end. Never point HAVEN_PG at Supabase. Coordinates are synthetic and never printed.
Builds on the 0036 harness (same base: master 0001-0025, 0027, 0030, 0032 (+0026/0028/0029/0031 drafts),
the real Supabase realtime schema, Supabase's auth.uid()), applies 0036, then 0037 as the owner stand-in.
Env: HAVEN_DEPS (dir with 0026-0032 + Hub 0034/0035/0035a), HAVEN_0037 (file under test), HAVEN_QUICK.
"""
import json, os, re, subprocess, sys, time, threading
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault('HAVEN_DB_PREFIX', 'codey0037_%d' % os.getpid())
import mig_0036_realtime_signal_matrix as b   # noqa: E402

ROOT = b.ROOT
F37 = os.environ.get('HAVEN_0037') or os.path.join(ROOT, 'migrations', '0037_live_location_session.sql')
R37 = os.path.join(ROOT, 'rollback', '0037_live_location_session_rollback.sql')
CHK_A = os.path.join(ROOT, 'checks', '0037a_check_before_READ_ONLY.sql')
CHK_B = os.path.join(ROOT, 'checks', '0037b_check_after_READ_ONLY.sql')
PREFIX = os.environ['HAVEN_DB_PREFIX']
QUICK = b.QUICK
O = b.OWNER_ROLE
C1, P1, C2, P2, P3, J1, J2, J3 = b.C1, b.P1, b.C2, b.P2, b.P3, b.J1, b.J2, b.J3
check, must, psql = b.check, b.must, b.psql
PT = ('27.111111', '-80.222222')

OWN_0032 = f"""
-- Supabase gives every object the postgres role creates in public to anon/authenticated/service_role
-- (default privileges); emulate that for the owner stand-in so the 0037 revokes are really tested.
alter default privileges for role {O} in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role {O} in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role {O} in schema public grant all on sequences to anon, authenticated, service_role;
alter table public.job_live_locations owner to {O};
alter function public.pro_update_live_location(uuid,double precision,double precision,timestamptz) owner to {O};
alter function public.get_job_live_location(uuid) owner to {O};
alter function public.jobs_discard_live_location() owner to {O};
"""


def apply_0037(db, text=None, role=O, expect_ok=True):
    body = text if text is not None else open(F37).read()
    r = psql(db, (f'set role {role};\n' if role else '') + body)
    if expect_ok and r.returncode:
        raise SystemExit(f'0037 failed on {db}:\n{b.redact(r.stderr)[-2000:]}')
    return r


def build(db, with_0037=True, drafts=True, realtime=True):
    b.build(db, realtime=realtime, drafts=drafts, with_0036=realtime)
    if realtime:
        must(db, OWN_0032)
    if with_0037:
        apply_0037(db, role=O if realtime else None)


def q(db, who, sql, stop=True):
    """Run one statement as an actor in a committed transaction; return last stdout line (or stderr)."""
    pre = 'begin;\n' + (b.as_actor(who) if who != 'owner' else b.OWNER)
    r = psql(db, pre + sql + '\ncommit;\n', stop=stop)
    out = [l for l in r.stdout.strip().splitlines() if l.strip()]
    return (out[-1] if out else ''), r


def start(db, who, job):
    out, r = q(db, who, f"select public.pro_start_live_location('{job}');")
    try:
        return json.loads(out)
    except Exception:
        return {'raw': out, 'err': r.stderr[-200:]}


def upd(db, who, job, sid, lat=PT[0], lng=PT[1]):
    s = 'null' if sid is None else f"'{sid}'"
    out, r = q(db, who, f"select public.pro_update_live_location('{job}', {s}::uuid, {lat}, {lng}, now());", stop=False)
    try:
        return json.loads(out)
    except Exception:
        return {'raw': out, 'err': r.stderr[-300:], 'rc': r.returncode}


def old_upd(db, who, job):
    out, r = q(db, who, f"select public.pro_update_live_location('{job}', {PT[0]}, {PT[1]}, now());", stop=False)
    try:
        return json.loads(out)
    except Exception:
        return {'raw': out, 'err': r.stderr.splitlines()[0] if r.stderr else '', 'rc': r.returncode}


def stop(db, who, job):
    j = 'null' if job is None else f"'{job}'"
    out, r = q(db, who, f"select public.pro_stop_live_location({j});")
    try:
        return json.loads(out)
    except Exception:
        return {'raw': out, 'err': r.stderr[-200:]}


def view(db, who, job):
    out, _ = q(db, who, f"select public.get_job_live_location('{job}');")
    v = json.loads(out)
    v.pop('point', None)            # never keep coordinates
    return v


def state(db, job):
    out, _ = q(db, 'owner', f"select (select count(*) from public.job_live_locations where job_id = '{job}') || ',' || "
                            f"(select count(*) from public.job_live_sessions where job_id = '{job}');")
    p, s = out.split(',')
    return int(p), int(s)


def reset(db):
    must(db, b.OWNER + "begin;\nset local session_replication_role = replica;\n"
                       f"delete from public.job_live_sessions; delete from public.job_live_locations;\n"
                       "do $x$ begin if to_regclass('public.job_live_session_stops') is not null then delete from public.job_live_session_stops; end if; end $x$;\n"
                       f"update public.jobs set status = 'en_route', pro_id = '{P1}', customer_id = '{C1}' where id = '{J1}';\ncommit;\n")


def age_point(db, job):
    must(db, f"alter table public.job_live_locations disable trigger job_live_locations_require_session;\n"
             f"update public.job_live_locations set received_at = now() - interval '10 seconds' where job_id = '{job}';\n"
             f"alter table public.job_live_locations enable trigger job_live_locations_require_session;\n")


def new_leg(db, job=J1):
    """Test shortcut for 'a new Driving to Job' on the same job: clear the 0037 stop marker.
    (In the app this happens only when the job leaves en_route or changes Pro; group S tests that path.)"""
    must(db, b.OWNER + f"delete from public.job_live_session_stops where job_id = '{job}';")


def marker(db, job=J1):
    out, _ = q(db, 'owner', f"select coalesce((select pro_id::text from public.job_live_session_stops where job_id = '{job}'), '-');")
    return out


def live(db, job=J1, who='P1'):
    """Fresh session + one accepted point."""
    s = start(db, who, job)
    u = upd(db, who, job, s.get('session_id'))
    return s.get('session_id'), u


# ───────────────────────────── groups ─────────────────────────────

def g_api(db):
    print('\n## A. start / update / stop API and error codes')
    reset(db)
    s = start(db, 'P1', J1)
    check('assigned Pro starts on en_route job -> ok + session_id', s.get('ok') is True and re.match(r'^[0-9a-f-]{36}$', s.get('session_id', '')), s)
    check('start returns no coordinates', set(s) == {'ok', 'session_id', 'started_at'}, sorted(s))
    for who in ('C1', 'C2', 'P2', 'P3'):
        check(f'{who} start on J1 -> not_found', start(db, who, J1) == {'ok': False, 'error': 'not_found'})
    check('nosub start -> not_authenticated', start(db, 'nosub', J1) == {'ok': False, 'error': 'not_authenticated'})
    check('start on missing job -> not_found', start(db, 'P1', 'e0370000-0000-4000-8000-000000000000') == {'ok': False, 'error': 'not_found'})
    check('start with null job -> not_found', q(db, 'P1', 'select public.pro_start_live_location(null);')[0] == '{"ok": false, "error": "not_found"}')
    check('start on someone else\'s posted job -> not_found', start(db, 'P1', J3) == {'ok': False, 'error': 'not_found'})
    reset(db)
    must(db, b.OWNER + f"begin; set local session_replication_role = replica; update public.jobs set status = 'arrived' where id = '{J1}'; commit;")
    check('start on own arrived job -> tracking_not_active, no session', start(db, 'P1', J1) == {'ok': False, 'error': 'tracking_not_active'} and state(db, J1) == (0, 0))
    reset(db)
    s = start(db, 'P1', J1)
    sid = s['session_id']
    u = upd(db, 'P1', J1, sid)
    check('update with current session -> ok', u.get('ok') is True, u)
    check('Customer sees the point', view(db, 'C1', J1).get('available') is True)
    check('update again within 4 s -> rate_limited', upd(db, 'P1', J1, sid).get('error') == 'rate_limited')
    check('update with null session -> session_required', upd(db, 'P1', J1, None) == {'ok': False, 'error': 'session_required'})
    check('update with unknown session -> session_stopped', upd(db, 'P1', J1, 'e0370000-0000-4000-8000-0000000000aa') == {'ok': False, 'error': 'session_stopped'})
    check('other Pro update with the real session id -> not_found', upd(db, 'P2', J1, sid) == {'ok': False, 'error': 'not_found'})
    check('Customer update -> not_found', upd(db, 'C1', J1, sid) == {'ok': False, 'error': 'not_found'})
    age_point(db, J1)
    check('invalid point still invalid_point', upd(db, 'P1', J1, sid, lat='0', lng='0') == {'ok': False, 'error': 'invalid_point'})
    check('out of range -> invalid_point', upd(db, 'P1', J1, sid, lat='91', lng='0') == {'ok': False, 'error': 'invalid_point'})
    o = old_upd(db, 'P1', J1)
    check('OLD 0032 4-arg writer -> refused: SQLSTATE P0001 session_required, nothing written',
          o.get('raw') == '' and o.get('err', '').endswith('session_required'), o)
    check('OLD writer did not refresh the point (still aged)', '"age_s"' in json.dumps(view(db, 'C1', J1)) and view(db, 'C1', J1).get('age_s', 0) >= 9)
    reset(db)
    o = old_upd(db, 'P1', J1)
    check('OLD writer with no session at all -> refused, no point', o.get('err', '').endswith('session_required') and state(db, J1) == (0, 0), o)
    # stop
    sid, _ = live(db)
    st = stop(db, 'P1', J1)
    check('stop -> {ok:true, stopped:true}', st == {'ok': True, 'stopped': True}, st)
    check('stop wiped point and session immediately', state(db, J1) == (0, 0))
    check('Customer view right after stop -> waiting (no point)', view(db, 'C1', J1) == {'ok': True, 'available': False, 'reason': 'waiting'})
    check('delayed write with the pre-stop session -> session_stopped, no point',
          upd(db, 'P1', J1, sid) == {'ok': False, 'error': 'session_stopped'} and state(db, J1) == (0, 0))
    check('old writer after stop -> refused, no point', old_upd(db, 'P1', J1).get('err', '').endswith('session_required') and state(db, J1) == (0, 0))
    check('stop again (idempotent) -> {ok:true, stopped:false}', stop(db, 'P1', J1) == {'ok': True, 'stopped': False})
    for who in ('C1', 'C2', 'P2', 'P3'):
        check(f'{who} stop on J1 -> not_found', stop(db, who, J1) == {'ok': False, 'error': 'not_found'})
    check('stop on missing job -> not_found', stop(db, 'P1', 'e0370000-0000-4000-8000-000000000000') == {'ok': False, 'error': 'not_found'})
    check('nosub stop -> not_authenticated', stop(db, 'nosub', J1) == {'ok': False, 'error': 'not_authenticated'})
    new_leg(db)
    sid, _ = live(db)
    check('P3 stop(null) touches nothing of P1', stop(db, 'P3', None) == {'ok': True, 'stopped': False} and state(db, J1) == (1, 1))
    check('C1 stop on J1 leaves the point', state(db, J1) == (1, 1) and stop(db, 'C1', J1).get('error') == 'not_found' and state(db, J1) == (1, 1))
    check('P1 stop(null) (sign-out) -> stopped:true, wiped', stop(db, 'P1', None) == {'ok': True, 'stopped': True} and state(db, J1) == (0, 0))
    # founder rule 2026-11-12: a stop is final for this en_route leg; supersede / token refresh
    new_leg(db)
    s1, _ = live(db)
    stop(db, 'P1', J1)
    check('start after a deliberate stop on the same leg -> session_stopped, nothing created',
          start(db, 'P1', J1) == {'ok': False, 'error': 'session_stopped'} and state(db, J1) == (0, 0))
    check('old session still refused after the stop', upd(db, 'P1', J1, s1) == {'ok': False, 'error': 'session_stopped'})
    new_leg(db)
    s2 = start(db, 'P1', J1)['session_id']
    check('new leg = new session id', s2 != s1)
    check('new session accepted', upd(db, 'P1', J1, s2).get('ok') is True)
    s3 = start(db, 'P1', J1)['session_id']
    age_point(db, J1)
    check('second start (other device) supersedes the first', upd(db, 'P1', J1, s2) == {'ok': False, 'error': 'session_stopped'}
          and upd(db, 'P1', J1, s3).get('ok') is True)
    stop(db, 'P1', J1)
    cl = {'sub': P1, 'role': 'authenticated', 'iat': int(time.time()) + 60, 'exp': int(time.time()) + 3600, 'session_id': 'refreshed'}
    body = (f"begin;\nset local role authenticated;\nselect set_config('request.jwt.claims', $c${json.dumps(cl)}$c$, true) \\g /dev/null\n"
            f"select set_config('request.jwt.claim.sub', '{P1}', true) \\g /dev/null\n"
            f"select public.pro_update_live_location('{J1}', '{s3}'::uuid, {PT[0]}, {PT[1]}, now());\ncommit;\n")
    r = psql(db, body)
    check('token refresh (new iat/session) + stopped session -> session_stopped, no point',
          '"session_stopped"' in r.stdout and state(db, J1) == (0, 0), r.stdout[-120:])
    # guard itself (owner level, defence in depth): a wrong session id in the GUC is refused
    reset(db)
    s4 = start(db, 'P1', J1)['session_id']
    r = psql(db, b.OWNER + f"begin;\nselect set_config('haven.live_session_id', gen_random_uuid()::text, true) \\g /dev/null\n"
                           f"insert into public.job_live_locations values ('{J1}', '{P1}', {PT[0]}, {PT[1]}, now(), null);\ncommit;\n")
    check('guard: even the owner cannot write a point with a wrong session id', 'session_required' in r.stderr and state(db, J1) == (0, 1), r.stderr[-120:])
    r = psql(db, b.OWNER + f"begin;\nselect set_config('haven.live_session_id', '{s4}', true) \\g /dev/null\n"
                           f"insert into public.job_live_locations values ('{J1}', '{P2}', {PT[0]}, {PT[1]}, now(), null);\ncommit;\n")
    check('guard: right session id but another Pro -> refused', 'session_required' in r.stderr and state(db, J1) == (0, 1), r.stderr[-120:])
    # stop deletes only the caller's own point
    must(db, "begin;\nset local session_replication_role = replica;\n"
             f"insert into public.job_live_locations values ('{J1}', '{P2}', {PT[0]}, {PT[1]}, now(), null);\ncommit;\n")
    stop(db, 'P1', J1)
    check("stop removes only the caller's rows (a foreign-Pro row is left for the 0032 rules)", state(db, J1) == (1, 0))
    reset(db)
    check('stop never needs coordinates; result has no coordinates', all(k in ('ok', 'stopped', 'error') for k in stop(db, 'P1', J1)))


def g_stopfinal(db):
    print('\n## S. Founder rule 2026-11-12: a deliberate stop is final for the en_route leg; blips recover')
    F1 = 'e0370000-0000-4000-8000-0000000000f1'

    def bgrun(sql):
        return subprocess.Popen(b.PSQL + ['-d', db, '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True), sql

    def go(pair):
        p, sql = pair
        p.stdin.write(sql); p.stdin.close()
        return p

    reset(db)
    s1, _ = live(db)
    check('S1 stop -> marker for (J1, P1)', stop(db, 'P1', J1) == {'ok': True, 'stopped': True} and marker(db) == P1)
    check('S1 start after stop (e.g. a relaunch that calls start) -> session_stopped, nothing created',
          start(db, 'P1', J1) == {'ok': False, 'error': 'session_stopped'} and state(db, J1) == (0, 0))
    cl = {'sub': P1, 'role': 'authenticated', 'iat': int(time.time()) + 120, 'exp': int(time.time()) + 3600, 'session_id': 'fresh-sign-in'}
    r = psql(db, f"begin;\nset local role authenticated;\nselect set_config('request.jwt.claims', $c${json.dumps(cl)}$c$, true) \\g /dev/null\n"
                 f"select set_config('request.jwt.claim.sub', '{P1}', true) \\g /dev/null\n"
                 f"select public.pro_start_live_location('{J1}');\ncommit;\n")
    check('S2 sign-in again / token refresh (new iat) + start -> session_stopped', '"session_stopped"' in r.stdout and state(db, J1) == (0, 0), r.stdout[-120:])
    check('S3 reopen with the stored pre-stop session id -> session_stopped, no point',
          upd(db, 'P1', J1, s1) == {'ok': False, 'error': 'session_stopped'} and state(db, J1) == (0, 0))
    check('S3 repeated stops keep the marker (idempotent)', stop(db, 'P1', J1) == {'ok': True, 'stopped': False} and marker(db) == P1)
    # blips / app kill without stop: the same session keeps working
    reset(db)
    sid, u = live(db)
    age_point(db, J1)
    u2 = upd(db, 'P1', J1, sid)
    check('S4 blip: a later write with the same session (new connection) -> ok, same session', u.get('ok') is True and u2.get('ok') is True and state(db, J1) == (1, 1))
    age_point(db, J1)
    check('S4 app killed (no stop) then relaunched with the stored session id -> ok', upd(db, 'P1', J1, sid).get('ok') is True and marker(db) == '-')
    s5 = start(db, 'P1', J1).get('session_id')
    age_point(db, J1)
    check('S4 relaunch without a stored id but no stop: start -> new session; the old id is refused (one writer)',
          s5 and s5 != sid and upd(db, 'P1', J1, sid) == {'ok': False, 'error': 'session_stopped'} and upd(db, 'P1', J1, s5).get('ok') is True)
    # sign-out marks the caller's en_route job even if sharing was never started on it
    reset(db)
    check('S5 sign-out stop(null) with no session yet -> ok, stopped:false', stop(db, 'P1', None) == {'ok': True, 'stopped': False})
    check('S5 sign-out still marks the en_route job (never started)', marker(db, J1) == P1)
    check('S5 after sign-in again: start -> session_stopped', start(db, 'P1', J1).get('error') == 'session_stopped' and state(db, J1) == (0, 0))
    must(db, b.OWNER + "begin;\n" + b.job_insert(F1, C2, P3, 'en_route') + "commit;\n")
    live(db, F1, 'P3')
    stop(db, 'P3', F1)
    m1 = marker(db, F1)
    q(db, 'owner', f"delete from public.jobs where id = '{F1}';")
    check('S13 job DELETE cascades the marker', m1 == P3 and marker(db, F1) == '-')
    # a new Driving to Job (release + claim again) clears the marker
    q(db, 'owner', f"update public.jobs set status = 'posted', pro_id = null, accepted_at = null where id = '{J1}';")
    check('S6 release (leaves en_route) clears the marker', marker(db) == '-')
    out, r = q(db, 'P1', f"select count(*) from public.pro_claim_job('{J1}');", stop=False)
    s6 = start(db, 'P1', J1)
    check('S6 claim again (Driving to Job) -> start ok, new session', r.returncode == 0 and s6.get('ok') is True, (r.stderr[-160:], s6))
    # Pro change while en_route clears the old Pro's marker; the new Pro can start
    reset(db)
    live(db)
    stop(db, 'P1', J1)
    q(db, 'owner', f"update public.jobs set pro_id = '{P2}' where id = '{J1}';")
    check('S7 reassignment P1 -> P2 clears the marker; P2 start ok', marker(db) == '-' and start(db, 'P2', J1).get('ok') is True)
    reset(db)
    live(db)
    stop(db, 'P1', J1)
    out, r = q(db, 'P1', f"update public.jobs set status = 'arrived' where id = '{J1}';\nselect 'done';", stop=False)
    check('S14 Arrived (leaves en_route) clears the marker', out == 'done' and marker(db) == '-', r.stderr[-160:])
    # stop off en_route never leaves a marker
    reset(db)
    must(db, b.OWNER + f"begin; set local session_replication_role = replica; update public.jobs set status = 'arrived' where id = '{J1}'; commit;")
    check('S8 stop on own arrived job -> ok, no marker', stop(db, 'P1', J1).get('ok') is True and marker(db) == '-')
    reset(db)
    live(db)
    check('S9 other parties cannot stop (or mark) J1',
          all(stop(db, w, J1) == {'ok': False, 'error': 'not_found'} for w in ('C1', 'P2', 'C2')) and marker(db) == '-' and state(db, J1) == (1, 1))
    for w in ('P1', 'C1'):
        _, r = q(db, w, 'select count(*) from public.job_live_session_stops;', stop=False)
        check(f'S10 {w} cannot read job_live_session_stops (permission denied)', 'permission denied' in r.stderr, r.stderr[-120:])
    # races: start and stop serialise on the jobs row
    reset(db)
    live(db)
    p = go(bgrun('begin;\n' + b.as_actor('P1') + f"select public.pro_stop_live_location('{J1}');\nselect pg_sleep(2);\ncommit;\n"))
    time.sleep(0.6)
    t0 = time.time()
    st = start(db, 'P1', J1)
    dt = time.time() - t0
    p.wait(timeout=20)
    check('S11 start in flight during a stop waits, then is refused (LOW-3 closed)', dt > 1.0 and st == {'ok': False, 'error': 'session_stopped'}
          and state(db, J1) == (0, 0) and marker(db) == P1, (f'{dt:.1f}s', st))
    reset(db)
    p = go(bgrun('begin;\n' + b.as_actor('P1') + f"select public.pro_start_live_location('{J1}');\nselect pg_sleep(2);\ncommit;\n"))
    time.sleep(0.6)
    t0 = time.time()
    st = stop(db, 'P1', J1)
    dt = time.time() - t0
    p.wait(timeout=20); po = p.stdout.read()
    check('S12 stop during an uncommitted start waits, then removes that session (no session survives)',
          dt > 1.0 and '"ok": true' in po and st == {'ok': True, 'stopped': True} and state(db, J1) == (0, 0) and marker(db) == P1, (f'{dt:.1f}s', st))
    reset(db)
    p = go(bgrun('begin;\n' + b.as_actor('P1') + f"select public.pro_start_live_location('{J1}');\nselect pg_sleep(2);\ncommit;\n"))
    time.sleep(0.6)
    t0 = time.time()
    st = stop(db, 'P1', None)
    dt = time.time() - t0
    p.wait(timeout=20)
    check('S15 sign-out during an uncommitted first start waits, then removes that session',
          dt > 1.0 and st.get('ok') is True and state(db, J1) == (0, 0) and marker(db) == P1, (f'{dt:.1f}s', st, state(db, J1)))
    reset(db)


def resume(db, who, job):
    out, r = q(db, who, f"select public.pro_resume_live_location('{job}');", stop=False)
    try:
        return json.loads(out)
    except Exception:
        return {'raw': out, 'err': r.stderr[-200:]}


def backdate(db, job=J1, start_min=None, point_min=None):
    """Owner-side test shortcut: age the session start and/or the stored point (triggers off for this txn)."""
    sql = b.OWNER + "begin;\nset local session_replication_role = replica;\n"
    if start_min is not None:
        sql += f"update public.job_live_sessions set started_at = now() - interval '{start_min} minutes' where job_id = '{job}';\n"
    if point_min is not None:
        sql += f"update public.job_live_locations set received_at = now() - interval '{point_min} minutes' where job_id = '{job}';\n"
    must(db, sql + "commit;\n")


def g_t675(db):
    print('\n## T. Founder decisions t675u (Quagon scenarios): stored-session persistence, explicit resume, expiry')
    STOPPED = {'ok': False, 'error': 'session_stopped'}
    EXPIRED = {'ok': False, 'error': 'session_stopped', 'reason': 'expired'}
    # T01 in-flight write vs stop: the stop waits for the writer, then wipes its point; nothing survives
    reset(db)
    sid, _ = live(db)
    age_point(db, J1)
    w = subprocess.Popen(b.PSQL + ['-d', db, '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True)
    w.stdin.write('begin;\n' + b.as_actor('P1') + f"select public.pro_update_live_location('{J1}', '{sid}'::uuid, {PT[0]}, {PT[1]}, now());\n"
                  "select pg_sleep(1.5);\ncommit;\n")
    w.stdin.close()
    time.sleep(0.5)
    st = stop(db, 'P1', J1)
    w.wait(timeout=30)
    wout = w.stdout.read()
    check('T01 in-flight write vs stop: write ok, stop waits then wipes -> no session, no point, later write refused',
          '"ok": true' in wout and st.get('ok') is True and state(db, J1) == (0, 0) and upd(db, 'P1', J1, sid) == STOPPED, [st, state(db, J1)])
    # T02 kill + relaunch with a stored valid session keeps working (no start, no new session)
    reset(db)
    sid, _ = live(db)
    age_point(db, J1)
    u = upd(db, 'P1', J1, sid)
    check('T02 kill + relaunch: stored session id keeps working, same session, no new one', u.get('ok') is True and state(db, J1) == (1, 1)
          and q(db, 'owner', f"select session_id from public.job_live_sessions where job_id = '{J1}';")[0] == sid)
    # T03 restoring a valid stored session after a long gap that is still inside the idle limit
    backdate(db, start_min=120, point_min=29)
    check('T03 restore a stored session 29 min after its last point (started 2 h ago) -> ok (idle counts from the last point)',
          upd(db, 'P1', J1, sid).get('ok') is True and state(db, J1) == (1, 1))
    # T04 a stopped session is refused everywhere; the automatic start cannot revive it
    stop(db, 'P1', J1)
    check('T04 stopped session: stored id -> session_stopped, nothing written', upd(db, 'P1', J1, sid) == STOPPED and state(db, J1) == (0, 0))
    check('T04 stopped session: automatic start (launch / sign-in / refresh / permission back) -> session_stopped',
          start(db, 'P1', J1) == STOPPED and state(db, J1) == (0, 0) and marker(db) == P1)
    # T05 revoke + explicit resume: new id; the old id stays dead
    r1 = resume(db, 'P1', J1)
    s2 = r1.get('session_id')
    check('T05 resume tap after a revoke/stop -> ok, NEW session id, marker cleared',
          r1.get('ok') is True and s2 and s2 != sid and 'started_at' in r1 and marker(db) == '-' and state(db, J1) == (0, 1), r1)
    check('T05 the old (stopped) id stays dead after resume', upd(db, 'P1', J1, sid) == STOPPED and state(db, J1) == (0, 1))
    check('T05 the resumed id writes', upd(db, 'P1', J1, s2).get('ok') is True and state(db, J1) == (1, 1))
    s3 = start(db, 'P1', J1).get('session_id')
    check('T05 after a resume the leg is normal again (a Driving to Job retry may start)', bool(s3) and s3 != s2)
    # T06 resume while a session is active rotates it (one writer)
    age_point(db, J1)
    r2 = resume(db, 'P1', J1)
    check('T06 resume while active -> new id; the previous id is refused', r2.get('ok') is True and r2.get('session_id') not in (s3, None)
          and upd(db, 'P1', J1, s3) == STOPPED, r2)
    # T07 sign-out, then sign-in: no automatic restart; only resume
    reset(db)
    sid, _ = live(db)
    check('T07 sign-out stop(null) -> session + point gone, marker written', stop(db, 'P1', None).get('ok') is True and state(db, J1) == (0, 0) and marker(db) == P1)
    check('T07 after sign-in: stored id refused, automatic start refused', upd(db, 'P1', J1, sid) == STOPPED and start(db, 'P1', J1) == STOPPED)
    r3 = resume(db, 'P1', J1)
    check('T07 after sign-in the resume tap -> new session that writes', r3.get('ok') is True and r3['session_id'] != sid
          and upd(db, 'P1', J1, r3['session_id']).get('ok') is True)
    # T08 account switch: Pro B can never use Pro A's session, even with the id
    reset(db)
    sid, _ = live(db)
    age_point(db, J1)
    check('T08 account switch: P2 with P1\'s session id -> not_found, nothing written',
          upd(db, 'P2', J1, sid) == {'ok': False, 'error': 'not_found'} and state(db, J1) == (1, 1))
    check('T08 account switch: P2 resume / start / stop on P1\'s job -> not_found',
          resume(db, 'P2', J1) == {'ok': False, 'error': 'not_found'} and start(db, 'P2', J1) == {'ok': False, 'error': 'not_found'}
          and stop(db, 'P2', J1) == {'ok': False, 'error': 'not_found'} and state(db, J1) == (1, 1))
    check('T08 C1 (the Customer) resume -> not_found', resume(db, 'C1', J1) == {'ok': False, 'error': 'not_found'})
    check('T08 P1 session intact after the attempts', upd(db, 'P1', J1, sid).get('ok') is True)
    # T09 cancel, T10 Arrived, T11 reassignment: the server ends the session; no resume
    for label, sql, who_after, res_expect in (
        ('T09 cancel', f"update public.jobs set status = 'cancelled' where id = '{J1}';", 'P1', 'tracking_not_active'),
        ('T10 Arrived', None, 'P1', 'tracking_not_active'),
        ('T11 reassignment P1 -> P2', f"update public.jobs set pro_id = '{P2}' where id = '{J1}';", 'P1', 'not_found')):
        reset(db)
        sid, _ = live(db)
        if sql is None:
            q(db, 'P1', f"update public.jobs set status = 'arrived' where id = '{J1}';")
        else:
            must(db, b.OWNER + sql)
        check(f'{label}: session + point ended by the server', state(db, J1) == (0, 0))
        check(f'{label}: resume by the old Pro -> {res_expect}', resume(db, who_after, J1) == {'ok': False, 'error': res_expect})
        check(f'{label}: the stored id -> refused', upd(db, 'P1', J1, sid).get('ok') is False and state(db, J1) == (0, 0))
    check('T11 reassignment: the new Pro cannot use the old Pro\'s id (session ended)', upd(db, 'P2', J1, sid) == STOPPED and state(db, J1) == (0, 0))
    s4 = start(db, 'P2', J1)
    check('T11 reassignment: the new Pro\'s own Driving to Job starts a fresh session', s4.get('ok') is True and s4['session_id'] != sid)
    # T12-T14 expiry (30 min without an accepted write)
    reset(db)
    s5 = start(db, 'P1', J1)['session_id']
    backdate(db, start_min=31)
    check('T12 expiry: started 31 min ago, never wrote -> session_stopped (reason expired), session gone, marker written',
          upd(db, 'P1', J1, s5) == EXPIRED and state(db, J1) == (0, 0) and marker(db) == P1)
    check('T12 after expiry: the same id stays dead, automatic start refused', upd(db, 'P1', J1, s5) == STOPPED and start(db, 'P1', J1) == STOPPED)
    r5 = resume(db, 'P1', J1)
    check('T12 after expiry: resume tap -> new session that writes', r5.get('ok') is True and upd(db, 'P1', J1, r5['session_id']).get('ok') is True)
    reset(db)
    s6, _ = live(db)
    backdate(db, start_min=60, point_min=31)
    must(db, b.OWNER + "delete from realtime.messages;")
    check('T13 expiry from the last point: point 31 min old -> expired, point wiped', upd(db, 'P1', J1, s6) == EXPIRED and state(db, J1) == (0, 0))
    check('T13 expiry signals the Customer only (refetch)', q(db, 'owner', "select string_agg(topic, ',') from realtime.messages where event = 'job_changed';")[0] == f'jobs:user:{C1}')
    check('T13 Customer view after expiry -> waiting', view(db, 'C1', J1) == {'ok': True, 'available': False, 'reason': 'waiting'}, view(db, 'C1', J1))
    reset(db)
    s7, _ = live(db)
    backdate(db, start_min=30, point_min=29)
    check('T14 idle 29 min (under the limit) -> ok, not expired', upd(db, 'P1', J1, s7).get('ok') is True and state(db, J1) == (1, 1))
    # T15 parallel writes on an expired session: all refused, no deadlock, nothing left
    backdate(db, start_min=90, point_min=45)
    outs = []

    def w1():
        o, r = q(db, 'P1', f"select public.pro_update_live_location('{J1}', '{s7}'::uuid, {PT[0]}, {PT[1]}, now());", stop=False)
        outs.append((o, r.stderr))
    th = [threading.Thread(target=w1) for _ in range(8)]
    [t.start() for t in th]
    [t.join() for t in th]
    check('T15 8 parallel writes on an expired session -> all session_stopped, no ERROR / deadlock, nothing left',
          len(outs) == 8 and all('session_stopped' in o and 'ERROR' not in e for o, e in outs) and state(db, J1) == (0, 0),
          [e[-120:] for o, e in outs if 'ERROR' in e][:2])
    # T15b deterministic version: two writers reach the expiry together (held behind an uncommitted marker)
    reset(db)
    s8, _ = live(db)
    backdate(db, start_min=90, point_min=45)
    x = subprocess.Popen(b.PSQL + ['-d', db, '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    x.stdin.write(b.OWNER + f"begin;\ninsert into public.job_live_session_stops (job_id, pro_id) values ('{J1}', '{P1}');\nselect pg_sleep(2);\nrollback;\n")
    x.stdin.close()
    time.sleep(0.4)
    outs2 = []

    def w2():
        o, r = q(db, 'P1', f"select public.pro_update_live_location('{J1}', '{s8}'::uuid, {PT[0]}, {PT[1]}, now());", stop=False)
        outs2.append((o, r.stderr))
    th = [threading.Thread(target=w2) for _ in range(2)]
    for t in th:
        t.start()
        time.sleep(0.2)
    [t.join() for t in th]
    x.wait(timeout=30)
    check('T15b two writers expiring together -> both session_stopped, no 40P01 (writer locks the session row FOR UPDATE)',
          len(outs2) == 2 and all('session_stopped' in o and 'ERROR' not in e for o, e in outs2) and state(db, J1) == (0, 0),
          [(o[:60], e[-100:]) for o, e in outs2])
    # T16 R8-style: sign-out vs Arrived after a resume still never deadlocks (lock order unchanged)
    reset(db)
    stop(db, 'P1', J1)
    r6 = resume(db, 'P1', J1)
    upd(db, 'P1', J1, r6['session_id'])
    p = subprocess.Popen(b.PSQL + ['-d', db, '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write('begin;\n' + b.as_actor('P1') + f"update public.jobs set status = 'arrived' where id = '{J1}';\nselect pg_sleep(1);\ncommit;\n")
    p.stdin.close()
    time.sleep(0.3)
    so = stop(db, 'P1', None)
    p.wait(timeout=30)
    check('T16 after resume: sign-out vs Arrived -> both succeed, no 40P01, nothing left', so.get('ok') is True and p.returncode == 0
          and '40P01' not in p.stderr.read() and state(db, J1) == (0, 0), so)
    reset(db)


def g_coverage(db):
    print('\n## B. Server-side wipe on status / assignment changes (0032 trigger) + session end (0037 trigger)')
    cases = [
        ('Arrived (Pro PATCH en_route -> arrived, through RLS)', 'P1', f"update public.jobs set status = 'arrived' where id = '{J1}';"),
        ('cancel while en_route (privileged)', 'owner', f"update public.jobs set status = 'cancelled', cancelled_at = now() where id = '{J1}';"),
        ('release (en_route -> posted, pro cleared)', 'owner', f"update public.jobs set status = 'posted', pro_id = null, accepted_at = null where id = '{J1}';"),
        ('reassignment P1 -> P2 (still en_route)', 'owner', f"update public.jobs set pro_id = '{P2}' where id = '{J1}';"),
        ('customer_id change (still en_route)', 'owner', f"update public.jobs set customer_id = '{C2}' where id = '{J1}';"),
        ('leaving en_route to complete (privileged)', 'owner', f"update public.jobs set status = 'complete', completed_at = now() where id = '{J1}';"),
    ]
    for label, who, sql in cases:
        reset(db)
        sid, u = live(db)
        out, r = q(db, who, sql + "\nselect 'done';", stop=False)
        ok = r.returncode == 0 and out == 'done'
        check(f'{label}: update allowed', ok, r.stderr[-200:])
        check(f'{label}: point AND session gone', state(db, J1) == (0, 0), state(db, J1))
        check(f'{label}: delayed write with old session refused, no point',
              upd(db, 'P1', J1, sid).get('ok') is not True and state(db, J1) == (0, 0))
    reset(db)
    sid, _ = live(db)
    q(db, 'owner', f"update public.jobs set title = 'renamed' where id = '{J1}';")
    check('other column change keeps session + point', state(db, J1) == (1, 1))
    reset(db)
    sid, _ = live(db)
    q(db, 'owner', f"update public.jobs set status = 'posted', pro_id = null, accepted_at = null where id = '{J1}';")
    out, r = q(db, 'P1', f"select count(*) from public.pro_claim_job('{J1}');", stop=False)
    check('released then re-claimed by the same Pro (pro_claim_job)', r.returncode == 0, r.stderr[-200:])
    check('re-claim: pre-release session refused (needs a new start)', upd(db, 'P1', J1, sid) == {'ok': False, 'error': 'session_stopped'} and state(db, J1) == (0, 0))
    s2 = start(db, 'P1', J1).get('session_id')
    check('re-claim: fresh start works', upd(db, 'P1', J1, s2).get('ok') is True)
    reset(db)
    live(db)
    must(db, b.OWNER + f"delete from public.job_live_sessions where false;")   # no-op
    q(db, 'owner', f"begin; delete from public.job_status_events where job_id = '{J1}'; commit;")
    # job delete cascades
    db2 = db
    must(db2, b.OWNER + "begin;\n" + b.job_insert('e0370000-0000-4000-8000-0000000000d1', C2, P3, 'en_route') + "commit;\n")
    d1 = 'e0370000-0000-4000-8000-0000000000d1'
    sd, _ = live(db2, d1, 'P3')
    q(db2, 'owner', f"delete from public.jobs where id = '{d1}';")
    check('job DELETE cascades point + session', state(db2, d1) == (0, 0))


def g_signal(db):
    print('\n## C. Stop signal to the Customer (0036 shape, no location)')
    reset(db)
    sid, _ = live(db)
    pre = b.as_actor('P1')
    m = b.expect_signals(db, 'stop sends one job_changed to the Customer only', pre + f"select public.pro_stop_live_location('{J1}') \\g /dev/null\n",
                         [('C1', 'updated', 'en_route')], J1)
    check('stop signal not sent to the Pro or anyone else', m is not None and {x['topic'] for x in m} == {'jobs:user:' + C1})
    rc, err, msgs = b.run_and_collect(db, pre + f"select public.pro_stop_live_location('{J1}') \\g /dev/null\n"
                                           f"select public.pro_stop_live_location('{J1}') \\g /dev/null\n")
    check('repeat stop in the same txn: still one signal', rc == 0 and len(msgs) == 1, msgs)
    reset(db)
    rc, err, msgs = b.run_and_collect(db, pre + f"select public.pro_stop_live_location('{J1}') \\g /dev/null\n")
    check('stop with nothing to stop sends nothing', rc == 0 and msgs == [], msgs)
    rc, err, msgs = b.run_and_collect(db, b.as_actor('P2') + f"select public.pro_stop_live_location('{J1}') \\g /dev/null\n")
    check('not_found stop sends nothing', rc == 0 and msgs == [], msgs)
    reset(db)
    live(db)
    rc, err, msgs = b.run_and_collect(db, pre + "select public.pro_stop_live_location(null) \\g /dev/null\n")
    check('stop(null) signals the Customer of each stopped job', rc == 0 and len(msgs) == 1 and msgs[0]['topic'] == 'jobs:user:' + C1, msgs)
    # failure: realtime.send unusable -> stop still wipes
    for label, breaker in (
        ('realtime.send raises', "create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language plpgsql as $f$ begin raise exception 'boom'; end $f$;"),
        ('EXECUTE on realtime.send revoked from owner', f"revoke all on function realtime.send(jsonb, text, text, boolean) from {O}, public;"),
        ('no messages partition for today', "do $d$ declare r record; begin for r in select inhrelid::regclass t from pg_inherits where inhparent = 'realtime.messages'::regclass loop execute 'drop table ' || r.t; end loop; end $d$;"),
        ('realtime.messages locked (lock_timeout 1s)', None)):
        dbx = f'{PREFIX}_sig{len(b.RESULTS)}'
        build(dbx)
        reset(dbx)
        live(dbx)
        if breaker:
            must(dbx, 'set role supabase_admin;\n' + breaker if 'realtime.send(payload' in breaker else breaker)
            t0 = time.time()
            r = psql(dbx, 'begin;\n' + pre + f"select public.pro_stop_live_location('{J1}');\ncommit;\n")
        else:
            locker = subprocess.Popen(b.PSQL + ['-d', dbx], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            locker.stdin.write('begin; lock table realtime.messages in access exclusive mode; select pg_sleep(6); commit;\n'); locker.stdin.flush()
            time.sleep(0.8)
            t0 = time.time()
            r = psql(dbx, 'begin;\n' + pre + f"select public.pro_stop_live_location('{J1}');\ncommit;\n")
            dt = time.time() - t0
            locker.communicate(timeout=20)
        dt = time.time() - t0 if breaker else dt
        check(f'{label}: stop still ok + wiped (WARNING only)', r.returncode == 0 and '"stopped": true' in r.stdout and state(dbx, J1) == (0, 0)
              and ('signal skipped' in r.stderr or 'WarnSendingBroadcastMessage' in r.stderr), r.stderr[-200:])
        if not breaker:
            check(f'{label}: stop returned in < 4 s ({dt:.1f}s)', dt < 4)
        psql('postgres', f'drop database if exists {dbx};')


def g_races(db):
    print('\n## D. Races (two real sessions)')

    class BG:
        def __init__(self, sql):
            self.p = subprocess.Popen(b.PSQL + ['-d', db, '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                      stderr=subprocess.PIPE, text=True)
            self.p.stdin.write(sql); self.p.stdin.close()

        def communicate(self, timeout=30):
            self.p.wait(timeout=timeout)
            return self.p.stdout.read(), self.p.stderr.read()

        @property
        def returncode(self):
            return self.p.returncode
    bg = BG

    # R1: writer holds its transaction open; stop must wait, then wipe
    reset(db)
    sid, _ = live(db)
    age_point(db, J1)
    w = bg('begin;\n' + b.as_actor('P1') + f"select public.pro_update_live_location('{J1}', '{sid}', {PT[0]}, {PT[1]}, now());\nselect pg_sleep(2);\ncommit;\n")
    time.sleep(0.6)
    t0 = time.time()
    st = stop(db, 'P1', J1)
    dt = time.time() - t0
    wo, we = w.communicate(timeout=20)
    check('R1 in-flight write vs stop: stop waited for the writer', dt > 1.0 and '"ok": true' in wo, f'{dt:.1f}s')
    check('R1 final state: no point, no session', st.get('ok') is True and state(db, J1) == (0, 0))
    # R2: stop holds its transaction open; writer arriving meanwhile is refused after it commits
    reset(db)
    sid, _ = live(db)
    age_point(db, J1)
    s = bg('begin;\n' + b.as_actor('P1') + f"select public.pro_stop_live_location('{J1}');\nselect pg_sleep(2);\ncommit;\n")
    time.sleep(0.6)
    u = upd(db, 'P1', J1, sid)
    s.communicate(timeout=20)
    check('R2 write during an uncommitted stop -> session_stopped (waits, then refused)', u == {'ok': False, 'error': 'session_stopped'}, u)
    check('R2 final state: no point, no session', state(db, J1) == (0, 0))
    # R3: no point yet; first write uncommitted; stop must wait for it and then wipe
    reset(db)
    sid = start(db, 'P1', J1)['session_id']
    w = bg('begin;\n' + b.as_actor('P1') + f"select public.pro_update_live_location('{J1}', '{sid}', {PT[0]}, {PT[1]}, now());\nselect pg_sleep(2);\ncommit;\n")
    time.sleep(0.6)
    stop(db, 'P1', J1)
    w.communicate(timeout=20)
    check('R3 first insert uncommitted vs stop: final no point', state(db, J1) == (0, 0))
    # R4: stop vs Arrived concurrently
    reset(db)
    sid, _ = live(db)
    a = bg('begin;\n' + b.as_actor('P1') + f"update public.jobs set status = 'arrived' where id = '{J1}';\nselect pg_sleep(1.5);\ncommit;\n")
    time.sleep(0.5)
    st = stop(db, 'P1', J1)
    ao, ae = a.communicate(timeout=20)
    check('R4 stop vs Arrived: no deadlock / error', a.returncode == 0 and st.get('ok') is True, ae[-200:] + str(st))
    check('R4 final state: no point, no session', state(db, J1) == (0, 0))
    # R5: write vs Arrived
    reset(db)
    sid, _ = live(db)
    age_point(db, J1)
    w = bg('begin;\n' + b.as_actor('P1') + f"select public.pro_update_live_location('{J1}', '{sid}', {PT[0]}, {PT[1]}, now());\nselect pg_sleep(1.5);\ncommit;\n")
    time.sleep(0.5)
    q(db, 'P1', f"update public.jobs set status = 'arrived' where id = '{J1}';")
    w.communicate(timeout=20)
    check('R5 in-flight write vs Arrived: final no point, no session', state(db, J1) == (0, 0))
    # R6: start vs stop
    reset(db)
    s1 = start(db, 'P1', J1)['session_id']
    p = bg('begin;\n' + b.as_actor('P1') + f"select public.pro_start_live_location('{J1}');\nselect pg_sleep(1.5);\ncommit;\n")
    time.sleep(0.5)
    st = stop(db, 'P1', J1)
    p.communicate(timeout=20)
    check('R6 stop after a concurrent start commits: no session left', st.get('ok') is True and state(db, J1)[1] == 0)
    # R8 (Quagon LOW-1 / X1c): sign-out stop(null) vs Arrived while the point row is briefly held.
    # Arrived's triggers delete point then session; without the jobs lock the null stop deletes
    # session then point -> 40P01. With the fix both paths take the jobs row first.
    errs = []
    for i in range(3):
        reset(db)
        live(db)
        h = bg(b.OWNER + f"begin;\nselect 1 from public.job_live_locations where job_id = '{J1}' for update;\nselect pg_sleep(1.0);\ncommit;\n")
        time.sleep(0.3)
        a = bg('begin;\n' + b.as_actor('P1') + f"update public.jobs set status = 'arrived' where id = '{J1}';\ncommit;\n")
        time.sleep(0.3)
        n = bg('begin;\n' + b.as_actor('P1') + "select public.pro_stop_live_location(null);\ncommit;\n")
        h.communicate(timeout=30); ao, ae = a.communicate(timeout=30); no, ne = n.communicate(timeout=30)
        for name, rc, err in (('Arrived', a.returncode, ae), ('null stop', n.returncode, ne)):
            if rc != 0 or 'deadlock' in err or 'ERROR' in err:
                errs.append(f'iter{i} {name}: ' + ('40P01 deadlock' if 'deadlock' in err else err.strip()[-120:]))
        if state(db, J1) != (0, 0):
            errs.append(f'iter{i} state {state(db, J1)}')
    check('R8 sign-out stop(null) vs Arrived with point row held: no deadlock, both succeed, no point/session (3 runs)', not errs, ' | '.join(errs))
    # R7: 20 parallel writers with the stopped session after a stop
    reset(db)
    sid, _ = live(db)
    stop(db, 'P1', J1)
    procs = [bg('begin;\n' + b.as_actor('P1') + f"select public.pro_update_live_location('{J1}', '{sid}', {PT[0]}, {PT[1]}, now());\ncommit;\n") for _ in range(20)]
    outs = [p.communicate(timeout=30)[0] for p in procs]
    check('R7 20 parallel late writes after stop: all session_stopped, no point',
          all('session_stopped' in o for o in outs) and state(db, J1) == (0, 0))


def g_catalog(db):
    print('\n## E. Catalog, grants, direct access')
    for who in ('anon', 'service_role'):
        for sql in (f"select public.pro_start_live_location('{J1}');", f"select public.pro_resume_live_location('{J1}');", f"select public.pro_stop_live_location('{J1}');",
                    f"select public.pro_update_live_location('{J1}', gen_random_uuid(), 1, 1, now());"):
            out, r = q(db, who, sql, stop=False)
            check(f'{who} cannot EXECUTE {sql.split("(")[0][7:]}', 'permission denied' in r.stderr, r.stderr[-120:])
    for who in ('P1', 'C1', 'anon', 'service_role'):
        for sql in ('select count(*) from public.job_live_sessions;', f"insert into public.job_live_sessions values ('{J1}', '{P1}', gen_random_uuid(), now());",
                    'delete from public.job_live_sessions;', 'select public.jobs_end_live_session();', 'select public.job_live_locations_require_session();'):
            out, r = q(db, who, sql, stop=False)
            check(f'{who} denied: {sql[:48]}', 'permission denied' in r.stderr, r.stderr[-120:])
    out, r = q(db, 'P1', f"select set_config('haven.live_session_id', 'x', true);\ninsert into public.job_live_locations values ('{J1}', '{P1}', 1, 1, now(), null);", stop=False)
    check('P1 cannot write job_live_locations directly even with the GUC set', 'permission denied' in r.stderr)
    out = must(db, "select string_agg(p.proname || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ';'), ' ' order by p.proname) from pg_proc p "
                   "where p.proname in ('pro_start_live_location','pro_resume_live_location','pro_stop_live_location','job_live_locations_require_session','jobs_end_live_session') "
                   "or p.oid = 'public.pro_update_live_location(uuid,uuid,double precision,double precision,timestamptz)'::regprocedure;").strip()
    check('all 6 functions SECURITY DEFINER with pinned search_path', out.count(':true:search_path=pg_catalog, public, pg_temp') == 6, out)
    out = must(db, "select relrowsecurity::text || (select count(*) from pg_policies where tablename = 'job_live_sessions')::text from pg_class where oid = 'public.job_live_sessions'::regclass;").strip()
    check('job_live_sessions RLS on, 0 policies', out == 'true0', out)
    out = must(db, "select count(*) from pg_attribute where attrelid = 'public.job_live_sessions'::regclass and attname ~ 'lat|lng|point|loc';").strip()
    check('job_live_sessions has no location column', out == '0')
    out = must(db, "select coalesce(haven_admin.baseline_mismatches(), 'clean');").strip() if must(db, "select to_regnamespace('haven_admin') is not null;").strip() == 't' else 'n/a'
    check('0035 baseline fingerprint (if present) unaffected', out in ('clean', 'n/a'), out)


def g_guards_rerun(prefix):
    print('\n## F. Guards, re-run, CRLF, rollback, one-time cleanup')
    db = f'{prefix}_g'
    build(db, with_0037=False)
    must(db, b.OWNER + f"insert into public.job_live_locations values ('{J1}', '{P1}', {PT[0]}, {PT[1]}, now(), null);")
    r = apply_0037(db, text=b.crlf(open(F37).read()))
    check('CRLF paste applies', r.returncode == 0, r.stderr[-200:])
    check('first apply deleted the pre-0037 point (no session)', state(db, J1) == (0, 0))
    sid, _ = live(db)
    r = apply_0037(db)
    check('re-run is a no-op (session + point kept)', r.returncode == 0 and state(db, J1) == (1, 1), r.stderr[-200:])
    r = psql(db, f'set role {O};\n' + open(R37).read())
    check('rollback runs', r.returncode == 0, r.stderr[-200:])
    out = must(db, "select to_regclass('public.job_live_sessions') is null and to_regprocedure('public.pro_start_live_location(uuid)') is null "
                   "and to_regprocedure('public.pro_resume_live_location(uuid)') is null "
                   "and to_regprocedure('public.pro_update_live_location(uuid,double precision,double precision,timestamptz)') is not null "
                   "and not exists (select 1 from pg_trigger where tgname in ('jobs_end_live_session','job_live_locations_require_session'));").strip()
    check('rollback removed only 0037 objects', out == 't')
    age_point(db, J1) if False else None
    must(db, b.OWNER + "delete from public.job_live_locations;")
    o = old_upd(db, 'P1', J1)
    check('after rollback the 0032 writer works again', o.get('ok') is True, o)
    r = apply_0037(db)
    check('re-apply after rollback works', r.returncode == 0 and state(db, J1)[0] == 0)
    # guards
    bad = {
        '0032 writer body changed': f"create or replace function public.pro_update_live_location(p_job_id uuid, p_lat double precision, p_lng double precision, p_captured_at timestamptz default null) returns jsonb language sql security definer set search_path = pg_catalog, public, pg_temp as $f$ select '{{}}'::jsonb $f$;",
        'policy on job_live_sessions': "create policy x on public.job_live_sessions for select to authenticated using (true);",
        '0037 function differs': "create or replace function public.jobs_end_live_session() returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $f$ begin return null; end $f$;",
        'discard trigger disabled': "alter table public.jobs disable trigger jobs_discard_live_location;",
    }
    for label, sql in bad.items():
        dbg = f'{prefix}_gd{len(b.RESULTS)}'
        build(dbg, with_0037=(label != '0032 writer body changed' and label != 'discard trigger disabled'))
        must(dbg, f'set role {O};\n' + sql)
        r = apply_0037(dbg, expect_ok=False)
        check(f'guard refuses: {label}', r.returncode != 0 and '0037' in r.stderr and 'Nothing was changed' in r.stderr, r.stderr[-160:])
        psql('postgres', f'drop database if exists {dbg};')
    dbg = f'{prefix}_gn'
    build(dbg, with_0037=False)
    r = apply_0037(dbg, role='codey0036_nobypass', expect_ok=False)
    check('guard refuses a role without BYPASSRLS / TRIGGER', r.returncode != 0 and 'run as the database owner' in r.stderr, r.stderr[-160:])
    psql('postgres', f'drop database if exists {dbg};')
    dbn = f'{prefix}_nort'
    build(dbn, realtime=False)
    must(dbn, f"select 1;")
    sid, u = live(dbn)
    r = psql(dbn, 'begin;\n' + b.as_actor('P1') + f"select public.pro_stop_live_location('{J1}');\ncommit;\n")
    check('without Supabase Realtime (no realtime schema): stop still ok, WARNING only',
          u.get('ok') is True and '"stopped": true' in r.stdout and 'signal skipped' in r.stderr and state(dbn, J1) == (0, 0), r.stderr[-160:])
    for d in (db, dbn):
        psql('postgres', f'drop database if exists {d};')


def g_checks(prefix):
    print('\n## G. 0037a / 0037b read-only checks')
    db = f'{prefix}_chk'
    build(db, with_0037=False)

    def run(path):
        r = psql(db, f'set role {O};\nbegin read only;\n' + open(path).read() + 'rollback;\n')
        rows = [l.split('|') for l in r.stdout.strip().splitlines() if '|' in l]
        return r.returncode, rows
    rc, rows = run(CHK_A)
    check('0037a before apply: READY (5 of 5)', rc == 0 and rows[0][1] == 'READY (5 of 5)', rows[:1])
    rc, rows = run(CHK_B)
    check('0037b before apply: NOT LIVE', rc == 0 and rows[0][1].startswith('NOT LIVE'), rows[:1])
    apply_0037(db)
    rc, rows = run(CHK_A)
    check('0037a after apply: READY: already applied (5 of 5)', rc == 0 and rows[0][1] == 'READY: already applied (5 of 5)', rows[:1])
    rc, rows = run(CHK_B)
    check('0037b after apply: LIVE (11 of 11)', rc == 0 and rows[0][1] == 'LIVE (11 of 11)', rows)
    check('0037b CRLF copy reads the same', psql(db, f'set role {O};\n' + b.crlf(open(CHK_B).read())).stdout.splitlines()[0].split('|')[1] == 'LIVE (11 of 11)')
    must(db, 'alter table public.job_live_locations disable trigger job_live_locations_require_session;')
    rc, rows = run(CHK_B)
    check('0037b catches a disabled guard', rows[0][1].startswith('NOT LIVE'), rows[0])
    must(db, 'alter table public.job_live_locations enable trigger job_live_locations_require_session;')
    must(db, f"grant execute on function public.jobs_end_live_session() to authenticated;")
    rc, rows = run(CHK_B)
    check('0037b catches a client grant on a trigger function', rows[0][1].startswith('NOT LIVE'), rows[0])
    must(db, f"revoke execute on function public.jobs_end_live_session() from authenticated;")
    must(db, f"create or replace function public.pro_stop_live_location(p_job_id uuid default null) returns jsonb language sql security definer set search_path = pg_catalog, public, pg_temp as $f$ select '{{}}'::jsonb $f$;")
    rc, rows = run(CHK_A)
    check('0037a: changed 0037 body -> NOT READY', rows[0][1].startswith('NOT READY'), rows[0])
    for path in (CHK_A, CHK_B):
        t = open(path).read().lower()
        body = re.sub(r"'(?:[^']|'')*'", "''", re.sub(r'--[^\n]*', '', t))
        check(f'{os.path.basename(path)} is one read-only SELECT (no DML/DDL)', not re.search(r'\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b', body))
    psql('postgres', f'drop database if exists {db};')


def g_fcc(prefix):
    print('\n## H. Founder Control Center (0034/0035/0035a live) with 0037')
    db = f'{prefix}_fcc'
    build(db, with_0037=False)
    b.fcc_apply(db)
    apply_0037(db)
    check('0035 baseline_mismatches() still clean after 0037', must(db, "select coalesce(haven_admin.baseline_mismatches(), 'clean');").strip() == 'clean')
    for op, want in (('release', 'posted'), ('cancel', 'cancelled')):
        reset(db)
        sid, _ = live(db)
        must(db, 'begin;\n' + b.admin_op(op, J1, 'en_route', P1) + "commit;\n")
        st = must(db, f"select status from public.jobs where id = '{J1}';").strip()
        check(f'admin {op}: job {want}, point + session gone, late write refused',
              st == want and state(db, J1) == (0, 0) and upd(db, 'P1', J1, sid).get('ok') is not True, st)
    psql('postgres', f'drop database if exists {db};')


def main():
    print(f'0037 under test: {F37} sha256 {b.sha(F37)}')
    main_db = f'{PREFIX}_main'
    try:
        build(main_db)
        g_api(main_db)
        g_stopfinal(main_db)
        g_t675(main_db)
        g_coverage(main_db)
        g_signal(main_db)
        g_races(main_db)
        g_catalog(main_db)
        if not QUICK:
            g_guards_rerun(PREFIX)
            g_checks(PREFIX)
            g_fcc(PREFIX)
            dbl = f'{PREFIX}_lean'
            build(dbl, drafts=False)
            g_api(dbl)
            g_coverage(dbl)
    finally:
        out = must('postgres', f"select string_agg(datname, ' ') from pg_database where datname like '{PREFIX}%';").strip()
        for d in out.split():
            psql('postgres', f'drop database if exists {d};')
    n, ok = len(b.RESULTS), sum(b.RESULTS)
    print(f'\nRESULT {ok}/{n} passed')
    sys.exit(0 if n and ok == n else 1)


if __name__ == '__main__':
    main()
