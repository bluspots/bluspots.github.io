#!/usr/bin/env python3
"""MIG-0037 mutants: each mutant is a self-consistent alternative 0037 file (every changed function's
md5 re-pinned in the guard and post-check), run through mig_0037_live_session_matrix.py (QUICK unless
listed in FULL). Every mutant must be KILLED: the matrix fails, or the mutant file itself refuses.
LOCAL THROWAWAY Postgres only.  Usage: HAVEN_DEPS=... python3 supabase/tests/mig_0037_mutants.py
"""
import hashlib, os, re, subprocess, sys, tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
F37 = os.path.join(HERE, '..', 'migrations', '0037_live_location_session.sql')
MATRIX = os.path.join(HERE, 'mig_0037_live_session_matrix.py')
SRC = open(F37).read()

MUTANTS = [
    ('M01 writer skips the session check', "  if not found then\n    return jsonb_build_object('ok', false, 'error', 'session_stopped');\n  end if;\n", ""),
    ('M02 guard lets every write through', "  if v_sid is null or not exists", "  if false and not exists"),
    ('M03 stop keeps the point', "  with d as (delete from public.job_live_locations l\n              where l.pro_id = v_uid", "  with d as (delete from public.job_live_locations l\n              where false and l.pro_id = v_uid"),
    ('M04 stop keeps the session', "  with d as (delete from public.job_live_sessions s\n              where s.pro_id = v_uid", "  with d as (delete from public.job_live_sessions s\n              where false and s.pro_id = v_uid"),
    ('M05 stop skips the ownership check', "    if not found or v_pro is distinct from v_uid then\n      return jsonb_build_object('ok', false, 'error', 'not_found');\n    end if;\n  else", "  else"),
    ('M06 start skips the ownership check', "  select j.status, j.pro_id into v_status, v_pro from public.jobs j where j.id = p_job_id for share;\n  if not found or v_pro is distinct from v_uid then\n    return jsonb_build_object('ok', false, 'error', 'not_found');\n  end if;\n  if v_status <> 'en_route' then\n    return jsonb_build_object('ok', false, 'error', 'tracking_not_active');\n  end if;\n  insert into public.job_live_sessions",
     "  select j.status, j.pro_id into v_status, v_pro from public.jobs j where j.id = p_job_id for share;\n  if not found then\n    return jsonb_build_object('ok', false, 'error', 'not_found');\n  end if;\n  if v_status <> 'en_route' then\n    return jsonb_build_object('ok', false, 'error', 'tracking_not_active');\n  end if;\n  insert into public.job_live_sessions"),
    ('M07 start on any status', "  if v_status <> 'en_route' then\n    return jsonb_build_object('ok', false, 'error', 'tracking_not_active');\n  end if;\n  insert into public.job_live_sessions", "  insert into public.job_live_sessions"),
    ('M08 no end-session trigger', "create trigger jobs_end_live_session\n  after update", "create trigger jobs_end_live_session_x\n  after update"),
    ('M09 end-session only on status change', "       or new.pro_id is distinct from old.pro_id\n             or new.customer_id is distinct from old.customer_id))\n  execute function public.jobs_end_live_session();", "))\n  execute function public.jobs_end_live_session();"),
    ('M10 start granted to anon', "grant execute on function public.pro_start_live_location(uuid) to authenticated;", "grant execute on function public.pro_start_live_location(uuid) to authenticated, anon;"),
    ('M11 writer reads the session without a lock', "   where s.job_id = p_job_id and s.pro_id = v_uid and s.session_id = p_session_id\n     for share;", "   where s.job_id = p_job_id and s.pro_id = v_uid and s.session_id = p_session_id;"),
    ('M12 stop signal to the Pro', "'job_changed', 'jobs:user:' || r.customer_id::text, true);", "'job_changed', 'jobs:user:' || v_uid::text, true);"),
    ('M13 stop signal even when nothing stopped', "            where j.id = any (v_jobs || v_pts) order by j.id loop", "            where j.id = coalesce(p_job_id, j.id) and (j.pro_id = v_uid or j.id = any (v_jobs || v_pts)) order by j.id loop"),
    ('M14 stop signal without exception handler', "    exception when others then\n      raise warning '0037 pro_stop_live_location: customer signal skipped (SQLSTATE %)', sqlstate;\n", ""),
    ('M15 no one-time cleanup', "delete from public.job_live_locations l\n where not exists", "select 1 from public.job_live_locations l\n where not exists"),
    ('M16 stop ok for anyone (c-min style)', "    if not found or v_pro is distinct from v_uid then\n      return jsonb_build_object('ok', false, 'error', 'not_found');\n    end if;\n  else", "    if not found or v_pro is distinct from v_uid then\n      return jsonb_build_object('ok', true, 'stopped', false);\n    end if;\n  else"),
    ('M17 trigger fn executable by authenticated', "revoke all on function public.jobs_end_live_session() from public, anon, authenticated, service_role;", "revoke all on function public.jobs_end_live_session() from public, anon, service_role;"),
    ('M18 stop search_path not pinned', "create or replace function public.pro_stop_live_location(p_job_id uuid default null)\nreturns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer\nset search_path = pg_catalog, public, pg_temp\n", "create or replace function public.pro_stop_live_location(p_job_id uuid default null)\nreturns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer\n"),
    ('M19 session table without RLS', "alter table public.job_live_sessions enable row level security;", "alter table public.job_live_sessions disable row level security;"),
    ('M20 guard on INSERT only (ON CONFLICT update path open)', "  before insert or update on public.job_live_locations", "  before insert on public.job_live_locations"),
    ('M21 start keeps the earlier session', "  on conflict (job_id) do update\n     set pro_id = excluded.pro_id, session_id = excluded.session_id, started_at = excluded.started_at;", "  on conflict (job_id) do nothing;"),
    ('M22 guard ignores the session id value', "and s.session_id::text = v_sid) then", ") then"),
    ('M23 guard skips the 0032 body check', "  if v is distinct from 'get_job_live_location(uuid)=cc207fcdd0e2d277bbbcd3a7852dbf75 jobs_discard_live_location()=b8398f9d39127d4e6fb6c5a4082cf5d4 pro_update_live_location(uuid,double precision,double precision,timestamp with time zone)=d94c79fddff0328da6e3d4e04ff734e4' then\n    raise exception '0037: the 0032", "  if false then\n    raise exception '0037: the 0032"),
    ('M24 guard skips the BYPASSRLS check', "  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))\n     or not has_table_privilege(current_user, 'public.jobs', 'trigger')\n     or not has_table_privilege(current_user, 'public.job_live_locations', 'trigger')\n     or not has_schema_privilege(current_user, 'public', 'create') then", "  if false then"),
    ('M25 stop also wipes other Pros\' points on the job', "              where l.pro_id = v_uid and (p_job_id is null or l.job_id = p_job_id) returning l.job_id)", "              where (l.pro_id = v_uid or p_job_id is not null) and (p_job_id is null or l.job_id = p_job_id) returning l.job_id)"),
    ('M27 sign-out stop takes no jobs lock (LOW-1)', "     order by j.id\n       for share of j;\n", "     order by j.id;\n"),
    ('M26 writer forgets to set the session GUC', "  perform set_config('haven.live_session_id', p_session_id::text, true);\n", ""),
]
FULL = {'M15', 'M23', 'M24'}


