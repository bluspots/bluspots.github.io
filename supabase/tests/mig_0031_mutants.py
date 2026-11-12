#!/usr/bin/env python3
"""Mutation test for migration 0031 (jobs_validate_posting_amounts). LOCAL THROWAWAY Postgres only.
Each mutant edits the migration text, re-pins the body md5 so the post-check passes, and runs the matrix in
quick mode; every mutant must make the matrix fail.  Usage: HAVEN_DEPS=... HAVEN_0036_TESTS=... python3 -B supabase/tests/mig_0031_mutants.py
Optional HAVEN_MUTANTS=M01,M02 runs a subset."""
import hashlib, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_PATH = os.path.join(os.path.dirname(HERE), 'migrations', '0031_posting_amounts_validation.sql')
MATRIX = os.path.join(HERE, 'mig_0031_posting_amounts_matrix.py')
SRC = open(SRC_PATH).read()
MUTANTS = [
    ('M01 authenticated treated as privileged', "current_user not in ('anon', 'authenticated');", "current_user not in ('anon');"),
    ('M02 no margin check', '  if new.margin_rate_bps is distinct from margin_bps then', '  if false and new.margin_rate_bps is distinct from margin_bps then'),
    ('M03 payout rounded up', '(new.fixed_customer_labor_price_cents::bigint * (10000 - margin_bps) / 10000)::integer', '((new.fixed_customer_labor_price_cents::bigint * (10000 - margin_bps) + 9999) / 10000)::integer'),
    ('M04 no payout check', '  if new.fixed_pro_labor_payout_cents is distinct from', '  if false and new.fixed_pro_labor_payout_cents is distinct from'),
    ('M05 inspection 4500 allowed on any job', '(case when new.requires_diagnosis then 4500 else 0 end)', '(case when new.requires_diagnosis or new.inspection_fee_cents = 4500 then 4500 else 0 end)'),
    ('M06 any inspection fee on a diagnosis job', '(case when new.requires_diagnosis then 4500 else 0 end)', '(case when new.requires_diagnosis then new.inspection_fee_cents else 0 end)'),
    ('M07 no emergency check', '  if not new.emergency\n', '  if false and not new.emergency\n'),
    ('M08 convenience fee not checked', '  if new.convenience_fee_cents is distinct from 0\n     or', '  if false\n     or'),
    ('M09 tip not checked', '     or new.tip_amount_cents is distinct from 0\n', ''),
    ('M10 reimbursed not checked', '     or new.materials_reimbursed_cents is distinct from 0\n', ''),
    ('M11 estimate not checked', '     or new.materials_estimate_cents is distinct from 0\n', ''),
    ('M12 privileged callers checked too (owner/service_role repair blocked)', '  if privileged then\n    return new;\n  end if;\n', ''),
    ('M13 margin from the row (client-set)', 'margin_bps constant integer := 2000;', 'margin_bps integer := coalesce(new.margin_rate_bps, 2000);'),
]


def body_md5(text):
    m = re.search(r'create or replace function public\.jobs_validate_posting_amounts\(\).*?\nas \$\$(.*?)\$\$;', text, re.S)
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
        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, dir='/tmp', prefix='codey0031_mut_') as f:
            f.write(text); path = f.name
        env = dict(os.environ, HAVEN_0031=path, HAVEN_DB_PREFIX='codey0031_m%d' % os.getpid(), HAVEN_QUICK='1')
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
