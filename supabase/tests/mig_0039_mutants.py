#!/usr/bin/env python3
"""Mutation test for migration 0039 (jobs_customer_status_guard). LOCAL THROWAWAY Postgres only.
Each mutant edits the migration text, re-pins the body md5 so the post-check passes, and runs the matrix in
quick mode; every mutant must make the matrix fail.  Usage: HAVEN_DEPS=... HAVEN_0036_TESTS=... python3 -B supabase/tests/mig_0039_mutants.py
Optional HAVEN_MUTANTS=M01,M02 runs a subset."""
import hashlib, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_PATH = os.path.join(os.path.dirname(HERE), 'migrations', '0039_customer_status_guard.sql')
MATRIX = os.path.join(HERE, 'mig_0039_customer_status_guard_matrix.py')
SRC = open(SRC_PATH).read()
MUTANTS = [
    ('M01 authenticated treated as privileged', "if current_user not in ('anon', 'authenticated') then", "if current_user not in ('anon') then"),
    ('M02 complete allowed', "'in_progress', 'complete')", "'in_progress')"),
    ('M03 in_progress allowed', "'materials_requested', 'in_progress', 'complete')", "'materials_requested', 'complete')"),
    ('M04 arrived allowed', "'en_route', 'arrived', 'diagnosing'", "'en_route', 'diagnosing'"),
    ('M05 en_route allowed', "('posted', 'en_route', ", "('posted', "),
    # M06 'back to posted allowed' retired as EQUIVALENT: on every tested stack the Customer's X -> posted write is
    # already refused without 0039 (matrix baseline lists no '->posted' move); 'posted' stays in 0039 as defence in depth.
    ('M07 diagnosing allowed', "'arrived', 'diagnosing', 'materials_requested'", "'arrived', 'materials_requested'"),
    ('M08 materials_requested allowed', "'diagnosing', 'materials_requested', 'in_progress'", "'diagnosing', 'in_progress'"),
    ('M09 cancelled refused too', "'in_progress', 'complete')", "'in_progress', 'complete', 'cancelled')"),
    ('M10 materials_approved refused too', "'in_progress', 'complete')", "'in_progress', 'complete', 'materials_approved')"),
    ('M11 the assigned Pro refused too', 'and old.pro_id is distinct from v_uid\n', '\n'),
    # M12 'any caller refused, not only the Customer' retired as EQUIVALENT: jobs UPDATE RLS already limits client
    # writers to the job's Customer and its assigned Pro, and the assigned Pro is exempted by the next clause.
    ('M13 trigger on INSERT only', '  before update of status on public.jobs', '  before insert on public.jobs'),
    ('M14 same-status updates refused', '  if new.status is not distinct from old.status then\n    return new;\n  end if;\n', '')
]


def body_md5(text):
    m = re.search(r'create or replace function public\.jobs_customer_status_guard\(\).*?\nas \$\$(.*?)\$\$;', text, re.S)
    return hashlib.md5(m.group(1).replace('\r', '').encode()).hexdigest()


def main():
    base = body_md5(SRC)
    only = [x for x in os.environ.get('HAVEN_MUTANTS', '').split(',') if x]
    sel = [m for m in MUTANTS if not only or m[0].split()[0] in only]
    killed = 0
    for name, old, new in sel:
        if old not in SRC:
            print(f'BROKEN {name}: anchor not found'); sys.exit(2)
        text = SRC.replace(old, new, 1)
        m = body_md5(text)
        if m != base:
            text = text.replace(base, m)
        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, dir='/tmp', prefix='codey0039_mut_') as f:
            f.write(text); path = f.name
        env = dict(os.environ, HAVEN_0039=path, HAVEN_DB_PREFIX='codey0039_m%d' % os.getpid(), HAVEN_QUICK='1')
        r = subprocess.run([sys.executable, '-B', MATRIX], env=env, capture_output=True, text=True)
        os.unlink(path)
        fails = [l for l in r.stdout.splitlines() if l.startswith('FAIL')]
        errs = [l for l in (r.stdout + r.stderr).splitlines() if 'ERROR' in l or 'failed' in l]
        how = (fails[0] if fails else errs[0] if errs else '')[:150]
        ok = r.returncode != 0
        killed += ok
        print(f"{'KILLED' if ok else 'SURVIVED'} {name} -> {how}", flush=True)
    print(f'\nMUTANTS killed {killed}/{len(sel)}')
    sys.exit(0 if killed == len(sel) else 1)


if __name__ == '__main__':
    main()
