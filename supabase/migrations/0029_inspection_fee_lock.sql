-- Haven shared backend — inspection_completed ownership + posted-job fee lock (Phase 1B)
-- Number: 0029 (next after 0028_materials_followups.sql).
-- Pro has no migrations folder. This is the one paste for both apps.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor and run
-- it as ONE single run (one query, one session). Do not highlight and run
-- statements one at a time: the editor may send each selection on its own
-- connection, so begin; would not carry over. The rollback block below is
-- also one block, one run.
--
-- PASTE ORDER: 0025 body, then 0027, then 0026, then 0028, then 0029 (this
-- file), each pasted as its own run. 0029 needs 0028 (section 0 stops with
-- an error, and nothing is applied, if 0028 is not installed). It does not
-- depend on 0027. Paste as the database owner. Do not apply it from the
-- app, from CI, or from an agent. Safe to re-run.
--
-- What it adds: ONE new BEFORE UPDATE trigger on public.jobs,
-- jobs_lock_pricing_and_inspection, with its own function. The 0025-0028
-- function jobs_lock_materials_approved and its trigger are NOT changed
-- (byte-for-byte the 0028 text). BEFORE triggers on the same table fire in
-- name order, so this one runs after jobs_lock_materials_approved: every
-- refusal 0026/0028 already makes keeps its message, and 0029 only adds
-- refusals. No column, policy, grant, status value or data row is added or
-- changed. Nothing here marks any fee as collected or paid.
--
-- Founder decisions 2026-10-23 (non-privileged callers = roles anon and
-- authenticated, i.e. every app session):
--   I. Moves INTO inspection_completed (old.status <> inspection_completed):
--     (a) materials_requested -> inspection_completed: the job's customer
--         only (auth.uid() = jobs.customer_id), the request is undecided
--         (materials_request_seq > materials_decided_seq), and the job has
--         requires_diagnosis = true. This is the existing 0026/0028
--         diagnosis decline (Customer app Decline on a diagnosis job sends
--         exactly {status:'inspection_completed'}); 0028 still marks the
--         request decided and adds $0. NEW in 0029: the requires_diagnosis
--         condition (a non-diagnosis decline is materials_declined).
--     (b) diagnosing -> inspection_completed: the job's customer only,
--         requires_diagnosis = true, and no undecided materials request.
--         The Customer button for this is a separate frontend change (not
--         in this file); the server rule is ready for it.
--     (c) A same-status re-send (old.status = new.status =
--         'inspection_completed') is not a move: it is allowed (no-op) for
--         any caller RLS lets through. The Pro app's terminal sync
--         (bestEffortPatchTerminalStatus) PATCHes
--         {"status":"inspection_completed","inspection_fee_cents":<n>}
--         with id=eq + pro_id=eq; it passes when <n> equals the stored fee
--         (the fee lock below still applies to it).
--     (d) EVERY other move into inspection_completed is refused with
--         SQLSTATE 42501 for every client, the Pro included: from posted,
--         en_route, arrived (never allowed from arrived), in_progress,
--         materials_approved, complete, materials_declined, cancelled; from
--         diagnosing / materials_requested by anyone but the customer; on a
--         job with requires_diagnosis = false; (a) with no undecided
--         request; (b) with an undecided request.
--     This supersedes 0026/0028's "FOUNDER DECISION PENDING" block (the
--     null; in jobs_lock_materials_approved): that block is left in place
--     and still allows, but this trigger now refuses those moves.
--   II. Fee integrity. Once a job row exists (it is created posted), these
--     columns are locked against client changes (42501 "Job pricing is
--     locked once the job is posted"):
--       fixed_customer_labor_price_cents, fixed_pro_labor_payout_cents,
--       margin_rate_bps, emergency_fee_cents, inspection_fee_cents,
--       convenience_fee_cents, and requires_diagnosis (the flag that gates
--       I(a)/I(b) and selects the inspection-fee path; locked so a client
--       cannot flip it to reach inspection_completed).
--     Identical re-sends (same value) are allowed. The one adjustment
--     HAVEN_JOB_CONTRACT.md authorizes is allowed:
--       convenience_fee_cents may be set to exactly 3000 ($30) on the
--       standard decline, materials_requested -> materials_declined, by the
--       job's customer, on a job with requires_diagnosis = false
--       (contract: "materials_declined: Standard category materials
--       decline; job could not proceed; ends with a $30 convenience fee.";
--       "A flat $30 convenience fee is LOCKED for this outcome").
--     The contract authorizes no other change after posting: the $45
--     inspection fee is "hard-locked" (set at posting; the Customer app
--     writes 4500 for diagnosis jobs), and "The payout shown before accept
--     is exactly what the pro receives". Not locked here (out of scope,
--     governed elsewhere): materials_* (0025-0028), materials_reimbursed_cents
--     (receipts), tip_amount_cents, emergency (flag only), payment_snapshot.
--     INSERT (posting itself) is not checked by this trigger.
--   PRIVILEGED callers (current_user not in ('anon', 'authenticated'): the
--     database owner / SQL editor and service_role; the same check as
--     public.haven_qa_privileged_caller() in 0024 and the inline check in
--     0025/0026/0028) skip this trigger entirely and keep their current
--     behaviour: any status move into inspection_completed and any fee or
--     price correction. Manual corrections stay possible there.
--
-- Pro app note (no Pro change in this file): on a row whose stored
-- inspection_fee_cents is 0 the Pro terminal sync sends
-- (job.inspectionFee || 45) * 100 = 4500. Under I + II that write cannot
-- land: the Pro cannot move a row into inspection_completed at all, and on
-- the same-status re-send 0 -> 4500 is a fee change (42501). The Pro app
-- then shows "Couldn't update the job. Try again." and keeps the job
-- active, so the Pro app needs a fix (send the stored fee or no fee).

