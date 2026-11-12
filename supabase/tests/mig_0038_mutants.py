#!/usr/bin/env python3
"""MIG-0038 mutants: each mutant is a self-consistent alternative 0038 file (function md5 re-pinned),
run through mig_0038_customer_cancel_matrix.py (QUICK unless in FULL). Every mutant must be KILLED.
LOCAL THROWAWAY Postgres only.  Usage: HAVEN_DEPS=... python3 supabase/tests/mig_0038_mutants.py
"""
import hashlib, os, re, subprocess, sys, tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
F38 = os.path.join(HERE, '..', 'migrations', '0038_customer_cancel_job.sql')
MATRIX = os.path.join(HERE, 'mig_0038_customer_cancel_matrix.py')
SRC = open(F38).read()
MUTANTS = [
    ('N01 no customer_id filter', "where x.id = p_job_id and x.customer_id = v_uid for update;", "where x.id = p_job_id for update;"),
    ('N02 no row lock', "where x.id = p_job_id and x.customer_id = v_uid for update;", "where x.id = p_job_id and x.customer_id = v_uid;"),
    ('N03 diagnosing allowed', "    when j.status in ('diagnosing', 'in_progress') then 'work_started'\n", "    when j.status = 'in_progress' then 'work_started'\n    when j.status = 'diagnosing' and j.pro_id is not null then null\n"),
    ('N04 payment_snapshot treated as money', "       or exists (select 1 from public.earnings_statements e where e.job_id = j.id) then", "       or exists (select 1 from public.earnings_statements e where e.job_id = j.id)\n       or (r ->> 'payment_snapshot') is not null then"),
    ('N05 Pro kept on the cancelled job', "set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), pro_id = null, accepted_at = null", "set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), accepted_at = null"),
    ('N06 no status event', "  insert into public.job_status_events (job_id, from_status, to_status, actor_role, actor_id)\n  values (j.id, j.status, 'cancelled', 'customer', v_uid);\n", ""),
    ('N07 event actor system', "values (j.id, j.status, 'cancelled', 'customer', v_uid);", "values (j.id, j.status, 'cancelled', 'system', null);"),
    ('N08 EXECUTE to anon', "grant execute on function public.customer_cancel_job(uuid) to authenticated;", "grant execute on function public.customer_cancel_job(uuid) to authenticated, anon;"),
    ('N09 search_path not pinned', "volatile\nsecurity definer\nset search_path = pg_catalog, public, pg_temp\nas $$", "volatile\nsecurity definer\nas $$"),
    ('N10 tips ignored', "       or exists (select 1 from public.tips t where t.job_id = j.id and t.status <> 'not_added')\n", ""),
    ('N11 earnings statement ignored', "       or exists (select 1 from public.materials_receipts m where m.job_id = j.id)\n       or exists (select 1 from public.earnings_statements e where e.job_id = j.id) then", "       or exists (select 1 from public.materials_receipts m where m.job_id = j.id) then"),
    ('N12 pending materials request row ignored', "    if exists (select 1 from public.materials_requests m where m.job_id = j.id and m.status = 'pending')\n       or", "    if"),
    ('N13 re-cancel allowed', "    when j.status = 'cancelled' then 'already_cancelled'\n", "    when j.status = 'cancelled' then null\n"),
    ('N14 distinct error for non-owners', "  select * into j from public.jobs x where x.id = p_job_id and x.customer_id = v_uid for update;\n  if not found then",
     "  perform 1 from public.jobs x where x.id = p_job_id and x.customer_id is distinct from v_uid;\n  if found then\n    return jsonb_build_object('ok', false, 'error', 'not_owner');\n  end if;\n  select * into j from public.jobs x where x.id = p_job_id and x.customer_id = v_uid for update;\n  if not found then"),
    ('N15 accepted_at kept', ", pro_id = null, accepted_at = null\n   where id = j.id;", ", pro_id = null\n   where id = j.id;"),
    ('N16 guard skips the existing-body check', "  if v is not null and v <> '", "  if false and v <> '"),
    ('N17 SECURITY INVOKER', "volatile\nsecurity definer\nset search_path = pg_catalog, public, pg_temp\nas $$", "volatile\nsecurity invoker\nset search_path = pg_catalog, public, pg_temp\nas $$"),
    ('N18 inspection_completed allowed', "    when j.status = 'inspection_completed' then 'inspection_fee_due'\n", "    when j.status = 'inspection_completed' and j.pro_id is not null then null\n"),
    ('N19 approved amount ignored', "       or coalesce((r ->> 'materials_approved_cents')::numeric, 0) > 0\n       or (r ->> 'materials_approved_at') is not null then", " then"),
    ('N20 not_allowed when Pro missing ignored', "    when j.status in ('en_route', 'arrived') and j.pro_id is not null then null", "    when j.status in ('en_route', 'arrived') then null"),
]
FULL = {'N16'}


def body_md5(text):
    m = re.search(r'create or replace function public\.customer_cancel_job\(.*?\nas \$\$(.*?)\$\$;', text, re.S)
    return hashlib.md5(m.group(1).replace('\r', '').encode()).hexdigest()


def main():
    base = body_md5(SRC)
    killed = 0
    for name, old, new in MUTANTS:
        if old not in SRC:
            print(f'BROKEN {name}: anchor not found'); sys.exit(2)
        text = SRC.replace(old, new, 1)
        m = body_md5(text)
        if m != base:
            text = text.replace(base, m)
        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, dir='/tmp', prefix='codey0038_mut_') as f:
            f.write(text); path = f.name
        env = dict(os.environ, HAVEN_0038=path, HAVEN_DB_PREFIX='codey0038_m%d' % os.getpid())
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
