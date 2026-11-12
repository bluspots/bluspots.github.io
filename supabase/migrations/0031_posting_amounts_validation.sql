-- Haven shared backend — server-side financial validation at posting (Phase 1B)
-- Number: 0031 (after 0029_inspection_fee_lock.sql; 0030 is the separate
-- job-board privacy migration and is not needed by this file).
-- Pro has no migrations folder. This is the one paste for both apps.
--
-- Founder decision 2026-10-23, item 7: "Implement server-side financial
-- validation at posting as a separately reviewed migration after 0029."
-- 0029 locks every amount once a job is posted (UPDATE); 0031 checks the
-- amounts a client writes when it posts the job (INSERT). Not bundled with
-- 0029; reviewed, tested and approved on its own.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor and run
-- it as ONE single run (one query, one session). The rollback block below
-- is also one block, one run. Paste as the database owner. Do not apply it
-- from the app, from CI, or from an agent.
--
-- STATUS (refreshed 2026-11-12, t674): DRAFT, NOT APPLIED, do not merge. Paste only
-- after the founder authorizes it in his own words. This is CoS audit finding F2
-- (customer-chosen amounts at INSERT); 0029 closes F1 (amounts rewritable after posting).
--
-- PASTE ORDER on today's production (0027, 0030, 0032, FCC 0034/0035/0035a and 0036
-- are already live; 0025 is NOT): 0025 (#91 paste section) -> 0026 (#85) -> 0028 (#89)
-- -> 0029 (#90 eff1315e, haven-version 0029-v2) -> checks/0031a (READY) -> this file
-- -> checks/0031b (LIVE). Rollback: supabase/rollback/0031_posting_amounts_validation_rollback.sql.
-- Contract: supabase/contracts/POSTING_AMOUNTS_CONTRACT.md.
-- RE-RUN (t674 guards, section 0): a no-op when the installed
-- public.jobs_validate_posting_amounts() already has this file's body (CR-insensitive md5);
-- refused, nothing changed, when another body is installed, when 0029-v2 or its trigger
-- is missing, when a jobs money column is missing, or when not run as the owner.
--
-- WHAT IT DOES. A BEFORE INSERT trigger on public.jobs. For non-privileged
-- callers (current_user anon or authenticated: the apps, PostgREST and
-- direct API requests) every posted row must carry exactly the amounts the
-- contract fixes at posting; anything else is refused with 42501 and
-- nothing is written:
--   1. (PENDING, not checked) The labor price is NOT checked for > $0
--      (founder decision 2026-10-23 20:58 ET, 5b): the refusal is held until
--      the custom-pricing path is documented, so custom-priced jobs are not
--      broken. The table's own CHECK (>= 0) still applies.
--   2. margin_rate_bps = 2000, the current founder-set margin (20% of the
--      listed labor price). Margin adjustments apply to FUTURE jobs only
--      (founder decision 2026-10-23, item 9): a new rate is a new
--      migration that changes this constant; it changes only jobs posted
--      after it is pasted and never rewrites a posted job (0029 locks the
--      stored margin, price and payout).
--   3. fixed_pro_labor_payout_cents = floor(price * (10000 - margin) /
--      10000), i.e. floor(price * 80 / 100) at 2000 bps: exactly what the
--      Customer app computes (index.html postJob) and "exactly what the
--      pro receives".
--   4. inspection_fee_cents = 4500 when requires_diagnosis, else 0 (the
--      hard-locked $45 Inspection Visit; standard jobs carry none).
--   5. A non-emergency job carries no emergency fee: emergency_fee_cents
--      = 0 when emergency is false ("A non-emergency job cannot carry an
--      emergency fee"). On an emergency job the AMOUNT is NOT validated
--      (founder decision 2026-10-23 20:58 ET, 5a: the app's $35 is not
--      approved; the amount is pending a founder decision, in comparison
--      with the $10 ASAP surcharge). The table's CHECK (>= 0) still applies.
--   6. Nothing is pre-charged or pre-paid at posting:
--      convenience_fee_cents = 0, tip_amount_cents = 0,
--      materials_reimbursed_cents = 0, materials_estimate_cents = 0,
--      materials_approved_cents is null. (0026's INSERT branch, which
--      fires first, already sets materials_approved_cents / _at to null and
--      both seq columns to 0 for clients; 0031 refuses a non-null value as
--      a second layer if that trigger is ever missing or disabled.)
-- Every check compares integers the client sent; nothing is rewritten.
-- requires_diagnosis itself (category -> diagnosis mapping) is NOT
-- validated here and no category list is added (founder decision
-- 2026-10-23 20:58 ET, 5c): it waits for the shared category taxonomy.
-- Until then a client chooses requires_diagnosis, and check 4 only ties
-- the $45 fee to that flag. status = 'posted' and pro_id is null at posting are
-- already enforced by RLS (jobs_insert_posted_only).
--
-- PRIVILEGED callers (current_user not in ('anon', 'authenticated'): the
-- SQL editor / postgres, service_role, Edge Functions with the service key)
-- skip every check, for admin repair and imports.
--
-- EXISTING ROWS. 0031 checks INSERT only. It does not read, count or
-- rewrite any existing job. Legacy diagnosis jobs posted with a $0
-- inspection fee keep it: no backfill (founder decision 2026-10-23, item
-- 8: count them read-only before proposing any correction; see Verify).
-- No column, policy, grant, status value or data row is added or changed.

begin;

-- ── 0. Guards (refuse, change nothing) ────────────────────────────────────
do $$
declare v text;
begin
  if to_regclass('public.jobs') is null then
    raise exception '0031: public.jobs missing. Nothing was changed.';
  end if;
  -- 0029-v2 installed and its trigger enabled (0031 relies on 0029 to lock the amounts after posting)
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.jobs_lock_pricing_and_inspection()')
                    and p.prosrc like '%haven-version: 0029-v2 %')
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and not t.tgisinternal
                       and t.tgname = 'jobs_lock_pricing_and_inspection' and t.tgenabled = 'O'
                       and t.tgfoid = to_regprocedure('public.jobs_lock_pricing_and_inspection()')) then
    raise exception '0031 needs 0029 (haven-version 0029-v2) and its enabled trigger first. Nothing was changed.';
  end if;
  -- every column the trigger reads, with the reviewed types
  if (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname)
        from pg_attribute a
       where a.attrelid = 'public.jobs'::regclass and a.attnum > 0 and not a.attisdropped
         and a.attname in ('convenience_fee_cents', 'emergency', 'emergency_fee_cents', 'fixed_customer_labor_price_cents',
                           'fixed_pro_labor_payout_cents', 'inspection_fee_cents', 'margin_rate_bps', 'materials_approved_cents',
                           'materials_estimate_cents', 'materials_reimbursed_cents', 'requires_diagnosis', 'tip_amount_cents'))
     is distinct from 'convenience_fee_cents:integer,emergency:boolean,emergency_fee_cents:integer,fixed_customer_labor_price_cents:integer,fixed_pro_labor_payout_cents:integer,inspection_fee_cents:integer,margin_rate_bps:integer,materials_approved_cents:integer,materials_estimate_cents:integer,materials_reimbursed_cents:integer,requires_diagnosis:boolean,tip_amount_cents:integer' then
    raise exception '0031: public.jobs money columns are not as reviewed (0025 applied?). Nothing was changed.';
  end if;
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
     or not has_table_privilege(current_user, 'public.jobs', 'trigger')
     or not has_schema_privilege(current_user, 'public', 'create') then
    raise exception '0031: run as the database owner (postgres), not %. Nothing was changed.', current_user;
  end if;
  select md5(replace(p.prosrc, E'\r', '')) into v from pg_proc p where p.oid = to_regprocedure('public.jobs_validate_posting_amounts()');
  if v is not null and v <> '3e4786774e3ea9ebe49f60e55605f90e' then
    raise exception '0031: public.jobs_validate_posting_amounts() already exists with another body (md5 %). Send this to Codey. Nothing was changed.', v;
  end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_validate_posting_amounts'
                and t.tgfoid is distinct from to_regprocedure('public.jobs_validate_posting_amounts()')) then
    raise exception '0031: a trigger named jobs_validate_posting_amounts runs another function. Nothing was changed.';
  end if;