begin;

-- ── 0. Requires 0028 ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'jobs'
       and column_name = 'materials_decided_seq'
  ) or not exists (
    select 1 from pg_proc
     where proname = 'jobs_lock_materials_approved'
       and pronamespace = 'public'::regnamespace
       and prosrc like '%Only the Pro can request materials on this job%'
       and prosrc like '%legacy_fill_ok%'
       and prosrc like '%ABANDON (0028%'
  ) or not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.jobs'::regclass and tgname = 'jobs_lock_materials_approved'
  ) then
    raise exception '0029 needs 0028_materials_followups.sql first (0028 trigger function, its trigger or the 0026 columns are missing)';
  end if;
end$$;

-- ── 1. Trigger function ───────────────────────────────────────────────────
-- SECURITY INVOKER on purpose so current_user is the real caller role.
create or replace function public.jobs_lock_pricing_and_inspection()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  privileged boolean := current_user not in ('anon', 'authenticated');
  is_customer boolean;
  undecided boolean;
begin
  -- PRIVILEGED: owner / SQL editor / service_role keep their behaviour.
  if privileged then
    return new;
  end if;

  is_customer := auth.uid() is not null and auth.uid() = old.customer_id;
  undecided := old.materials_request_seq > old.materials_decided_seq;

  -- I. Moves INTO inspection_completed (a same-status re-send is not a move).
  if new.status = 'inspection_completed'
     and old.status is distinct from 'inspection_completed' then
    if not is_customer then
      raise exception 'Only the customer can end this job at the inspection fee'
        using errcode = '42501',
              hint = 'inspection_completed is the customer''s decision (diagnosis decline or end after diagnosis).';
    end if;
    if not old.requires_diagnosis then
      raise exception 'inspection_completed is only for diagnosis jobs'
        using errcode = '42501',
              hint = 'A standard (non-diagnosis) decline ends at materials_declined.';
    end if;
    if old.status = 'materials_requested' then
      -- (a) diagnosis decline of an undecided request.
      if not undecided then
        raise exception 'There is no undecided materials request to decline'
          using errcode = '42501',
                hint = 'inspection_completed from materials_requested needs an undecided request.';
      end if;
    elsif old.status = 'diagnosing' then
      -- (b) end after diagnosis, only with no undecided request.
      if undecided then
        raise exception 'A materials request is still pending; decide it first'
          using errcode = '42501',
                hint = 'Approve or decline the pending materials request.';
      end if;
    else
      -- (d) every other source status (never from arrived).
      raise exception 'inspection_completed is only reachable from diagnosing or materials_requested'
        using errcode = '42501',
              hint = 'This move into inspection_completed is not allowed.';
    end if;
  end if;

  -- II. Fee integrity: price, payout, margin and fees are fixed once posted.
  if new.fixed_customer_labor_price_cents is distinct from old.fixed_customer_labor_price_cents
     or new.fixed_pro_labor_payout_cents is distinct from old.fixed_pro_labor_payout_cents
     or new.margin_rate_bps is distinct from old.margin_rate_bps
     or new.emergency_fee_cents is distinct from old.emergency_fee_cents
     or new.inspection_fee_cents is distinct from old.inspection_fee_cents
     or new.requires_diagnosis is distinct from old.requires_diagnosis then
    raise exception 'Job pricing is locked once the job is posted'
      using errcode = '42501',
            hint = 'Price, payout, margin, emergency fee, inspection fee and requires_diagnosis cannot change after posting.';
  end if;
  -- Contract-authorized: the flat $30 convenience fee on a standard decline.
  if new.convenience_fee_cents is distinct from old.convenience_fee_cents
     and not (is_customer
              and old.status = 'materials_requested'
              and new.status = 'materials_declined'
              and not old.requires_diagnosis
              and new.convenience_fee_cents = 3000) then
    raise exception 'Job pricing is locked once the job is posted'
      using errcode = '42501',
            hint = 'The convenience fee is set only to $30 by the customer''s standard materials decline.';
  end if;

  return new;
