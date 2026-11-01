#!/usr/bin/env python3
"""MIG-0030 HTTP smoke through a LOCAL PostgREST. Never Supabase.

Starts its own PostgREST (own port, own random JWT secret that is never
printed) against a local database built by mig_0030_assigned_destination_matrix.py
with HAVEN_KEEP_DBS=1 (0030 applied), runs the HTTP checks, then stops only
the PostgREST process it started.

Usage:
  HAVEN_REST_DB=codey0030_rest_main HAVEN_PGRST=/path/postgrest \
    python3 supabase/tests/mig_0030_postgrest_smoke.py
Env: HAVEN_PGRST_PORT (default 54391), HAVEN_PG_URI_BASE (default postgresql://postgres@/%s?host=/tmp&port=54329)
"""
import base64, hashlib, hmac, json, os, secrets, subprocess, sys, tempfile, time, urllib.request, urllib.error

DB = os.environ['HAVEN_REST_DB']
BIN = os.environ.get('HAVEN_PGRST', 'postgrest')
PORT = int(os.environ.get('HAVEN_PGRST_PORT', '54391'))
URI = os.environ.get('HAVEN_PG_URI_BASE', 'postgresql://postgres@/%s?host=/tmp&port=54329') % DB
SECRET = secrets.token_urlsafe(48)
C1 = 'b79c42e9-6e09-4335-9035-a11ecf37d032'
P1 = '971c6625-afa7-455b-9b8b-672c8dc562d9'
C2 = 'e0300000-0000-4000-8000-0000000000c2'
P2 = 'e0300000-0000-4000-8000-0000000000a2'
P3 = 'e0300000-0000-4000-8000-0000000000a3'
J1 = 'e0300000-0000-4000-8000-0000000000f1'
J_NONE = 'e0300000-0000-4000-8000-0000000000ff'
RES = []


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def jwt(sub):
    h = b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    p = b64(json.dumps({'sub': sub, 'role': 'authenticated', 'exp': int(time.time()) + 600}).encode())
    s = b64(hmac.new(SECRET.encode(), f'{h}.{p}'.encode(), hashlib.sha256).digest())
    return f'{h}.{p}.{s}'


def call(method, path, who=None, body=None):
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}{path}', method=method,
                                 data=None if body is None else json.dumps(body).encode())
    req.add_header('Content-Type', 'application/json')
    if who:
        req.add_header('Authorization', 'Bearer ' + jwt(who))
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


def check(label, got, ok):
    RES.append(ok)
    print(f"{'PASS' if ok else 'FAIL'} {label}: {json.dumps(got)[:200]}")


def main():
    conf = tempfile.NamedTemporaryFile('w', suffix='.conf', delete=False)
    os.chmod(conf.name, 0o600)
    conf.write(f'db-uri = "{URI}"\ndb-schemas = "public"\ndb-anon-role = "anon"\n'
               f'jwt-secret = "{SECRET}"\nserver-host = "127.0.0.1"\nserver-port = {PORT}\n')
    conf.close()
    log = open(os.path.join(os.environ.get('HAVEN_LOG_DIR', '/tmp'), 'codey0030-postgrest.log'), 'w')
    proc = subprocess.Popen([BIN, conf.name], stdout=log, stderr=log)
    print('started own postgrest pid', proc.pid, 'port', PORT)
    try:
        for _ in range(100):  # wait until the schema cache is loaded (GET / returns 200)
            try:
                if urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1).status == 200:
                    break
            except Exception:
                pass
            time.sleep(0.2)
        rpc = '/rpc/get_assigned_job_destination'
        s, b = call('POST', rpc, P1, {'p_job_id': J1})
        check('P1 POST rpc -> 200 ok:true exact stored point', [s, b],
              s == 200 and b.get('ok') is True and b['destination'] == {'lat': 28.538336, 'lng': -81.379234, 'source': 'stored_job_point'})
        for who, n in ((P2, 'P2 unassigned in range'), (P3, 'P3 out of range'), (C1, 'C1 owner'), (C2, 'C2 other customer')):
            s, b = call('POST', rpc, who, {'p_job_id': J1})
            check(f'{n} rpc -> 200 not_found', [s, b], s == 200 and b == {'ok': False, 'error': 'not_found'})
        s, b = call('POST', rpc, P1, {'p_job_id': J_NONE})
        check('P1 rpc nonexistent -> 200 not_found (same body)', [s, b], s == 200 and b == {'ok': False, 'error': 'not_found'})
        s, b = call('POST', rpc, None, {'p_job_id': J1})
        check('anon rpc -> 401 permission denied', [s, b], s == 401 and b.get('code') == '42501')
        for who, n in ((P2, 'P2'), (P3, 'P3'), (C2, 'C2')):
            s, b = call('GET', f'/jobs?id=eq.{J1}&select=id,lat,lng', who)
            check(f'{n} GET jobs?id=eq.J1 -> []', [s, b], s == 200 and b == [])
            s, b = call('GET', f'/jobs?pro_id=not.is.null&customer_id=neq.{who}&select=id,lat,lng', who)
            check(f'{n} GET jobs?pro_id=not.is.null (not own customer rows) -> []', [s, b], s == 200 and b == [])
        s, b = call('GET', f'/jobs?id=eq.{J1}&pro_id=eq.{P1}&select=id,lat,lng,city_label', P1)
        check('P1 GET assigned row (REQ-01b) -> exact point', [s, b], s == 200 and len(b) == 1 and b[0]['lat'] == 28.538336)
        s, b = call('GET', f'/jobs?pro_id=eq.{P1}', P1)
        check('P1 GET select=* active read still works', [s, b], s == 200 and len(b) == 1)
        s, b = call('GET', f'/jobs?id=eq.{J1}&select=id,lat,lng', None)
        check('anon GET jobs -> 401', [s, b], s == 401)
        for who, n in ((P2, 'P2'), (P3, 'P3'), (P1, 'P1'), (C1, 'C1')):
            s, b = call('POST', '/rpc/jobs_posted_within_radius', who, {})
            check(f'{n} board -> 200, every lat/lng null, distance multiple of 0.5', [s, b],
                  s == 200 and all(r['lat'] is None and r['lng'] is None and (r['distance_mi'] * 2) == int(r['distance_mi'] * 2) for r in b)
                  and (who not in (P2, P3) or len(b) == 1))
        s, b = call('POST', '/rpc/jobs_posted_within_radius', None, {})
        check('anon board -> 401', [s, b], s == 401)
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        os.unlink(conf.name)
        print('stopped own postgrest pid', proc.pid)
    print(f'\nTOTAL {len(RES)} PASS {sum(RES)} FAIL {len(RES) - sum(RES)}')
    sys.exit(0 if all(RES) else 1)


if __name__ == '__main__':
    main()