end $$;

-- ── 1. Trigger function ───────────────────────────────────────────────────
-- SECURITY INVOKER on purpose so current_user is the real caller role.
create or replace function public.jobs_validate_posting_amounts()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
-- haven-version: 0031-v2 (2026-11-12 t674 refresh: guards, pinned search_path; rules unchanged from 045665d4).
declare
  privileged boolean := current_user not in ('anon', 'authenticated');
  margin_bps constant integer := 2000;  -- founder-set margin; future jobs only (item 9)
begin
  if privileged then
    return new;
  end if;

  if new.margin_rate_bps is distinct from margin_bps then
    raise exception 'The margin rate must be the current rate (2000 bps)'
      using errcode = '42501',
            hint = 'margin_rate_bps is set by Haven, not by the client.';
  end if;

  if new.fixed_pro_labor_payout_cents is distinct from
       (new.fixed_customer_labor_price_cents::bigint * (10000 - margin_bps) / 10000)::integer then
    raise exception 'The Pro payout must be 80%% of the labor price'
      using errcode = '42501',
            hint = 'fixed_pro_labor_payout_cents = floor(price * 80 / 100).';
  end if;

  if new.inspection_fee_cents is distinct from
       (case when new.requires_diagnosis then 4500 else 0 end) then
    raise exception 'The inspection fee must be $45 on a diagnosis job and $0 otherwise'
      using errcode = '42501',
            hint = 'inspection_fee_cents = 4500 when requires_diagnosis, else 0.';
  end if;

  -- Emergency jobs: amount not validated (pending founder decision, 5a).
  if not new.emergency
     and new.emergency_fee_cents is distinct from 0 then
    raise exception 'A non-emergency job cannot carry an emergency fee'
      using errcode = '42501',
            hint = 'emergency_fee_cents must be 0 when emergency is false.';
  end if;

  if new.convenience_fee_cents is distinct from 0
     or new.tip_amount_cents is distinct from 0
     or new.materials_reimbursed_cents is distinct from 0
     or new.materials_estimate_cents is distinct from 0
     or new.materials_approved_cents is not null then
    raise exception 'A new job cannot carry a convenience fee, tip, materials amount or reimbursement'
      using errcode = '42501',
            hint = 'These start at 0 (materials_approved_cents null) and are set later by the job flow.';
  end if;

  return new;
