#!/usr/bin/env python3
"""MIG-0032 HTTP smoke through a LOCAL PostgREST. Never Supabase.

Builds its own throwaway database (master + 0027 + 0030 + 0032, via
mig_0032_live_location_matrix.py), starts its own PostgREST (own port, own random
JWT secret that is never printed), runs the HTTP checks, stops only the PostgREST
process it started, and drops the database. Output never prints a coordinate.

Usage:
  HAVEN_PGRST=/path/postgrest HAVEN_0027=... HAVEN_0030=... python3 supabase/tests/mig_0032_postgrest_smoke.py
Env: HAVEN_PGRST_PORT (default 54395), HAVEN_PG_URI_BASE (default postgresql://postgres@/%s?host=/tmp&port=54329),
     HAVEN_LOG_DIR (PostgREST log dir, default /tmp)
"""
import base64, hashlib, hmac, json, os, re, secrets, subprocess, sys, tempfile, time, urllib.request, urllib.error

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mig_0032_live_location_matrix as M  # noqa: E402

BIN = os.environ.get('HAVEN_PGRST', 'postgrest')
PORT = int(os.environ.get('HAVEN_PGRST_PORT', '54395'))
DB = 'codey0032_rest_%d' % os.getpid()
URI = os.environ.get('HAVEN_PG_URI_BASE', 'postgresql://postgres@/%s?host=/tmp&port=54329') % DB
SECRET = secrets.token_urlsafe(48)
RES = []
LAT, LNG = float(M.LIVE[0]), float(M.LIVE[1])


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def jwt(claims):
    h = b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    p = b64(json.dumps(dict(claims, exp=int(time.time()) + 600)).encode())
    s = b64(hmac.new(SECRET.encode(), f'{h}.{p}'.encode(), hashlib.sha256).digest())
    return f'{h}.{p}.{s}'


def call(method, path, who=None, body=None):
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}{path}', method=method,
                                 data=None if body is None else json.dumps(body).encode())
    req.add_header('Content-Type', 'application/json')
    if who == 'service_role':
        req.add_header('Authorization', 'Bearer ' + jwt({'role': 'service_role'}))
    elif who:
        req.add_header('Authorization', 'Bearer ' + jwt({'sub': M.SUB[who], 'role': 'authenticated'}))
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, json.loads(raw) if raw else None


def check(label, got, ok):
    RES.append(bool(ok))
    print(f"{'PASS' if ok else 'FAIL'} {label}: {M.redact(json.dumps(got))[:220]}")


NF = {'ok': False, 'error': 'not_found'}
NA = {'ok': False, 'error': 'tracking_not_active'}
WRITE, READ = '/rpc/pro_update_live_location', '/rpc/get_job_live_location'


def wbody(jid, lat=LAT, lng=LNG):
    return {'p_job_id': jid, 'p_lat': lat, 'p_lng': lng}


