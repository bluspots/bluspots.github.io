#!/usr/bin/env python3
"""MIG-0031 HTTP smoke through a LOCAL PostgREST (never Supabase): POST /jobs exactly as the Customer app posts,
off-contract amounts refused (403 / 42501, nothing written), anon refused, service_role documented bypass, and
0029 still locking amounts after posting. Own throwaway DB, own PostgREST, own random JWT secret; stops only what
it started.  Usage: HAVEN_PGRST=/path/postgrest HAVEN_DEPS=... HAVEN_0036_TESTS=<#97 tests dir> \
       python3 -B supabase/tests/mig_0031_postgrest_smoke.py
"""
import os, subprocess, sys, tempfile, time, urllib.request

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.environ.get('HAVEN_0036_TESTS', HERE))
os.environ.setdefault('HAVEN_PGRST_PORT', '54397')
os.environ.setdefault('HAVEN_DB_PREFIX', 'codey0031_rest_%d' % os.getpid())
import mig_0036_postgrest_smoke as S  # noqa: E402
import mig_0031_posting_amounts_matrix as X  # noqa: E402

M = S.M
S.DB = os.environ['HAVEN_DB_PREFIX'] + '_db'
S.URI = os.environ.get('HAVEN_PG_URI_BASE', 'postgresql://postgres@/%s?host=/tmp&port=54329') % S.DB
call, check, owner_sql = S.call, S.check, S.owner_sql
C1, C2 = M.C1, M.C2


def body(n, cust=None, **over):
    d = dict(id=f'{X.NEW}{n:02d}', customer_id=cust or C1, status='posted', category='Plumbing', title='synthetic',
             city_label='Test City', lat=M.JOBPT[0], lng=M.JOBPT[1], payment_snapshot={'brand': 'Card', 'last4': '----'})
    d.update(X.APP)
    d.update(over)
    return d


def exists(n):
    return owner_sql(f"select count(*) from public.jobs where id = '{X.NEW}{n:02d}';") == '1'


def run_checks():
    s, b = call('POST', '/jobs', 'C1', body(1))
    check('C1 POST /jobs app-shaped (8900 / 7120 / 2000) -> 201', s == 201 and exists(1), [s, b])
    s, b = call('POST', '/jobs', 'C1', body(2, requires_diagnosis=True, inspection_fee_cents=4500))
    check('C1 POST diagnosis job (inspection 4500) -> 201', s == 201 and exists(2), [s, b])
    for n, label, over in ((21, 'margin 1500', dict(margin_rate_bps=1500)),
                           (23, 'payout 7121', dict(fixed_pro_labor_payout_cents=7121)),
                           (27, 'inspection 4500 on a standard job', dict(inspection_fee_cents=4500)),
                           (30, 'emergency fee on a non-emergency job', dict(emergency_fee_cents=3500)),
                           (31, 'convenience fee 3000', dict(convenience_fee_cents=3000))):
        s, b = call('POST', '/jobs', 'C1', body(n, **over))
        check(f'C1 POST {label} -> 403 42501, nothing written', s == 403 and isinstance(b, dict) and b.get('code') == '42501' and not exists(n), [s, b])
    s, b = call('POST', '/jobs', None, body(37))
    check('anon POST /jobs -> refused, nothing written', s in (401, 403) and not exists(37), [s])
    s, b = call('POST', '/jobs', 'service_role', body(41, margin_rate_bps=1500))
    check('service_role POST off-contract -> 201 (documented privileged bypass)', s == 201 and exists(41), [s, b])
    s, b = call('PATCH', f'/jobs?id=eq.{X.NEW}01', 'C1', {'fixed_pro_labor_payout_cents': 1})
    po = owner_sql(f"select fixed_pro_labor_payout_cents from public.jobs where id = '{X.NEW}01';")
    check('C1 PATCH payout after posting -> refused (0029 unchanged), stored 7120', s >= 400 and po == '7120', [s, po])


def main():
    X.build(S.DB)
    conf = tempfile.NamedTemporaryFile('w', suffix='.conf', delete=False)
    os.chmod(conf.name, 0o600)
    conf.write(f'db-uri = "{S.URI}"\ndb-schemas = "public"\ndb-anon-role = "anon"\n'
               f'jwt-secret = "{S.SECRET}"\nserver-host = "127.0.0.1"\nserver-port = {S.PORT}\n')
    conf.close()
    log = open(os.path.join(os.environ.get('HAVEN_LOG_DIR', '/tmp'), 'codey0031-postgrest.log'), 'w')
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
