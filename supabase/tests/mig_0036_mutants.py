#!/usr/bin/env python3
"""MIG-0036 mutants: each mutant is a self-consistent alternative 0036 file (its own function md5
substituted into the guard / post-check), run through mig_0036_realtime_signal_matrix.py in QUICK
mode. Every mutant must be KILLED (matrix exits non-zero, or the mutant file itself refuses).
LOCAL THROWAWAY Postgres only.

Usage: HAVEN_DEPS=... python3 supabase/tests/mig_0036_mutants.py
"""
import os, re, subprocess, sys, tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
F36 = os.path.join(HERE, '..', 'migrations', '0036_realtime_job_signal.sql')
MATRIX = os.path.join(HERE, 'mig_0036_realtime_signal_matrix.py')
PG = os.environ.get('HAVEN_PG', '-h /tmp -p 54329 -U postgres').split()
PIN = '93780698b9417349ca18262d29abd8ab'
SRC = open(F36).read()

MUTANTS = [
    ('M01 drop old-Pro recipient', "v_before := array_remove(array[old.customer_id, old.pro_id], null);", "v_before := array_remove(array[old.customer_id], null);"),
    ('M02 drop new-Pro recipient', "v_after := array_remove(array[new.customer_id, new.pro_id], null);", "v_after := array_remove(array[new.customer_id], null);"),
    ('M03 drop old-customer recipient', "v_before := array_remove(array[old.customer_id, old.pro_id], null);", "v_before := array_remove(array[old.pro_id], null);"),
    ('M04 widen policy to any jobs:user:* topic', "realtime.messages.topic = 'jobs:user:' || (select auth.uid())::text", "realtime.messages.topic like 'jobs:user:%'"),
    ('M05 policy drops the own-topic clause', "    and realtime.messages.topic = 'jobs:user:' || (select auth.uid())::text\n", ""),
    ('M06 policy drops the realtime.topic() clause', "\n    and (select realtime.topic()) = realtime.messages.topic", ""),
    ('M07 policy also allows presence', "realtime.messages.extension = 'broadcast'", "realtime.messages.extension in ('broadcast', 'presence')"),
    ('M08 policy for public (incl. anon)', "  for select\n  to authenticated\n", "  for select\n  to public\n"),
    ('M09 clients may broadcast (INSERT policy)', "-- ── Post-checks", "create policy jobs_signal_client_send on realtime.messages for insert to authenticated with check (realtime.messages.topic = 'jobs:user:' || (select auth.uid())::text);\n\n-- ── Post-checks"),
    ('M10 no exception handler', "  exception when others then\n    raise warning '0036 jobs_signal_parties: job signal skipped (SQLSTATE %)', sqlstate;\n", ""),
    ('M11 public (non-private) broadcast', "        'jobs:user:' || v_uid::text,\n        true);", "        'jobs:user:' || v_uid::text,\n        false);"),
    ('M12 payload leaks lat/lng', "'at', v_at)", "'at', v_at, 'lat', coalesce(new.lat, old.lat), 'lng', coalesce(new.lng, old.lng))"),
    ('M13 payload leaks title', "'at', v_at)", "'at', v_at, 'title', coalesce(new.title, old.title))"),
    ('M14 SECURITY INVOKER', "language plpgsql\nsecurity definer\nset search_path = pg_catalog, public, pg_temp\nset lock_timeout", "language plpgsql\nsecurity invoker\nset search_path = pg_catalog, public, pg_temp\nset lock_timeout"),
    ('M15 no no-op skip', "      if to_jsonb(old) = to_jsonb(new) then\n        return null;\n      end if;\n", ""),
    ('M16 trigger misses DELETE', "after insert or update or delete on public.jobs", "after insert or update on public.jobs"),
    ('M17 removed reported as updated', "        v_reason := 'removed';", "        v_reason := 'updated';"),
    ('M18 status always null', "      v_status := new.status::text;", "      v_status := null;"),
    ('M19 EXECUTE granted to authenticated', "revoke all on function public.jobs_signal_parties() from authenticated;", "grant execute on function public.jobs_signal_parties() to authenticated;"),
    ('M20 wrong topic prefix on send', "        'jobs:user:' || v_uid::text,", "        'job:user:' || v_uid::text,"),
    ('M21 search_path not pinned', "security definer\nset search_path = pg_catalog, public, pg_temp\nset lock_timeout", "security definer\nset lock_timeout"),
    ('M22 no lock_timeout', "set search_path = pg_catalog, public, pg_temp\nset lock_timeout = '1s'\nas $$", "set search_path = pg_catalog, public, pg_temp\nas $$"),
    ('M23 guard skips foreign-policy check', "  if v_other is not null then", "  if false then"),
    ('M24 guard skips BYPASSRLS check', "  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))\n     or not", "  if not"),
    ('M25 trigger only on status/pro_id', "after insert or update or delete on public.jobs", "after insert or update of status, pro_id or delete on public.jobs"),
    ('M26 send only to new parties on update', "      select distinct u from unnest(v_before || v_after) as x(u) order by u", "      select distinct u from unnest(case when tg_op = 'DELETE' then v_before else v_after end) as x(u) order by u"),
]

