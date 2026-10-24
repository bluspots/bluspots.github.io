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
-- app, from CI, or from an agent. It is NOT universally safe to re-run; a
-- re-run is:
--   - a no-op in effect ONLY while public.jobs_lock_pricing_and_inspection()
--     already holds the exact body in this file and 0028 is installed: it
--     re-creates the same function and drops and re-creates the same
--     trigger jobs_lock_pricing_and_inspection (new trigger oid, same
--     definition). No column, policy, grant or data change, and
--     jobs_lock_materials_approved is not touched.
--   - refused with an error by section 0, nothing applied (one
--     transaction), when jobs.materials_decided_seq is missing, or
--     public.jobs_lock_materials_approved() does not carry all three 0028
--     markers, or trigger jobs_lock_materials_approved on public.jobs is
--     missing.
--   - NOT guarded otherwise. 0029 has no downgrade check: if any other
--     body of jobs_lock_pricing_and_inspection() is installed (an edited
--     or later version), a re-run silently replaces it. Section 0 matches
--     the 0028 function by text and does not read the trigger's function
--     (pg_trigger.tgfoid). Compare the installed body with this file before
--     any re-run.
--
-- What it adds: ONE new BEFORE INSERT OR UPDATE trigger on public.jobs,
-- jobs_lock_pricing_and_inspection, with its own function. The 0025-0028
-- function jobs_lock_materials_approved and its trigger are NOT changed
-- (byte-for-byte the 0028 text). BEFORE triggers on the same table fire in
-- name order, so this one runs after jobs_lock_materials_approved: every
-- refusal 0026/0028 already makes keeps its message. 0029 adds refusals,
-- and sets one value: convenience_fee_cents = 3000 on the customer's
-- standard materials decline (III.4). No column, policy, grant or status
-- value is added, and pasting changes no existing row. Nothing here marks
-- any fee as collected or paid.
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
--   D. Moves INTO diagnosing (old.status <> diagnosing) by the job's
--     customer are refused (42501 "Only the Pro can start diagnosing this
--     job"), from any status (CoS / founder, 2026-10-23). arrived ->
--     diagnosing is the Pro's step and still works for the assigned Pro.
--     Without this the customer could hop arrived -> diagnosing ->
--     inspection_completed and end a job from arrived in two writes.
--     Every other caller is covered by III.1 below.
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
--     is exactly what the pro receives". Not locked by II (governed
--     elsewhere): materials_* (0025-0028), materials_reimbursed_cents and
--     tip_amount_cents (III.5), emergency (flag only), payment_snapshot (III.6).
--     On INSERT (posting itself) this trigger checks only IV.2 below
--     (posting amounts are 0031's, deferred).
--   III. Founder decisions 2026-10-23 18:50 ET, items 1-6 (CoS relay;
--     decisions/FOUNDER_DECISIONS_2026-10-23.md B). Non-privileged callers
--     only; each refusal is SQLSTATE 42501 and leaves the row unchanged.
--     1. Moves INTO diagnosing (old.status <> diagnosing): only the job's
--        assigned Pro (auth.uid() = old.pro_id), only from arrived, and only
--        when old.requires_diagnosis = true ("Only the assigned Pro can
--        start diagnosing, from arrived, on a diagnosis job"). The customer
--        still gets rule D's message first. A same-status re-send is not a
--        move. SHIP-BEFORE dependency (owner Claude, FE-04): the Pro app
--        must offer Start Diagnosing only from arrived on diagnosis jobs.
--     2. complete, cancelled, inspection_completed and materials_declined
--        are terminal: any move OUT of them (to complete, cancelled, any
--        earlier status, or the other decline outcome) is refused ("This job
--        is finished; its status cannot change"). Same-status updates (tip,
--        the Pro app's identical terminal re-send) are not moves. The two
--        decline outcomes were added after the Job Contract check (founder
--        decision 2026-10-23 20:58 ET, item 4, cleared by CoS 21:11 ET):
--        0012's any-assigned-status policy still lets a client move them to
--        complete, and 0010 already refuses their cancel; 0029 now refuses
--        both server-side for every client.
--     3. No backward status move. Rank: posted < en_route < arrived <
--        diagnosing < materials_requested < materials_approved <
--        in_progress < complete = materials_declined = inspection_completed.
--        A move to a lower rank is refused ("This status move goes backward
--        and is not allowed"), except the assigned Pro's new materials
--        request in_progress -> materials_requested (0009, 0026 counting
--        rule). A move into cancelled is not backward (RLS decides who may
--        cancel). Closes QA P1: in_progress / complete -> arrived ->
--        diagnosing and the customer's complete -> arrived. Also refused
--        now: the customer leaving a pending request backward (e.g.
--        materials_requested -> arrived); 0028's ABANDON still closes a
--        request the customer leaves by cancelling. materials_declined /
--        inspection_completed -> complete or cancelled: refused by III.2.
--     4. The $30 standard-decline convenience fee is REQUIRED (Quagon F1
--        answered: always charged). On a move into materials_declined the
--        server sets convenience_fee_cents = 3000 whether or not the client
--        sent it; a client value other than 3000 is refused ("The standard
--        materials decline fee is $30"). Diagnosis jobs can never end as
--        materials_declined ("A diagnosis job cannot end as
--        materials_declined"; they end at inspection_completed), and
--        materials_declined is reachable only from materials_requested.
--        II's convenience-fee rule stays as a second layer. Showing the fee
--        before the customer decides is the Customer app's job (FE-02).
--     5. Only the job's customer sets tip_amount_cents ("Only the customer
--        can set the tip"; the Pro, other users and anon are refused).
--        materials_reimbursed_cents may change only to a value at most the
--        customer-approved amount, old.materials_approved_cents (null = $0;
--        "Materials reimbursement cannot exceed the customer-approved
--        materials amount"). An unchanged value is not checked. STOPPED, not
--        implemented: "needs a valid receipt". No receipt column exists on
--        jobs; public.materials_receipts (0001: actual_total_cents,
--        receipt_photo_url, submitted_by) is never written by either app and
--        0027 revokes all client rights on it (RLS on, no policies), and
--        job_media kind 'materials_receipt' is in the same state. Checking
--        for a receipt row would refuse every Pro receipt today; that needs a
--        founder / CoS decision on the receipt record first.
--     6. The payment note, jobs.payment_snapshot ({brand,last4}, the only
--        payment field; written at posting by the Customer app), is locked
--        after posting ("The payment note is locked once the job is
--        posted"); an identical re-send is not a change.
--   IV. Founder decisions 2026-10-23 21:14 ET (CoS relay), rules 1-4.
--     Each refusal is SQLSTATE 42501 and leaves the row unchanged.
--     1. complete is reachable only from in_progress ("A job can only be
--        completed from in_progress"): no skipping from en_route, arrived,
--        diagnosing, materials_requested or materials_approved. The Pro
--        app already PATCHes complete only with status=eq.in_progress.
--        Non-privileged callers (privileged callers: see below).
--     2. No account may claim or be assigned a job it posted ("A job cannot
--        be claimed by or assigned to the account that posted it"):
--        pro_id = customer_id is refused on INSERT and on any UPDATE that
--        changes pro_id or customer_id, whatever either profile's role is
--        (a customer who switched to Pro included; the check reads ids
--        only). This one applies to EVERY caller, privileged included:
--        pro_claim_job (0011/0023) is SECURITY DEFINER and runs as its
--        owner, so a privileged exemption would skip the claim itself.
--        Existing rows are not rewritten; an update that leaves both ids
--        unchanged is not re-checked.
--     3. The job's customer never sets work statuses ("The customer cannot
--        set this job status"): no move into en_route, arrived, diagnosing,
--        materials_requested, in_progress, complete or posted. The only
--        status moves the customer may make are materials_approved and
--        materials_declined (the materials decision), inspection_completed
--        (the approved inspection endings, I above), and cancelled while
--        the job is posted with no Pro (RLS 0010 already allows only that;
--        0029 now refuses the rest even without RLS). The Customer app
--        writes only cancelled, materials_approved, materials_declined and
--        inspection_completed.
--   PRIVILEGED callers (current_user not in ('anon', 'authenticated'): the
--     database owner / SQL editor and service_role; the same check as
--     public.haven_qa_privileged_caller() in 0024 and the inline check in
--     0025/0026/0028) skip this trigger (except IV.2) and keep their current
--     behaviour: any status move into inspection_completed or diagnosing
--     and any fee or price correction. Manual corrections stay possible there.
--
-- Pro app note (no Pro change in this file): on a row whose stored
-- inspection_fee_cents is 0 the Pro terminal sync sends
-- (job.inspectionFee || 45) * 100 = 4500. Under I + II that write cannot
-- land: the Pro cannot move a row into inspection_completed at all, and on
-- the same-status re-send 0 -> 4500 is a fee change (42501). The Pro app
-- then shows "Couldn't update the job. Try again." and keeps the job
-- active, so the Pro app needs a fix (send the stored fee or no fee).
-- SHIP-BEFORE-0029 DEPENDENCY (CoS, 2026-10-23; owner Claude, Pro app):
-- bestEffortPatchTerminalStatus must send the row's stored fee or omit the
-- fee field BEFORE 0029 is applied, otherwise jobs storing 0 get stuck.
-- Also known (Pro app, owner Claude): the Pro only polls materials_requested
-- / materials_approved, so a customer ending from diagnosing is not seen
-- live by the Pro app.

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
  is_pro boolean;
  ladder text[] := array['posted', 'en_route', 'arrived', 'diagnosing', 'materials_requested',
                         'materials_approved', 'in_progress'];
  old_rank integer;
  new_rank integer;
begin
  -- IV.2 (founder 2026-10-23 21:14 ET, rule 2). Every caller, privileged too.
  if new.pro_id is not null
     and new.pro_id = new.customer_id
     and (tg_op = 'INSERT'
          or new.pro_id is distinct from old.pro_id
          or new.customer_id is distinct from old.customer_id) then
    raise exception 'A job cannot be claimed by or assigned to the account that posted it'
      using errcode = '42501',
            hint = 'pro_id must differ from customer_id.';
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;

  -- PRIVILEGED: owner / SQL editor / service_role keep their behaviour.
  if privileged then
    return new;
  end if;

  is_customer := auth.uid() is not null and auth.uid() = old.customer_id;
  undecided := old.materials_request_seq > old.materials_decided_seq;
  is_pro := auth.uid() is not null and auth.uid() = old.pro_id;

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

  -- D. Moves INTO diagnosing: never by the job's customer, from any status
  --    (arrived -> diagnosing is the Pro's; a same-status re-send is not a move).
  if new.status = 'diagnosing'
     and old.status is distinct from 'diagnosing'
     and is_customer then
    raise exception 'Only the Pro can start diagnosing this job'
      using errcode = '42501',
            hint = 'arrived -> diagnosing is the Pro''s step; the customer cannot move a job into diagnosing.';
  end if;

  -- III.1 (founder 2026-10-23, item 1). Moves INTO diagnosing by anyone else:
  --    only the job's assigned Pro, only from arrived, only on a diagnosis job.
  if new.status = 'diagnosing'
     and old.status is distinct from 'diagnosing'
     and not (is_pro and old.status = 'arrived' and old.requires_diagnosis) then
    raise exception 'Only the assigned Pro can start diagnosing, from arrived, on a diagnosis job'
      using errcode = '42501',
            hint = 'arrived -> diagnosing is the assigned Pro''s step, only when requires_diagnosis is true.';
  end if;

  -- III.2 (item 2; decline outcomes added 2026-10-23). complete, cancelled,
  --    inspection_completed and materials_declined are terminal: no move out.
  if old.status in ('complete', 'cancelled', 'inspection_completed', 'materials_declined')
     and new.status is distinct from old.status then
    raise exception 'This job is finished; its status cannot change'
      using errcode = '42501',
            hint = 'complete, cancelled, inspection_completed and materials_declined are terminal statuses.';
  end if;

  -- III.3 (item 3). No backward status move. Ladder rank: posted 1 ..
  --    in_progress 7; complete, materials_declined, inspection_completed 8.
  --    A move into cancelled is never backward (who may cancel stays with
  --    RLS); moves out of the four terminal statuses are III.2. The one authorized
  --    backward move: the assigned Pro's new materials request from
  --    in_progress (0009 / 0026 counting rule: receipt -> in_progress ->
  --    Request Materials).
  old_rank := coalesce(array_position(ladder, old.status::text), 8);
  new_rank := coalesce(array_position(ladder, new.status::text), 8);
  if new.status is distinct from old.status
     and new.status <> 'cancelled'
     and new_rank < old_rank
     and not (is_pro and old.status = 'in_progress' and new.status = 'materials_requested') then
    raise exception 'This status move goes backward and is not allowed'
      using errcode = '42501',
            hint = 'Only the assigned Pro''s new materials request from in_progress may move back to materials_requested.';
  end if;

  -- III.4 (item 4). Moves INTO materials_declined: only the standard decline
  --    (materials_requested, requires_diagnosis = false), and the $30
  --    convenience fee is required: the server sets it.
  if new.status = 'materials_declined'
     and old.status is distinct from 'materials_declined' then
    if old.requires_diagnosis then
      raise exception 'A diagnosis job cannot end as materials_declined'
        using errcode = '42501',
              hint = 'Declining materials on a diagnosis job ends at inspection_completed.';
    end if;
    if old.status <> 'materials_requested' then
      raise exception 'materials_declined is only reachable from materials_requested'
        using errcode = '42501',
              hint = 'The standard decline is the customer''s answer to a pending materials request.';
    end if;
    if new.convenience_fee_cents is distinct from old.convenience_fee_cents
       and new.convenience_fee_cents <> 3000 then
      raise exception 'The standard materials decline fee is $30'
        using errcode = '42501',
              hint = 'Send convenience_fee_cents 3000 or leave it out: the server sets it.';
    end if;
    new.convenience_fee_cents := 3000;
  end if;

  -- IV.1 (founder 2026-10-23 21:14 ET, rule 1). complete only from in_progress.
  if new.status = 'complete'
     and old.status is distinct from 'complete'
     and old.status <> 'in_progress' then
    raise exception 'A job can only be completed from in_progress'
      using errcode = '42501',
            hint = 'Start the work (in_progress) before marking the job complete.';
  end if;

  -- IV.3 (founder 2026-10-23 21:14 ET, rule 3). The customer sets no work status.
  if is_customer
     and new.status is distinct from old.status
     and not (new.status in ('materials_approved', 'materials_declined', 'inspection_completed')
              or (new.status = 'cancelled' and old.status = 'posted' and old.pro_id is null)) then
    raise exception 'The customer cannot set this job status'
      using errcode = '42501',
            hint = 'The customer may approve or decline materials, end at the inspection fee, or cancel while the job is posted with no Pro.';
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

  -- III.5 (item 5). Only the job's customer sets the tip.
  if new.tip_amount_cents is distinct from old.tip_amount_cents
     and not is_customer then
    raise exception 'Only the customer can set the tip'
      using errcode = '42501',
            hint = 'tip_amount_cents is the customer''s to set.';
  end if;
  -- Reimbursement never exceeds the customer-approved materials amount
  -- (materials_approved_cents, kept by 0025-0028; null counts as $0).
  if new.materials_reimbursed_cents is distinct from old.materials_reimbursed_cents
     and new.materials_reimbursed_cents > coalesce(old.materials_approved_cents, 0) then
    raise exception 'Materials reimbursement cannot exceed the customer-approved materials amount'
      using errcode = '42501',
            hint = 'The receipt amount must be at most materials_approved_cents.';
  end if;

  -- III.6 (item 6). The payment note (payment_snapshot) is fixed once posted.
  if new.payment_snapshot is distinct from old.payment_snapshot then
    raise exception 'The payment note is locked once the job is posted'
      using errcode = '42501',
            hint = 'payment_snapshot is set when the job is posted.';
  end if;

  return new;
end;
$$;

-- Trigger functions run without EXECUTE; nobody needs to call it directly.
revoke all on function public.jobs_lock_pricing_and_inspection() from public, anon, authenticated;

-- ── 2. Trigger (fires after jobs_lock_materials_approved: name order) ──────
drop trigger if exists jobs_lock_pricing_and_inspection on public.jobs;
create trigger jobs_lock_pricing_and_inspection
  before insert or update on public.jobs
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
