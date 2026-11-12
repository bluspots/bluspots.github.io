#!/usr/bin/env python3
"""MIG-0038 HTTP smoke through a LOCAL PostgREST (never Supabase): POST /rpc/customer_cancel_job as the
Customer app will call it, the refusal bodies, not_found for others, anon/service_role refused, and the
old Pro's view afterwards. Own throwaway DB, own PostgREST, own random JWT secret; stops only what it started.
Usage: HAVEN_PGRST=/path/postgrest HAVEN_DEPS=... python3 supabase/tests/mig_0038_postgrest_smoke.py
"""
import os, subprocess, sys, tempfile, time, urllib.request

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('HAVEN_PGRST_PORT', '54398')
import mig_0036_postgrest_smoke as S  # noqa: E402
import mig_0038_customer_cancel_matrix as X  # noqa: E402

M = S.M
S.DB = 'codey0038_rest_%d' % os.getpid()
S.URI = os.environ.get('HAVEN_PG_URI_BASE', 'postgresql://postgres@/%s?host=/tmp&port=54329') % S.DB
call, check, owner_sql = S.call, S.check, S.owner_sql
J1, J2, C1, P1 = M.J1, M.J2, M.C1, M.P1


def run_checks():
    nf = {'ok': False, 'error': 'not_found'}
    for who in ('C2', 'P1', 'P3'):
        s, b = call('POST', '/rpc/customer_cancel_job', who, {'p_job_id': J1})
        check(f'{who} cancel C1 job -> 200 not_found', s == 200 and b == nf, [s, b])
    for who in (None, 'service_role'):
        s, b = call('POST', '/rpc/customer_cancel_job', who, {'p_job_id': J1})
        check(f'{who or "anon"} -> refused', s in (401, 403), [s])
    owner_sql("update public.jobs set materials_reimbursed_cents = 1 where id = '%s';" % J1)
    s, b = call('POST', '/rpc/customer_cancel_job', 'C1', {'p_job_id': J1})
    check('money signal -> 200 {ok:false, error:money_involved, status:en_route}', s == 200 and b == {'ok': False, 'error': 'money_involved', 'status': 'en_route'}, [s, b])
    owner_sql("update public.jobs set materials_reimbursed_cents = 0 where id = '%s';" % J1)
    owner_sql("delete from realtime.messages;")
    s, b = call('POST', '/rpc/customer_cancel_job', 'C1', {'p_job_id': J1})
    check('C1 cancels en_route job -> 200 ok, pro_released', s == 200 and b == {'ok': True, 'status': 'cancelled', 'from_status': 'en_route', 'pro_released': True}, [s, b])
    check('...signals C1 updated + P1 removed', S.signals(J1) == ','.join(sorted([f'{C1}/updated/cancelled', f'{P1}/removed/cancelled'])), S.signals(J1))
    s, b = call('GET', f'/jobs?id=eq.{J1}&select=id,status', 'P1')
    check('old Pro GET /jobs -> [] (no access)', s == 200 and b == [], [s, b])
    check('...released Pro recorded owner-side (job_pro_releases)', owner_sql(f"select released_pro_id from public.job_pro_releases where job_id = '{J1}';") == P1)
    for who in ('C1', 'P1', None, 'service_role'):
        for tbl in (('job_pro_releases', 'job_status_events') if who != 'service_role' else ('job_pro_releases',)):   # server key may read events (0027)
            s, b = call('GET', f'/{tbl}?select=*', who)
            check(f'{who or "anon"} GET /{tbl} -> refused', s in (401, 403, 404), [s])
    s, b = call('GET', f'/jobs?id=eq.{J1}&select=id,status,pro_id', 'C1')
    check('Customer GET /jobs -> cancelled, pro_id null', s == 200 and b == [{'id': J1, 'status': 'cancelled', 'pro_id': None}], [s, b])
    s, b = call('POST', '/rpc/customer_cancel_job', 'C1', {'p_job_id': J1})
    check('again -> already_cancelled', s == 200 and b == {'ok': False, 'error': 'already_cancelled', 'status': 'cancelled'}, [s, b])
    s, b = call('POST', '/rpc/customer_cancel_job', 'C1', {'p_job_id': J2})
    check('posted job -> ok from posted', s == 200 and b.get('ok') is True and b.get('from_status') == 'posted', [s, b])
    s, b = call('PATCH', f'/jobs?id=eq.{J1}', 'C1', {'status': 'posted'})
    st = owner_sql(f"select status from public.jobs where id = '{J1}';")
    check('Customer PATCH cancelled job -> no change (no new client path)', st == 'cancelled', [s, st])


def main():
    X.build(S.DB)
    conf = tempfile.NamedTemporaryFile('w', suffix='.conf', delete=False)
    os.chmod(conf.name, 0o600)
    conf.write(f'db-uri = "{S.URI}"\ndb-schemas = "public"\ndb-anon-role = "anon"\n'
               f'jwt-secret = "{S.SECRET}"\nserver-host = "127.0.0.1"\nserver-port = {S.PORT}\n')
    conf.close()
    log = open(os.path.join(os.environ.get('HAVEN_LOG_DIR', '/tmp'), 'codey0038-postgrest.log'), 'w')
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
