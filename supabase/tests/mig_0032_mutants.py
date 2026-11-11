#!/usr/bin/env python3
"""MIG-0032 mutation check. LOCAL THROWAWAY Postgres only.

Each mutant is 0032 with one deliberate weakening. The matrix
(mig_0032_live_location_matrix.py, HAVEN_QUICK=1) must FAIL on every mutant.
Mutant files are written to a temp dir (never into supabase/migrations).
Usage: same env as the matrix (HAVEN_PG, HAVEN_0027, HAVEN_0030). Exit 0 only if every mutant is killed.
"""
import os, re, subprocess, sys, tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
F32 = os.path.join(HERE, '..', 'migrations', '0032_job_live_location.sql')
SRC = open(F32).read()
WRITE_STATUS = """  if v_status <> 'en_route' then
    return jsonb_build_object('ok', false, 'error', 'tracking_not_active');
  end if;
  -- NaN"""
READ_STATUS = """  if v_status <> 'en_route' then
    return jsonb_build_object('ok', false, 'error', 'tracking_not_active');
  end if;
  select x.lat"""
MUTANTS = [
    ('M1 write: no en_route status check', WRITE_STATUS, '  -- NaN'),
    ('M2 read: no en_route status check', READ_STATUS, '  select x.lat'),
    ('M3 read: owner check replaced by "assigned Pro or owner"',
     'if not found or v_customer is distinct from v_uid then',
     'if not found or (v_customer is distinct from v_uid and v_pro is distinct from v_uid) then'),
    ('M4 write: no FOR SHARE lock on the job row', '   where j.id = p_job_id\n     for share;', '   where j.id = p_job_id;'),
    ('M5 trigger WHEN only on arrived',
     "  when (old.status = 'en_route'\n        and (new.status is distinct from 'en_route'\n             or new.pro_id is distinct from old.pro_id\n             or new.customer_id is distinct from old.customer_id))",
     "  when (old.status = 'en_route' and new.status = 'arrived')"),
    ('M6 table granted to authenticated (after the post-checks)', '\ncommit;\n\n-- ── Rollback',
     '\ncommit;\ngrant select, insert, update, delete on public.job_live_locations to authenticated;\n\n-- ── Rollback'),
    ('M7 rate limit removed', "   where l.received_at <= now() - interval '4 seconds'\n", ''),
    ('M8a write: distinct error for not-assigned vs missing',
     "  if not found or v_pro is distinct from v_uid then\n    return jsonb_build_object('ok', false, 'error', 'not_found');",
     "  if not found then\n    return jsonb_build_object('ok', false, 'error', 'not_found');\n  end if;\n  if v_pro is distinct from v_uid then\n    return jsonb_build_object('ok', false, 'error', 'not_assigned');"),
    ('M8b read: distinct error for not-owner vs missing',
     "  if not found or v_customer is distinct from v_uid then\n    return jsonb_build_object('ok', false, 'error', 'not_found');",
     "  if not found then\n    return jsonb_build_object('ok', false, 'error', 'not_found');\n  end if;\n  if v_customer is distinct from v_uid then\n    return jsonb_build_object('ok', false, 'error', 'not_owner');"),
    ('M9 read returns stale coordinates (no 5-minute cutoff)', "  if l.received_at < now() - interval '5 minutes' then", "  if false then"),
    # extra mutants beyond the contract's list
    ('X1 read: no pro_id match (backstop removed)', '   where x.job_id = p_job_id\n     and x.pro_id = v_pro;', '   where x.job_id = p_job_id;'),
    ('X2 write: (0, 0) accepted', '  if v_lat = 0 and v_lng = 0 then', '  if false then'),
    ('X3 write: captured_at not clamped', "     and p_captured_at >= now() - interval '2 minutes'\n     and p_captured_at <= now() + interval '30 seconds' then",
     ' then'),
    ('X4 trigger function body does nothing', '  delete from public.job_live_locations where job_id = new.id;\n  return null;', '  return null;'),
    ('X5 table rights left to service_role', 'revoke all on table public.job_live_locations from service_role;\n', ''),
    ('X6 write also copies the point into jobs.lat/lng',
     "  returning l.received_at into v_written;",
     "  returning l.received_at into v_written;\n  update public.jobs set lat = v_lat, lng = v_lng where id = p_job_id;"),
    ('X7 write: lng range check removed',
     "     or not (p_lat >= -90 and p_lat <= 90)\n     or not (p_lng >= -180 and p_lng <= 180) then",
     "     or not (p_lat >= -90 and p_lat <= 90) then"),
    ('X8 service_role EXECUTE revoke omitted (post-check must refuse)',
     "revoke all on function public.pro_update_live_location(uuid, double precision, double precision, timestamptz) from service_role;\n"
     "grant execute on function public.pro_update_live_location", "grant execute on function public.pro_update_live_location"),
    ('X9 service_role EXECUTE revokes AND their post-check omitted (tests must catch)', None, None),
    ('X10 trigger without customer_id in UPDATE OF', 'after update of status, pro_id, customer_id on public.jobs', 'after update of status, pro_id on public.jobs'),
    ('X11 trigger without customer_id in WHEN',
     "             or new.pro_id is distinct from old.pro_id\n             or new.customer_id is distinct from old.customer_id))",
     "             or new.pro_id is distinct from old.pro_id))"),
]


def x9(src):
    out = src.replace("revoke all on function public.pro_update_live_location(uuid, double precision, double precision, timestamptz) from service_role;\n", '', 1)
    out = out.replace("revoke all on function public.get_job_live_location(uuid) from service_role;\n", '', 1)
    a = out.index('  -- F4: service_role has no EXECUTE on the RPCs')
    b = out.index('  end if;', a) + len('  end if;\n')
    return out[:a] + out[b:]


def main():
    tmp = tempfile.mkdtemp(prefix='codey0032_mut_')
    killed = 0
    for i, (label, old, new) in enumerate(MUTANTS):
        if old is None:
            mut = x9(SRC)
        else:
            assert SRC.count(old) >= 1, f'{label}: anchor not found'
            mut = SRC.replace(old, new, 1)
        assert mut != SRC
        p = os.path.join(tmp, f'm{i}.sql')
        open(p, 'w').write(mut)
        env = dict(os.environ, HAVEN_0032=p, HAVEN_QUICK='1', HAVEN_DB_PREFIX=os.environ.get('HAVEN_MUT_PREFIX', 'codey0032_mut') + f'{i}_{os.getpid()}')
        r = subprocess.run([sys.executable, os.path.join(HERE, 'mig_0032_live_location_matrix.py')], env=env,
                           capture_output=True, text=True)
        fails = [l for l in r.stdout.splitlines() if l.startswith('FAIL')]
        tot = [l for l in r.stdout.splitlines() if l.startswith('TOTAL')]
        ok = r.returncode != 0
        killed += ok
        first = re.sub(r':.*', '', fails[0])[:110] if fails else (r.stderr.strip().splitlines() or ['(no output)'])[-1][:110]
        print(f"{'KILLED' if ok else 'SURVIVED'} {label}: {len(fails)} failing checks; {tot[0] if tot else ''}; first: {first}")
        os.unlink(p)
    os.rmdir(tmp)
    print(f'\nMUTANTS {len(MUTANTS)} KILLED {killed} SURVIVED {len(MUTANTS) - killed}')
    sys.exit(0 if killed == len(MUTANTS) else 1)


if __name__ == '__main__':
    main()
