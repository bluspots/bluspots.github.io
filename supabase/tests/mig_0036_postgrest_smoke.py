#!/usr/bin/env python3
"""MIG-0036 HTTP smoke through a LOCAL PostgREST. Never Supabase.

Builds its own throwaway database (via mig_0036_realtime_signal_matrix.build), starts its own
PostgREST (own port, own random JWT secret that is never printed), runs the HTTP checks, stops
only the PostgREST process it started, and drops the database.

Usage: HAVEN_PGRST=/path/postgrest HAVEN_DEPS=... python3 supabase/tests/mig_0036_postgrest_smoke.py
Env: HAVEN_PGRST_PORT (default 54396), HAVEN_PG_URI_BASE (default postgresql://postgres@/%s?host=/tmp&port=54329)
"""
import base64, hashlib, hmac, json, os, secrets, subprocess, sys, tempfile, time, urllib.request, urllib.error

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mig_0036_realtime_signal_matrix as M  # noqa: E402

BIN = os.environ.get('HAVEN_PGRST', 'postgrest')
PORT = int(os.environ.get('HAVEN_PGRST_PORT', '54396'))
DB = 'codey0036_rest_%d' % os.getpid()
URI = os.environ.get('HAVEN_PG_URI_BASE', 'postgresql://postgres@/%s?host=/tmp&port=54329') % DB
SECRET = secrets.token_urlsafe(48)
RES = []


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def jwt(claims):
    h = b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    p = b64(json.dumps(dict(claims, exp=int(time.time()) + 600)).encode())
    s = b64(hmac.new(SECRET.encode(), f'{h}.{p}'.encode(), hashlib.sha256).digest())
    return f'{h}.{p}.{s}'


def call(method, path, who=None, body=None, profile=None):
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}{path}', method=method,
                                 data=None if body is None else json.dumps(body).encode())
    req.add_header('Content-Type', 'application/json')
    if profile:
        req.add_header('Accept-Profile', profile)
        req.add_header('Content-Profile', profile)
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
        try:
            return e.code, json.loads(raw) if raw else None
        except ValueError:
            return e.code, raw.decode()[:200]


def check(label, ok, got=''):
    RES.append(bool(ok))
    print(f"{'PASS' if ok else 'FAIL'} {label}{': ' + M.redact(json.dumps(got))[:200] if got != '' else ''}")


def owner_sql(sql):
    return subprocess.run(['psql', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', URI], input=sql,
                          capture_output=True, text=True, check=True).stdout.strip()


def signals(job):
    return owner_sql(f"select coalesce(string_agg(right(topic, 36) || '/' || (payload->>'reason') || '/' || coalesce(payload->>'status', 'null'), ',' "
                     f"order by topic), '') from realtime.messages where payload->>'job_id' = '{job}' and inserted_at > (now() at time zone 'utc') - interval '5 minutes';")


def run_checks():
    s, b = call('PATCH', f'/jobs?id=eq.{M.J1}', 'P1', {'status': 'arrived'})
    check('P1 PATCH /jobs status=arrived over HTTP -> 2xx', s in (200, 204), [s])
    got = signals(M.J1)
    check('...signals exactly C1 + P1 (updated/arrived)', got == ','.join(sorted([f'{M.C1}/updated/arrived', f'{M.P1}/updated/arrived'])), got)
    owner_sql("delete from realtime.messages;")
    # break realtime.send: the HTTP write must still succeed
    owner_sql("create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void "
              "language plpgsql as $f$ begin raise exception 'boom'; end $f$;")
    s, b = call('PATCH', f'/jobs?id=eq.{M.J1}', 'P1', {'status': 'diagnosing'})
    st = owner_sql(f"select status from public.jobs where id = '{M.J1}';")
    check('with realtime.send raising: P1 PATCH still 2xx and the status is saved', s in (200, 204) and st == 'diagnosing', [s, st])
    check('...and no signal row', signals(M.J1) == '')
    s, b = call('POST', '/rpc/jobs_signal_parties', 'P1', {})
    check('P1 POST /rpc/jobs_signal_parties -> refused (not callable)', s in (400, 401, 403, 404), [s])
    for who in ('C1', 'P1', None, 'service_role'):
        s, b = call('GET', '/messages?select=*', who, profile='realtime')
        check(f'{who or "anon"} GET realtime.messages over REST -> refused (realtime schema not exposed)', s in (400, 404, 406), [s])
        s, b = call('POST', '/messages', who, {'topic': f'jobs:user:{M.C1}', 'extension': 'broadcast', 'payload': {}, 'private': True}, profile='realtime')
        check(f'{who or "anon"} POST realtime.messages over REST -> refused', s in (400, 401, 403, 404, 406), [s])
    s, b = call('GET', f'/jobs?id=eq.{M.J1}&select=id,status', 'P1')
    check('P1 still reads own job via existing RLS (refetch path works)', s == 200 and len(b) == 1 and b[0]['status'] == 'diagnosing', [s])
    s, b = call('GET', f'/jobs?id=eq.{M.J1}&select=id,status', 'P2')
    check('P2 (not assigned) reads nothing (unchanged RLS)', s == 200 and b == [], [s, b])


def main():
    M.build(DB)
    conf = tempfile.NamedTemporaryFile('w', suffix='.conf', delete=False)
    os.chmod(conf.name, 0o600)
    conf.write(f'db-uri = "{URI}"\ndb-schemas = "public"\ndb-anon-role = "anon"\n'
               f'jwt-secret = "{SECRET}"\nserver-host = "127.0.0.1"\nserver-port = {PORT}\n')
    conf.close()
    log = open(os.path.join(os.environ.get('HAVEN_LOG_DIR', '/tmp'), 'codey0036-postgrest.log'), 'w')
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
    sys.exit(0 if RES and all(RES) else 1)


if __name__ == '__main__':
    main()
