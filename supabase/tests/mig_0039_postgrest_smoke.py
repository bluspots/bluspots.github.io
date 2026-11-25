#!/usr/bin/env python3
"""MIG-0039 HTTP smoke through a LOCAL PostgREST (never Supabase): the Customer's own PATCH /jobs status writes
the app makes still work (cancel), the Customer cannot PATCH a work/dispatch status (403 / 42501, unchanged),
the assigned Pro's app writes still work, others/anon change nothing. Own throwaway DB, own PostgREST, own
random JWT secret; stops only what it started.  Usage: HAVEN_PGRST=/path/postgrest HAVEN_DEPS=... \
       HAVEN_0036_TESTS=<#97 tests dir> python3 -B supabase/tests/mig_0039_postgrest_smoke.py
"""
import os, subprocess, sys, tempfile, time, urllib.request

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.environ.get('HAVEN_0036_TESTS', HERE))
os.environ.setdefault('HAVEN_PGRST_PORT', '54396')
os.environ.setdefault('HAVEN_DB_PREFIX', 'codey0039_rest_%d' % os.getpid())
import mig_0036_postgrest_smoke as S  # noqa: E402
import mig_0039_customer_status_guard_matrix as X  # noqa: E402

M = S.M
S.DB = os.environ['HAVEN_DB_PREFIX'] + '_db'
S.URI = os.environ.get('HAVEN_PG_URI_BASE', 'postgresql://postgres@/%s?host=/tmp&port=54329') % S.DB
call, check, owner_sql = S.call, S.check, S.owner_sql
C1, P1, J1, J2 = M.C1, M.P1, M.J1, M.J2



def st(j):
    return owner_sql(f"select status from public.jobs where id = '{j}';")


def run_checks():
    for target in ('complete', 'in_progress', 'arrived', 'posted'):
        X.setjob(S.DB, 'en_route', P1)
        s, b = call('PATCH', f'/jobs?id=eq.{J1}', 'C1', {'status': target})
        check(f'C1 PATCH own en_route job -> {target}: 403 42501, unchanged', s == 403 and isinstance(b, dict) and b.get('code') == '42501' and st(J1) == 'en_route', [s, b, st(J1)])
    X.setjob(S.DB, 'en_route', P1)
    s, b = call('PATCH', f'/jobs?id=eq.{J1}', 'P1', {'status': 'arrived'})
    check('assigned Pro PATCH en_route -> arrived: 2xx, applied', s in (200, 204) and st(J1) == 'arrived', [s, b, st(J1)])
    for who in ('C2', 'P3', None):
        s, b = call('PATCH', f'/jobs?id=eq.{J1}', who, {'status': 'complete'})
        check(f'{who or "anon"} PATCH C1 job -> complete: no change', st(J1) == 'arrived', [s, st(J1)])
    # HIGH-1: the Customer points their own profile at their own posted job (J2) and tries to claim it
    s, b = call('PATCH', f'/profiles?id=eq.{C1}', 'C1', {'operating_lat': M.NEARPT[0], 'operating_lng': M.NEARPT[1], 'pro_workspace': {'travelRadius': '25'}})
    check('C1 PATCH own profile operating point (allowed today: the HIGH-1 precondition)', s in (200, 204), [s, b])
    s, b = call('POST', '/rpc/pro_claim_job', 'C1', {'job_id': J2})
    check('C1 POST /rpc/pro_claim_job on own posted job: refused P0002 "job not claimable", job unchanged',
          s >= 400 and isinstance(b, dict) and b.get('code') == 'P0002' and st(J2) == 'posted', [s, b, st(J2)])
    owner_sql(f"update public.profiles set operating_lat = null, operating_lng = null, pro_workspace = null where id = '{C1}';")
    # LOW-1: complete only from in_progress
    X.setjob(S.DB, 'arrived', P1)
    s, b = call('PATCH', f'/jobs?id=eq.{J1}', 'P1', {'status': 'complete'})
    check('assigned Pro PATCH arrived -> complete: 403 42501, unchanged', s == 403 and isinstance(b, dict) and b.get('code') == '42501' and st(J1) == 'arrived', [s, b, st(J1)])
    X.setjob(S.DB, 'in_progress', P1)
    s, b = call('PATCH', f'/jobs?id=eq.{J1}&status=eq.in_progress', 'P1', {'status': 'complete'})
    check('assigned Pro PATCH in_progress -> complete (the Pro app write): 2xx, applied', s in (200, 204) and st(J1) == 'complete', [s, b, st(J1)])
    # MED-1: the Customer cannot rewrite a finished job
    s, b = call('PATCH', f'/jobs?id=eq.{J1}', 'C1', {'status': 'materials_approved'})
    check('C1 PATCH own complete job -> materials_approved: refused, unchanged', st(J1) == 'complete', [s, b, st(J1)])
    X.setjob(S.DB, 'arrived', P1)
    s, b = call('PATCH', f'/jobs?id=eq.{J2}', 'C1', {'status': 'cancelled'})
    check('C1 PATCH own posted job -> cancelled: 2xx, applied (app write unaffected)', s in (200, 204) and st(J2) == 'cancelled', [s, b, st(J2)])
    s, b = call('POST', '/rpc/pro_claim_job', 'P2', {'job_id': M.J3})
    check('P2 claims C2 posted job via pro_claim_job (privileged RPC unaffected)', s == 200 and st(M.J3) == 'en_route', [s, b, st(M.J3)])


def main():
    X.build(S.DB)
    X.apply(S.DB)
    conf = tempfile.NamedTemporaryFile('w', suffix='.conf', delete=False)
    os.chmod(conf.name, 0o600)
    conf.write(f'db-uri = "{S.URI}"\ndb-schemas = "public"\ndb-anon-role = "anon"\n'
               f'jwt-secret = "{S.SECRET}"\nserver-host = "127.0.0.1"\nserver-port = {S.PORT}\n')
    conf.close()
    log = open(os.path.join(os.environ.get('HAVEN_LOG_DIR', '/tmp'), 'codey0039-postgrest.log'), 'w')
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