def bodies(text):
    return {m.group(1): hashlib.md5(m.group(2).replace('\r', '').encode()).hexdigest()
            for m in re.finditer(r'create or replace function public\.(\w+)\(.*?\nas \$\$(.*?)\$\$;', text, re.S)}


def main():
    base = bodies(SRC)
    killed = 0
    for name, old, new in MUTANTS:
        if old not in SRC:
            print(f'BROKEN {name}: anchor not found'); sys.exit(2)
        text = SRC.replace(old, new)
        for fn, m in bodies(text).items():
            if m != base[fn]:
                text = text.replace(base[fn], m)
        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, dir='/tmp', prefix='codey0037_mut_') as f:
            f.write(text); path = f.name
        env = dict(os.environ, HAVEN_0037=path, HAVEN_DB_PREFIX='codey0037_m%d' % os.getpid())
        if name.split()[0] not in FULL:
            env['HAVEN_QUICK'] = '1'
        r = subprocess.run([sys.executable, '-B', MATRIX], env=env, capture_output=True, text=True)
        os.unlink(path)
        fails = [l for l in r.stdout.splitlines() if l.startswith('FAIL')]
        errs = [l for l in (r.stdout + r.stderr).splitlines() if 'ERROR' in l]
        how = (fails[0] if fails else errs[0] if errs else '')[:150]
        ok = r.returncode != 0
        killed += ok
        print(f"{'KILLED' if ok else 'SURVIVED'} {name} -> {how}", flush=True)
    print(f'\nMUTANTS killed {killed}/{len(MUTANTS)}')
    sys.exit(0 if killed == len(MUTANTS) else 1)


if __name__ == '__main__':
    main()