end;
$$;

-- Trigger functions run without EXECUTE; nobody needs to call it directly.
revoke all on function public.jobs_validate_posting_amounts() from public, anon, authenticated, service_role;

-- ── 2. Trigger (INSERT only) ──────────────────────────────────────────────
drop trigger if exists jobs_validate_posting_amounts on public.jobs;
create trigger jobs_validate_posting_amounts
  before insert on public.jobs
  for each row execute function public.jobs_validate_posting_amounts();

-- ── 3. Post-checks (any failure rolls everything back) ────────────────────
do $$
begin
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.jobs_validate_posting_amounts()')
                    and md5(replace(p.prosrc, E'\r', '')) = '3e4786774e3ea9ebe49f60e55605f90e'
                    and not p.prosecdef and p.proconfig = array['search_path=pg_catalog, public, pg_temp']
                    and not has_function_privilege('anon', p.oid, 'execute')
                    and not has_function_privilege('authenticated', p.oid, 'execute')
                    and not has_function_privilege('service_role', p.oid, 'execute')) then
    raise exception '0031 post-check: function body / invoker / search_path / grants wrong. Rolled back.';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_validate_posting_amounts'
                    and t.tgtype = 7 and t.tgenabled = 'O' and t.tgqual is null
                    and t.tgfoid = to_regprocedure('public.jobs_validate_posting_amounts()')) then
    raise exception '0031 post-check: trigger is not BEFORE INSERT FOR EACH ROW, enabled. Rolled back.';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_lock_pricing_and_inspection' and t.tgenabled = 'O') then
    raise exception '0031 post-check: 0029 trigger missing. Rolled back.';
  end if;
end $$;

commit;

-- Verify: supabase/checks/0031b_check_after_READ_ONLY.sql (row 000 LIVE).
-- Item 8 count (read-only; nothing here changes these rows), for the founder:
-- select count(*) as legacy_diagnosis_jobs_with_0_inspection_fee
--   from public.jobs where requires_diagnosis and inspection_fee_cents = 0;
-- Rollback: supabase/rollback/0031_posting_amounts_validation_rollback.sql (one run).