end;
$$;

-- Trigger functions run without EXECUTE; nobody needs to call it directly.
revoke all on function public.jobs_lock_pricing_and_inspection() from public, anon, authenticated;

-- ── 2. Trigger (fires after jobs_lock_materials_approved: name order) ──────
drop trigger if exists jobs_lock_pricing_and_inspection on public.jobs;
create trigger jobs_lock_pricing_and_inspection
  before update on public.jobs
  for each row execute function public.jobs_lock_pricing_and_inspection();

commit;

-- ── Verify (read-only) ────────────────────────────────────────────────────
-- Trigger installed, 0028 function untouched:
-- select tgname from pg_trigger
--  where tgrelid = 'public.jobs'::regclass and not tgisinternal order by 1;
-- select prosrc like '%ABANDON (0028%' as still_0028
--   from pg_proc where proname = 'jobs_lock_materials_approved';
-- Diagnosis rows with no stored inspection fee (the Pro app's terminal
-- sync would send 4500 on these and now gets 42501; see header):
-- select id, status, inspection_fee_cents from public.jobs
--  where requires_diagnosis and inspection_fee_cents = 0;
-- Standard declines with no stored convenience fee (same for 3000):
-- select id, status, convenience_fee_cents from public.jobs
--  where status = 'materials_declined' and convenience_fee_cents = 0;

-- ── Rollback (only if this file must be undone) ───────────────────────────
-- ONE transaction, one SQL-editor query: remove the leading "-- " from every
-- line between BEGIN-ROLLBACK and END-ROLLBACK and run them together. 0029
-- only added this trigger and function, so dropping both restores the
-- exact 0028 state (0028's function, trigger, policies and grants were
-- never changed). ORDER: roll 0029 back FIRST if 0028 / 0026 / 0025 are to
-- be rolled back too. This function reads materials_request_seq /
-- materials_decided_seq, so dropping those columns (0026 rollback) while
-- this trigger is installed breaks every client jobs write (42703).
-- BEGIN-ROLLBACK
-- begin;
-- drop trigger if exists jobs_lock_pricing_and_inspection on public.jobs;
-- drop function if exists public.jobs_lock_pricing_and_inspection();
-- commit;
-- END-ROLLBACK