def owner_sql(sql):
    return subprocess.run(['psql', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', URI], input=sql,
                          capture_output=True, text=True, check=True).stdout.strip()


def denied(s, b):
    return s in (401, 403) and isinstance(b, dict) and b.get('code') == '42501'


def run_checks():
    s, b = call('POST', WRITE, 'P1', wbody(M.J1))
    check('P1 (assigned) POST write -> 200 ok:true', [s, b], s == 200 and b.get('ok') is True and set(b) == {'ok', 'received_at'})
    s, b = call('POST', WRITE, 'P1', wbody(M.J1))
    check('P1 immediate second write -> 200 rate_limited retry_after_s 4..1', [s, b],
          s == 200 and b.get('error') == 'rate_limited' and 1 <= b.get('retry_after_s', 0) <= 4)
    s, b = call('POST', READ, 'C1', {'p_job_id': M.J1})
    check('C1 (owner) POST read -> 200 available:true, exact point (compared, not printed)', [s, {k: v for k, v in (b or {}).items() if k != 'point'}],
          s == 200 and b.get('available') is True and b['point'] == {'lat': LAT, 'lng': LNG} and b['age_s'] >= 0)
    s, b = call('POST', READ, 'P1', {'p_job_id': M.J1})
    check('P1 (assigned Pro) read -> 200 not_found', [s, b], s == 200 and b == NF)
    for who in ('P2', 'P3', 'P5', 'C2', 'NP'):
        s1, b1 = call('POST', READ, who, {'p_job_id': M.J1})
        s2, b2 = call('POST', WRITE, who, wbody(M.J1))
        s3, b3 = call('POST', READ, who, {'p_job_id': M.J_NONE})
        check(f'{who} read J1 / write J1 / read nonexistent -> identical 200 not_found', [s1, b1, s2, b2, s3, b3],
              (s1, b1, s2, b2, s3, b3) == (200, NF, 200, NF, 200, NF))
    s, b = call('POST', WRITE, 'C1', wbody(M.J1))
    check('C1 (owner) write -> 200 not_found', [s, b], s == 200 and b == NF)
    for path, body in ((WRITE, wbody(M.J1)), (READ, {'p_job_id': M.J1})):
        s, b = call('POST', path, None, body)
        check(f'anon POST {path} -> 401 42501', [s, b], denied(s, b))
        s, b = call('POST', path, 'service_role', body)
        check(f'service_role POST {path} -> 200 not_authenticated', [s, b], s == 200 and b == {'ok': False, 'error': 'not_authenticated'})
    for who in ('P1', 'C1', 'P2', 'service_role', None):
        s, b = call('GET', '/job_live_locations?select=*', who)
        check(f'{who or "anon"} GET /job_live_locations -> permission denied', [s, b], denied(s, b))
    for method, path, body in (('POST', '/job_live_locations', {'job_id': M.J1, 'pro_id': M.P1, 'lat': 1, 'lng': 1, 'received_at': '2026-11-06T05:00:00Z'}),
                               ('PATCH', f'/job_live_locations?job_id=eq.{M.J1}', {'lat': 1}),
                               ('DELETE', f'/job_live_locations?job_id=eq.{M.J1}', None)):
        for who in ('P1', 'C1', 'service_role'):
            s, b = call(method, path, who, body)
            check(f'{who} {method} /job_live_locations -> permission denied', [s, b], denied(s, b))
    s, b = call('GET', f'/jobs?id=eq.{M.J1}&select=*', 'C1')
    check('C1 GET own jobs row select=* -> no live point in the row', [s, len(b or [])],
          s == 200 and len(b) == 1 and M.LIVE[0][:6] not in json.dumps(b) and 'live' not in json.dumps(b))
    s, b = call('POST', '/rpc/get_assigned_job_destination', 'P1', {'p_job_id': M.J1})
    check('P1 get_assigned_job_destination -> stored job point (not the live point)', [s, b.get('ok') if b else None],
          s == 200 and b['destination']['lat'] == float(M.JOBPT[0]) and b['destination']['lng'] == float(M.JOBPT[1]))
    s, b = call('POST', '/rpc/jobs_posted_within_radius', 'P2', {})
    check('P2 board -> no live point anywhere', [s, len(b or [])], s == 200 and M.LIVE[0][:6] not in json.dumps(b))
    for lat, lng, label in ((91, LNG, 'lat 91'), ('NaN', LNG, 'lat "NaN"'), (LAT, 'Infinity', 'lng "Infinity"'), (0, 0, '(0,0)')):
        owner_sql(f"update public.job_live_locations set received_at = received_at - interval '10 seconds' where job_id = '{M.J1}';")
        s, b = call('POST', WRITE, 'P1', wbody(M.J1, lat, lng))
        check(f'P1 write {label} -> 200 invalid_point', [s, b], s == 200 and b == {'ok': False, 'error': 'invalid_point'})
    same = owner_sql(f"select lat = {M.LIVE[0]} and lng = {M.LIVE[1]} from public.job_live_locations where job_id = '{M.J1}';")
    check('stored point unchanged after the invalid writes', same, same == 't')
    owner_sql(f"update public.job_live_locations set received_at = received_at - interval '6 minutes' where job_id = '{M.J1}';")
    s, b = call('POST', READ, 'C1', {'p_job_id': M.J1})
    check('C1 read after 6 min without updates -> paused, no coordinates', [s, b],
          s == 200 and b.get('reason') == 'paused' and b.get('available') is False and 'point' not in b)
    s, b = call('PATCH', f'/jobs?id=eq.{M.J1}', 'P1', {'status': 'arrived'})
    check('P1 PATCH jobs status=arrived (existing path) -> 2xx', [s], s in (200, 204))
    n = owner_sql(f"select count(*) from public.job_live_locations where job_id = '{M.J1}';")
    check('after Arrived: live row discarded', n, n == '0')
    s, b = call('POST', READ, 'C1', {'p_job_id': M.J1})
    check('after Arrived: C1 read -> tracking_not_active', [s, b], s == 200 and b == NA)
    s, b = call('POST', WRITE, 'P1', wbody(M.J1))
    check('after Arrived: P1 write -> tracking_not_active, no row', [s, b, owner_sql(f"select count(*) from public.job_live_locations;")],
          s == 200 and b == NA and owner_sql("select count(*) from public.job_live_locations;") == '0')
    s, b = call('POST', READ, 'C2', {'p_job_id': M.J1})
    check('after Arrived: stranger C2 read -> same not_found', [s, b], s == 200 and b == NF)


def main():
    M.build(DB)
    rc, err = M.apply_file(DB, M.F32)
    if rc:
        raise SystemExit('0032 did not apply: ' + M.redact(err))
    conf = tempfile.NamedTemporaryFile('w', suffix='.conf', delete=False)
    os.chmod(conf.name, 0o600)
    conf.write(f'db-uri = "{URI}"\ndb-schemas = "public"\ndb-anon-role = "anon"\n'
               f'jwt-secret = "{SECRET}"\nserver-host = "127.0.0.1"\nserver-port = {PORT}\n')
    conf.close()
    log = open(os.path.join(os.environ.get('HAVEN_LOG_DIR', '/tmp'), 'codey0032-postgrest.log'), 'w')
    proc = subprocess.Popen([BIN, conf.name], stdout=log, stderr=log)
    print('started own postgrest pid', proc.pid, 'port', PORT)
    try:
        for _ in range(100):
            try:
                if urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1).status == 200:
                    break
            except Exception:
                pass
            time.sleep(0.2)
        run_checks()
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        os.unlink(conf.name)
        print('stopped own postgrest pid', proc.pid)
        M.psql('postgres', f'drop database if exists {DB};')
    print(f'\nTOTAL {len(RES)} PASS {sum(RES)} FAIL {len(RES) - sum(RES)}')
    sys.exit(0 if all(RES) else 1)


if __name__ == '__main__':
    main()
