#!/usr/bin/env python3
"""Mutation test for migration 0039 v2 (status guard, no self-assignment, pro_claim_job self-claim check). LOCAL THROWAWAY Postgres only.
Each mutant edits the migration text, re-pins the body md5 so the post-check passes, and runs the matrix in
quick mode; every mutant must make the matrix fail.  Usage: HAVEN_DEPS=... HAVEN_0036_TESTS=... python3 -B supabase/tests/mig_0039_mutants.py
Optional HAVEN_MUTANTS=M01,M02 runs a subset."""
import hashlib, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_PATH = os.path.join(os.path.dirname(HERE), 'migrations', '0039_customer_status_guard.sql')
MATRIX = os.path.join(HERE, 'mig_0039_customer_status_guard_matrix.py')
SRC = open(SRC_PATH).read()
MUTANTS = [
    # rule 1a: the job's Customer (v2: no Pro exemption; MED-1 source limits)
    ('M01 authenticated treated as privileged', "if current_user not in ('anon', 'authenticated') then", "if current_user not in ('anon') then"),
    # M02 (Customer cancel from any status) RETIRED as EQUIVALENT: the only RLS path to 'cancelled' for a Customer is
    # the 0010/0023 cancel policy (posted, no Pro, own job; WITH CHECK status = 'cancelled'), and every other Customer
    # policy's WITH CHECK pins a different target, so widening the cancel source changes no outcome (it SURVIVED in t676; the baseline shows no Customer '-> cancelled' gap). The rule stays as defence in depth.
    ('M03 Customer approve/decline materials from any status', "(new.status in ('materials_approved', 'materials_declined') and old.status = 'materials_requested')", "(new.status in ('materials_approved', 'materials_declined'))"),
    ('M04 Customer inspection_completed from any status', "(new.status = 'inspection_completed' and old.status in ('diagnosing', 'materials_requested'))", "(new.status = 'inspection_completed')"),
    ('M05 v1 Pro exemption restored (HIGH-1)', "if v_uid is not null and v_uid = old.customer_id then", "if v_uid is not null and v_uid = old.customer_id and old.pro_id is distinct from v_uid then"),
    ('M06 Customer may also complete', "or (new.status = 'inspection_completed' and old.status in ('diagnosing', 'materials_requested'))) then",
     "or (new.status = 'inspection_completed' and old.status in ('diagnosing', 'materials_requested')) or new.status = 'complete') then"),
    ('M07 same-status updates refused', '  if new.status is not distinct from old.status then\n    return new;\n  end if;\n', ''),
    ('M08 status trigger on INSERT only', '  before update of status on public.jobs', '  before insert on public.jobs'),
    # rule 1b: LOW-1 complete only from in_progress
    ('M09 Pro complete from any status', "if new.status = 'complete' and old.status <> 'in_progress' then", "if false then"),
    ('M10 Pro complete from in_progress or arrived', "if new.status = 'complete' and old.status <> 'in_progress' then", "if new.status = 'complete' and old.status not in ('in_progress', 'arrived') then"),
    # rule 2: IV.2 no self-assignment, every caller
    # (Dropping the tg_op = 'INSERT' term is EQUIVALENT: on INSERT OLD is NULL, so 'new.pro_id is distinct from
    #  old.pro_id' is already true; t676 run showed it surviving. M11 removes INSERT from the trigger instead.)
    ('M11 IV.2 trigger skips INSERT', '  before insert or update of pro_id, customer_id on public.jobs', '  before update of pro_id, customer_id on public.jobs'),
    ('M12 IV.2 ignores a customer_id change', "\n          or new.customer_id is distinct from old.customer_id) then", ") then"),
    ('M13 IV.2 only warns', "    raise exception 'A job cannot be claimed by or assigned to the account that posted it'", "    raise notice 'A job cannot be claimed by or assigned to the account that posted it'"),
    ('M14 IV.2 for client roles only', "begin\n  if new.pro_id is not null\n     and new.pro_id = new.customer_id",
     "begin\n  if current_user in ('anon', 'authenticated') and new.pro_id is not null\n     and new.pro_id = new.customer_id"),
    # rule 3: pro_claim_job self-claim check
    ('M15 claim lookup without the customer check (C1 order)', "    and j.customer_id is distinct from v_pro;  -- 0039 (IV.2): nobody claims a job they posted\n", ";\n"),
    ('M16 claim without both customer checks (trigger only)', [("    and j.customer_id is distinct from v_pro;  -- 0039 (IV.2): nobody claims a job they posted\n", ";\n"),
                                                              ("    and j.customer_id is distinct from v_pro\n  returning j.* into claimed;", "  returning j.* into claimed;")]),
]


def bodies(text):
    return {m.group(1): hashlib.md5(m.group(2).replace('\r', '').encode()).hexdigest()
            for m in re.finditer(r'create or replace function public\.(\w+)\(.*?\nas \$\$(.*?)\$\$;', text, re.S)}


def main():
    base = bodies(SRC)
    only = [x for x in os.environ.get('HAVEN_MUTANTS', '').split(',') if x]
    sel = [m for m in MUTANTS if not only or m[0].split()[0] in only]
    killed = 0
    for name, old, *rest in sel:
        pairs = old if isinstance(old, list) else [(old, rest[0])]
        text = SRC
        for o, n in pairs:
            if text.count(o) != 1:
                print(f'BROKEN {name}: anchor found {text.count(o)} times'); sys.exit(2)
            text = text.replace(o, n)
        for fn, m in bodies(text).items():
            if m != base[fn]:
                text = text.replace(base[fn], m)
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