FULL = {'M23', 'M24'}


def fn_md5(text):
    m = re.search(r'create or replace function public\.jobs_signal_parties\(\).*?\n\$\$;\n', text, re.S)
    if not m:
        return None
    db = 'codey0036_mutmd5_%d' % os.getpid()
    subprocess.run(['psql', *PG, '-X', '-qtA', '-d', 'postgres', '-c', f'drop database if exists {db}'], capture_output=True)
    subprocess.run(['psql', *PG, '-X', '-qtA', '-d', 'postgres', '-c', f'create database {db}'], capture_output=True, check=True)
    try:
        r = subprocess.run(['psql', *PG, '-X', '-qtA', '-d', db], capture_output=True, text=True,
                           input='begin;\n' + m.group(0) + "select md5(replace(prosrc, E'\\r','')) from pg_proc where proname='jobs_signal_parties';\nrollback;\n")
        return r.stdout.strip().splitlines()[-1] if r.stdout.strip() else None
    finally:
        subprocess.run(['psql', *PG, '-X', '-qtA', '-d', 'postgres', '-c', f'drop database if exists {db}'], capture_output=True)


def main():
    killed = 0
    for name, old, new in MUTANTS:
        if old not in SRC:
            print(f'BROKEN {name}: anchor not found')
            sys.exit(2)
        text = SRC.replace(old, new, 1) if not name.startswith(('M16', 'M25')) else SRC.replace(old, new)
        md5 = fn_md5(text)
        if md5 and md5 != PIN:
            text = text.replace(PIN, md5)
        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, dir='/tmp', prefix='codey0036_mut_') as f:
            f.write(text)
            path = f.name
        env = dict(os.environ, HAVEN_0036=path, HAVEN_DB_PREFIX='codey0036_m%d' % os.getpid())
        if name.split()[0] not in FULL:        # guard mutants need the guard group (full mode)
            env['HAVEN_QUICK'] = '1'
        r = subprocess.run([sys.executable, MATRIX], env=env, capture_output=True, text=True)
        os.unlink(path)
        fails = [l for l in r.stdout.splitlines() if l.startswith('FAIL')]
        errs = [l for l in (r.stdout + r.stderr).splitlines() if 'ERROR' in l]
        how = (fails[0] if fails else errs[0] if errs else (r.stdout + r.stderr).strip().splitlines()[-1] if (r.stdout + r.stderr).strip() else '')[:160]
        ok = r.returncode != 0
        killed += ok
        print(f"{'KILLED' if ok else 'SURVIVED'} {name} -> {how}")
    print(f'\nMUTANTS killed {killed}/{len(MUTANTS)}')
    sys.exit(0 if killed == len(MUTANTS) else 1)


if __name__ == '__main__':
    main()
