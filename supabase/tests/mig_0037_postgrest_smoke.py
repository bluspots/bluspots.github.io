#!/usr/bin/env python3
"""MIG-0037 HTTP smoke through a LOCAL PostgREST (never Supabase): the RPC shapes the Pro and Customer
apps will call, PostgREST overload resolution between the 0032 4-argument writer and the 0037 writer,
and what the shipped (old) Pro app gets after 0037. Own throwaway DB, own PostgREST, own random JWT
secret (never printed); stops only what it started. Coordinates are synthetic and never printed.
Usage: HAVEN_PGRST=/path/postgrest HAVEN_DEPS=... python3 supabase/tests/mig_0037_postgrest_smoke.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('HAVEN_PGRST_PORT', '54397')
import mig_0036_postgrest_smoke as S  # noqa: E402
import mig_0037_live_session_matrix as L  # noqa: E402

M = S.M
S.DB = 'codey0037_rest_%d' % os.getpid()
S.URI = os.environ.get('HAVEN_PG_URI_BASE', 'postgresql://postgres@/%s?host=/tmp&port=54329') % S.DB
call, check, owner_sql = S.call, S.check, S.owner_sql
J1, C1, P1 = M.J1, M.C1, M.P1
LAT, LNG = 27.111111, -80.222222


def counts():
    return owner_sql(f"select (select count(*) from public.job_live_locations where job_id = '{J1}') || ',' || "
                     f"(select count(*) from public.job_live_sessions where job_id = '{J1}');")


def run_checks():
    s, b = call('POST', '/rpc/pro_start_live_location', 'P1', {'p_job_id': J1})
    sid = (b or {}).get('session_id')
    check('P1 POST /rpc/pro_start_live_location -> 200 {ok, session_id}', s == 200 and b.get('ok') is True and sid, [s, sorted(b or {})])
    s, b = call('POST', '/rpc/pro_update_live_location', 'P1', {'p_job_id': J1, 'p_session_id': sid, 'p_lat': LAT, 'p_lng': LNG})
    check('new writer (with p_session_id) resolves and writes -> 200 ok', s == 200 and b.get('ok') is True, [s, b])
    s, b = call('POST', '/rpc/get_job_live_location', 'C1', {'p_job_id': J1})
    check('Customer sees available point', s == 200 and b.get('available') is True, [s, (b or {}).get('available')])
    owner_sql(f"alter table public.job_live_locations disable trigger job_live_locations_require_session;"
              f"update public.job_live_locations set received_at = now() - interval '10 seconds';"
              f"alter table public.job_live_locations enable trigger job_live_locations_require_session;")
    for body, label in (({'p_job_id': J1, 'p_lat': LAT, 'p_lng': LNG, 'p_captured_at': '2026-11-12T16:00:00Z'}, 'with p_captured_at'),
                        ({'p_job_id': J1, 'p_lat': LAT, 'p_lng': LNG}, 'without p_captured_at')):
        s, b = call('POST', '/rpc/pro_update_live_location', 'P1', body)
        check(f'OLD app shape ({label}) -> HTTP 400, code P0001, message session_required',
              s == 400 and isinstance(b, dict) and b.get('code') == 'P0001' and b.get('message') == 'session_required', [s, b])
    check('...old writes did not refresh the point', owner_sql(f"select received_at < now() - interval '9 seconds' from public.job_live_locations where job_id = '{J1}';") == 't')
    s, b = call('POST', '/rpc/pro_update_live_location', 'P1', {'p_job_id': J1, 'p_session_id': None, 'p_lat': LAT, 'p_lng': LNG})
    check('p_session_id null -> 200 session_required', s == 200 and b == {'ok': False, 'error': 'session_required'}, [s, b])
    owner_sql("delete from realtime.messages;")
    s, b = call('POST', '/rpc/pro_stop_live_location', 'P1', {'p_job_id': J1})
    check('P1 POST /rpc/pro_stop_live_location -> 200 {ok:true, stopped:true}', s == 200 and b == {'ok': True, 'stopped': True}, [s, b])
    check('...point + session wiped', counts() == '0,0', counts())
    check('...one job_changed to the Customer only', S.signals(J1) == f'{C1}/updated/en_route', S.signals(J1))
    s, b = call('POST', '/rpc/get_job_live_location', 'C1', {'p_job_id': J1})
    check('Customer view right after stop -> waiting', s == 200 and b == {'ok': True, 'available': False, 'reason': 'waiting'}, [s, b])
    s, b = call('POST', '/rpc/pro_update_live_location', 'P1', {'p_job_id': J1, 'p_session_id': sid, 'p_lat': LAT, 'p_lng': LNG})
    check('late write with the stopped session -> 200 session_stopped, no point', s == 200 and b == {'ok': False, 'error': 'session_stopped'} and counts() == '0,0', [s, b])
    s, b = call('POST', '/rpc/pro_stop_live_location', 'P1', {})
    check('sign-out form: POST /rpc/pro_stop_live_location {} -> 200 ok', s == 200 and b.get('ok') is True, [s, b])
    s, b = call('POST', '/rpc/pro_stop_live_location', 'C1', {'p_job_id': J1})
    check('Customer stop -> not_found', s == 200 and b == {'ok': False, 'error': 'not_found'}, [s, b])
    for who in (None, 'service_role'):
        for fn in ('pro_start_live_location', 'pro_stop_live_location'):
            s, b = call('POST', f'/rpc/{fn}', who, {'p_job_id': J1})
            check(f'{who or "anon"} /rpc/{fn} -> refused', s in (401, 403), [s])
    for who in ('P1', None, 'service_role'):
        s, b = call('GET', '/job_live_sessions?select=*', who)
        check(f'{who or "anon"} GET /job_live_sessions -> refused', s in (401, 403, 404), [s])
    s, b = call('POST', '/rpc/pro_start_live_location', 'P1', {'p_job_id': J1})
    sid2 = (b or {}).get('session_id')
    call('POST', '/rpc/pro_update_live_location', 'P1', {'p_job_id': J1, 'p_session_id': sid2, 'p_lat': LAT, 'p_lng': LNG})
    s, b = call('PATCH', f'/jobs?id=eq.{J1}', 'P1', {'status': 'arrived'})
    check('P1 PATCH status=arrived -> 2xx; point + session wiped by triggers', s in (200, 204) and counts() == '0,0', [s, counts()])


def main():
    L.build(S.DB)
    conf = tempfile.NamedTemporaryFile('w', suffix='.conf', delete=False)
    os.chmod(conf.name, 0o600)
    conf.write(f'db-uri = "{S.URI}"\ndb-schemas = "public"\ndb-anon-role = "anon"\n'
               f'jwt-secret = "{S.SECRET}"\nserver-host = "127.0.0.1"\nserver-port = {S.PORT}\n')
    conf.close()
    log = open(os.path.join(os.environ.get('HAVEN_LOG_DIR', '/tmp'), 'codey0037-postgrest.log'), 'w')
    proc = subprocess.Popen([S.BIN, conf.name], stdout=log, stderr=log)
    print('started own postgrest pid', proc.pid, 'port', S.PORT)
    try:
        for _ in range(100):
            try:
                if urllib.request.urlopen(f'http://127.0.0.1:{S.PORT}/', timeout=1).status == 200:
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
        M.psql('postgres', f'drop database if exists {S.DB};')
    print(f'\nTOTAL {len(S.RES)} PASS {sum(S.RES)} FAIL {len(S.RES) - sum(S.RES)}')
    sys.exit(0 if S.RES and all(S.RES) else 1)


if __name__ == '__main__':
    main()
