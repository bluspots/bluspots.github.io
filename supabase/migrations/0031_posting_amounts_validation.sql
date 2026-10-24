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
-- PASTE ORDER: 0025 body, 0027, 0026, 0028, 0029, then 0031 (this file).
-- 0031 needs 0029 (section 0 stops with an error, and nothing is applied,
-- if 0029's function or trigger is missing). It is NOT universally safe to
-- re-run; a re-run is:
--   - a no-op in effect ONLY while public.jobs_validate_posting_amounts()
--     already holds the exact body in this file: it re-creates the same
--     function and drops and re-creates the same trigger (new trigger oid,
--     same definition). No column, policy, grant or data change.
--   - refused with an error by section 0, nothing applied (one
--     transaction), when public.jobs_lock_pricing_and_inspection() or its
--     trigger on public.jobs is missing.
--   - NOT guarded otherwise: if another body of
--     jobs_validate_posting_amounts() is installed (an edited or later
--     version), a re-run silently replaces it.
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

-- ── 0. Requires 0029 ──────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.jobs_lock_pricing_and_inspection()') is null
     or not exists (
       select 1 from pg_trigger
        where tgrelid = 'public.jobs'::regclass
          and tgname = 'jobs_lock_pricing_and_inspection'
          and tgfoid = to_regprocedure('public.jobs_lock_pricing_and_inspection()')::oid
     ) then
    raise exception '0031 needs 0029_inspection_fee_lock.sql first (public.jobs_lock_pricing_and_inspection() or its trigger on public.jobs is missing)';
  end if;
end$$;

-- ── 1. Trigger function ───────────────────────────────────────────────────
-- SECURITY INVOKER on purpose so current_user is the real caller role.
create or replace function public.jobs_validate_posting_amounts()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
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
revoke all on function public.jobs_validate_posting_amounts() from public, anon, authenticated;

-- ── 2. Trigger (INSERT only) ──────────────────────────────────────────────
drop trigger if exists jobs_validate_posting_amounts on public.jobs;
create trigger jobs_validate_posting_amounts
  before insert on public.jobs
  for each row execute function public.jobs_validate_posting_amounts();

commit;

-- ── Verify (read-only) ────────────────────────────────────────────────────
-- Trigger installed, INSERT only, 0029 untouched:
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--  where tgrelid = 'public.jobs'::regclass and not tgisinternal order by 1;
-- Item 8 count (read-only; nothing here changes these rows):
-- select count(*) as legacy_diagnosis_jobs_with_0_inspection_fee
--   from public.jobs where requires_diagnosis and inspection_fee_cents = 0;
-- Existing rows that would not pass today's posting rules (information
-- only; 0031 never re-checks posted rows):
-- select count(*) from public.jobs
--  where margin_rate_bps <> 2000
--     or fixed_pro_labor_payout_cents <> fixed_customer_labor_price_cents * 80 / 100;

-- ── Rollback (only if this file must be undone) ───────────────────────────
-- ONE transaction, one SQL-editor query: remove the leading "-- " from every
-- line between BEGIN-ROLLBACK and END-ROLLBACK and run them together. 0031
-- only added this trigger and function, so dropping both restores the
-- exact 0029 state. Roll 0031 back before 0029 if both are undone.
-- BEGIN-ROLLBACK
-- begin;
-- drop trigger if exists jobs_validate_posting_amounts on public.jobs;
-- drop function if exists public.jobs_validate_posting_amounts();
-- commit;
-- END-ROLLBACK
