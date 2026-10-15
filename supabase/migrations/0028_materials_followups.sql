-- Haven shared backend — materials approval follow-ups to 0026 (Phase 1B P1)
-- Number: 0028 (0027 is taken by the jobs read lockdown, PR #88).
-- Pro has no migrations folder. This is the one paste for both apps.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor and run
-- it as ONE single run (one query, one session). Do not highlight and run
-- statements one at a time: the editor may send each selection on its own
-- connection, so begin; would not carry over. The rollback block below is
-- also one block, one run.
--
-- PASTE ORDER: 0025 body, then 0026, then 0027, then 0028 (this file).
-- 0028 does not depend on 0027 (it only replaces the 0026 trigger function
-- and adds no column, policy or grant), but keep the numbered order.
-- Paste as the database owner. Do not apply it from the app, from CI, or
-- from an agent. Safe to re-run. Section 0 stops with an error, and nothing
-- is applied, if 0026 is not installed.
--
-- What it does (QA #85 v3 observations; same function name, same trigger,
-- every 0026 rule G1-G3 / C2 / C3 / counting kept as is):
--   (a) C3-CUST (O3). The job's customer may not move a job INTO
--       materials_requested from any other status (42501 "Only the Pro can
--       request materials on this job"). 0026's C3 did not cover the
--       customer, so a customer could reopen their own approved, declined,
--       complete, inspection_completed or cancelled job and leave the Pro
--       stuck behind G2. The customer never makes a request in the app, so
--       the rule covers every source status, not only decided ones. The
--       customer can still approve, decline (materials_declined /
--       inspection_completed) and cancel: those are moves OUT of
--       materials_requested or unrelated, and are unchanged.
--   (b) C4 (O2). Outside a pending request, materials_estimate_cents and
--       materials_items are locked for every non-privileged caller (42501
--       "The materials estimate can only change with a new materials
--       request"). Together with 0026's C2 (locked while pending) the only
--       client write that may change them is the new-request move
--       (en_route / arrived / diagnosing / in_progress -> materials_requested).
--       Not affected: receipts (materials_reimbursed_cents + in_progress),
--       re-sends of identical values, new requests and their approvals
--       (each still adds its own request-time estimate), privileged
--       corrections (SQL editor / service_role).
--   (c) LEGACY-FILL (O4). A request pending since before 0026 may have no
--       stored item list. A same-request Pro re-send (materials_requested ->
--       materials_requested) that keeps the SAME estimate may now fill in
--       an item list that is null or [] instead of failing 42501. Money is
--       counted from the estimate, which stays frozen. A re-send that
--       changes the estimate, or that replaces a non-empty item list, is
--       still 42501 on purpose: the customer approves exactly the amount
--       shown at request time. A Pro whose legacy retry still fails should
--       re-send without estimate/items, or wait for the customer.
--   (d) ABANDON (O1). When the customer leaves materials_requested without
--       a decision (arrived, en_route, complete, ...), the request is
--       closed as abandoned: materials_decided_seq = materials_request_seq,
--       $0 added, materials_approved_cents / _at unchanged. 0026 left it
--       undecided, so the estimate stayed frozen and G3 kept refusing the
--       Pro's inspection_completed until a new request was decided. A new
--       request afterwards still gets its own number and counts on its own.
--       Privileged callers that leave materials_requested keep 0026's
--       behaviour (no stamp), for manual correction.
--   O5 (separate-session pasting) is a paste-procedure risk; see HOW TO RUN.
--
-- No column, policy, grant, status value or data row is added or changed.
-- Existing abandoned requests (seq > decided, status not
-- materials_requested) are NOT rewritten by this file; they close on the
-- next status change by a client, as before (see Verify).

begin;

-- ── 0. Requires 0026 ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'jobs'
       and column_name = 'materials_decided_seq'
  ) or not exists (
    select 1 from pg_proc
     where proname = 'jobs_lock_materials_approved'
       and prosrc like '%Only the customer can approve or decline materials on this job%'
  ) or not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.jobs'::regclass and tgname = 'jobs_lock_materials_approved'
  ) then
    raise exception '0028 needs 0026_customer_only_materials_approval.sql first (0026 columns, trigger function or trigger missing)';
  end if;
end$$;

-- ── 1. Trigger function (replaces 0026's body, same name and trigger) ─────
-- SECURITY INVOKER on purpose so current_user is the real caller role.
create or replace function public.jobs_lock_materials_approved()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  privileged boolean := current_user not in ('anon', 'authenticated');
  is_customer boolean;
  undecided boolean;
  new_request_move boolean;
begin
  if tg_op = 'INSERT' then
    if not privileged then
      new.materials_approved_cents := null;
      new.materials_approved_at := null;
      new.materials_request_seq := 0;
      new.materials_decided_seq := 0;
    end if;
    return new;
  end if;

  -- auth.uid() only for client roles (privileged sessions may carry no JWT).
  is_customer := not privileged and auth.uid() is not null and auth.uid() = old.customer_id;
  new_request_move := new.status = 'materials_requested'
                      and old.status in ('en_route', 'arrived', 'diagnosing', 'in_progress');

  -- (a) The materials decision belongs to the customer (0026, G1-G3).
  --     Only callers that are neither privileged nor the job's customer.
  if not privileged
     and (auth.uid() is null or auth.uid() is distinct from old.customer_id)
     and new.status is distinct from old.status then
    -- G1: approve / decline from any status.
    -- G2: leaving a pending request (materials_requested) to anything.
    if new.status in ('materials_approved', 'materials_declined')
       or old.status = 'materials_requested' then
      raise exception 'Only the customer can approve or decline materials on this job'
        using errcode = '42501',
              hint = 'Approving, declining or leaving materials_requested must come from the job''s customer.';
    end if;
    -- C3: materials_requested only from the statuses a request is made from.
    if new.status = 'materials_requested'
       and old.status not in ('en_route', 'arrived', 'diagnosing', 'in_progress') then
      raise exception 'Only the customer can approve or decline materials on this job'
        using errcode = '42501',
              hint = 'A decided or finished job cannot be reopened into materials_requested.';
    end if;
    if new.status = 'inspection_completed' then
      -- G3: no inspection_completed while a request is undecided.
      if old.materials_request_seq > old.materials_decided_seq then
        raise exception 'Only the customer can approve or decline materials on this job'
          using errcode = '42501',
                hint = 'A materials request is still pending; the customer must decide it.';
      end if;
      -- FOUNDER DECISION PENDING: Pro diagnosing->inspection_completed
      -- (and from arrived / in_progress / ...) with NO pending request is
      -- allowed today. To forbid it, replace this null; with the same
      -- raise exception ... using errcode = '42501' as above.
      null;
      -- END FOUNDER DECISION PENDING
    end if;
  end if;

  -- C3-CUST (0028, QA #85 v3 O3): the job's customer never makes a
  --     materials request, so the customer may not move INTO
  --     materials_requested from any status (no reopen of a finished job,
  --     no self-made request). Leaving it (approve, decline, cancel, ...)
  --     is unchanged.
  if not privileged
     and is_customer
     and new.status = 'materials_requested'
     and old.status is distinct from 'materials_requested' then
    raise exception 'Only the Pro can request materials on this job'
      using errcode = '42501',
            hint = 'A customer cannot reopen or create a materials request.';
  end if;

  -- C2: while a request is pending, the requested amount is frozen for
  --     EVERY client caller, the job's customer included (only privileged
  --     callers may correct it). The new-request move itself (allowed
  --     statuses -> materials_requested) sets it.
  --     LEGACY-FILL (0028, QA #85 v3 O4): a same-request re-send
  --     (materials_requested -> materials_requested) with the SAME estimate
  --     by a non-customer (the assigned Pro) may fill in an item list that
  --     is still empty (null or []), as on requests made before 0026. The counted amount is the estimate,
  --     which stays frozen, so this cannot change money.
  if not privileged
     and (old.status = 'materials_requested'
          or old.materials_request_seq > old.materials_decided_seq)
     and not new_request_move
     and (new.materials_estimate_cents is distinct from old.materials_estimate_cents
          or new.materials_items is distinct from old.materials_items)
     and not (not is_customer
              and old.status = 'materials_requested'
              and new.status = 'materials_requested'
              and new.materials_estimate_cents is not distinct from old.materials_estimate_cents
              and coalesce(old.materials_items, '[]'::jsonb) = '[]'::jsonb) then
    raise exception 'The requested materials amount cannot change while the request is pending'
      using errcode = '42501',
            hint = 'The customer approves the amount shown at request time. Make a new request for a different amount.';
  end if;

  -- C4 (0028, QA #85 v3 O2): outside a pending request the estimate and
  --     item list are locked too for every non-privileged caller, so the
  --     displayed estimate cannot drift from what was approved or
  --     declined. Only the new-request move sets them. Receipts
  --     (materials_reimbursed_cents) and identical re-sends are untouched.
  if not privileged
     and not (old.status = 'materials_requested'
              or old.materials_request_seq > old.materials_decided_seq)
     and not new_request_move
     and (new.materials_estimate_cents is distinct from old.materials_estimate_cents
          or new.materials_items is distinct from old.materials_items) then
    raise exception 'The materials estimate can only change with a new materials request'
      using errcode = '42501',
            hint = 'Make a new request (Request Materials) for a different amount.';
  end if;

  -- (b) An explicit change by a privileged caller wins (manual correction in
  -- the SQL editor, or a founder fill from the steps below).
  if privileged
     and (new.materials_approved_cents is distinct from old.materials_approved_cents
          or new.materials_approved_at is distinct from old.materials_approved_at
          or new.materials_request_seq is distinct from old.materials_request_seq
          or new.materials_decided_seq is distinct from old.materials_decided_seq) then
    return new;
  end if;

  -- (c) Client values are ignored: keep what is stored.
  new.materials_approved_cents := old.materials_approved_cents;
  new.materials_approved_at := old.materials_approved_at;
  new.materials_request_seq := old.materials_request_seq;
  new.materials_decided_seq := old.materials_decided_seq;

  -- (d) A new request: only from the statuses 0009 was written for.
  if new_request_move then
    new.materials_request_seq := old.materials_request_seq + 1;
  end if;

  -- (e) The decision counts once per request.
  if old.status = 'materials_requested' and new.status is distinct from old.status then
    undecided := old.materials_request_seq > old.materials_decided_seq;
    if undecided and new.status = 'materials_approved' then
      new.materials_approved_cents := coalesce(old.materials_approved_cents, 0)
                                      + coalesce(old.materials_estimate_cents, 0);
      new.materials_approved_at := now();
      new.materials_decided_seq := old.materials_request_seq;
    elsif undecided and new.status in ('materials_declined', 'inspection_completed') then
      new.materials_approved_cents := coalesce(old.materials_approved_cents, 0);
      -- materials_approved_at stays OLD: null when nothing was ever approved.
      new.materials_decided_seq := old.materials_request_seq;
    elsif undecided and not privileged then
      -- ABANDON (0028, QA #85 v3 O1): the customer left the request
      --     without approving or declining it (arrived, en_route, complete,
      --     ...). Close it as abandoned: decided = request number, $0
      --     added, materials_approved_cents / _at unchanged. The Pro is no
      --     longer held by G3, and a later request still counts on its own.
      new.materials_decided_seq := old.materials_request_seq;
    end if;
  end if;

  return new;
end;
$$;

-- Trigger functions run without EXECUTE; nobody needs to call it directly.
revoke all on function public.jobs_lock_materials_approved() from public, anon, authenticated;

commit;

-- ── Verify ────────────────────────────────────────────────────────────────
-- Function carries the 0028 rules:
-- select prosrc like '%Only the Pro can request materials on this job%' as has_c3_cust,
--        prosrc like '%can only change with a new materials request%' as has_c4,
--        prosrc like '%ABANDON (0028%' as has_abandon
--   from pg_proc where proname = 'jobs_lock_materials_approved';
-- Abandoned requests left by 0026 (read-only; they close on the next
-- client status change):
-- select id, status, materials_request_seq, materials_decided_seq
--   from public.jobs
--  where status <> 'materials_requested'
--    and materials_request_seq > materials_decided_seq;

-- ── Rollback (only if this file must be undone) ───────────────────────────
-- ONE transaction, one SQL-editor query: remove the leading "-- " from every
-- line between BEGIN-ROLLBACK and END-ROLLBACK and run them together. It
-- restores 0026's trigger function exactly (byte-for-byte the 0026 body)
-- and its EXECUTE revoke. The trigger itself is unchanged by 0028.
-- BEGIN-ROLLBACK
-- begin;
-- create or replace function public.jobs_lock_materials_approved()
-- returns trigger
-- language plpgsql
-- security invoker
-- set search_path = public
-- as $$
-- declare
--   privileged boolean := current_user not in ('anon', 'authenticated');
--   undecided boolean;
-- begin
--   if tg_op = 'INSERT' then
--     if not privileged then
--       new.materials_approved_cents := null;
--       new.materials_approved_at := null;
--       new.materials_request_seq := 0;
--       new.materials_decided_seq := 0;
--     end if;
--     return new;
--   end if;
--
--   -- (a) The materials decision belongs to the customer (0026, G1-G3).
--   --     Only callers that are neither privileged nor the job's customer.
--   if not privileged
--      and (auth.uid() is null or auth.uid() is distinct from old.customer_id)
--      and new.status is distinct from old.status then
--     -- G1: approve / decline from any status.
--     -- G2: leaving a pending request (materials_requested) to anything.
--     if new.status in ('materials_approved', 'materials_declined')
--        or old.status = 'materials_requested' then
--       raise exception 'Only the customer can approve or decline materials on this job'
--         using errcode = '42501',
--               hint = 'Approving, declining or leaving materials_requested must come from the job''s customer.';
--     end if;
--     -- C3: materials_requested only from the statuses a request is made from.
--     if new.status = 'materials_requested'
--        and old.status not in ('en_route', 'arrived', 'diagnosing', 'in_progress') then
--       raise exception 'Only the customer can approve or decline materials on this job'
--         using errcode = '42501',
--               hint = 'A decided or finished job cannot be reopened into materials_requested.';
--     end if;
--     if new.status = 'inspection_completed' then
--       -- G3: no inspection_completed while a request is undecided.
--       if old.materials_request_seq > old.materials_decided_seq then
--         raise exception 'Only the customer can approve or decline materials on this job'
--           using errcode = '42501',
--                 hint = 'A materials request is still pending; the customer must decide it.';
--       end if;
--       -- FOUNDER DECISION PENDING: Pro diagnosing->inspection_completed
--       -- (and from arrived / in_progress / ...) with NO pending request is
--       -- allowed today. To forbid it, replace this null; with the same
--       -- raise exception ... using errcode = '42501' as above.
--       null;
--       -- END FOUNDER DECISION PENDING
--     end if;
--   end if;
--
--   -- C2: while a request is pending, the requested amount is frozen for
--   --     EVERY client caller, the job's customer included (only privileged
--   --     callers may correct it). The new-request move itself (allowed
--   --     statuses -> materials_requested) sets it.
--   if not privileged
--      and (old.status = 'materials_requested'
--           or old.materials_request_seq > old.materials_decided_seq)
--      and not (new.status = 'materials_requested'
--               and old.status in ('en_route', 'arrived', 'diagnosing', 'in_progress'))
--      and (new.materials_estimate_cents is distinct from old.materials_estimate_cents
--           or new.materials_items is distinct from old.materials_items) then
--     raise exception 'The requested materials amount cannot change while the request is pending'
--       using errcode = '42501',
--             hint = 'The customer approves the amount shown at request time. Make a new request for a different amount.';
--   end if;
--
--   -- (b) An explicit change by a privileged caller wins (manual correction in
--   -- the SQL editor, or a founder fill from the steps below).
--   if privileged
--      and (new.materials_approved_cents is distinct from old.materials_approved_cents
--           or new.materials_approved_at is distinct from old.materials_approved_at
--           or new.materials_request_seq is distinct from old.materials_request_seq
--           or new.materials_decided_seq is distinct from old.materials_decided_seq) then
--     return new;
--   end if;
--
--   -- (c) Client values are ignored: keep what is stored.
--   new.materials_approved_cents := old.materials_approved_cents;
--   new.materials_approved_at := old.materials_approved_at;
--   new.materials_request_seq := old.materials_request_seq;
--   new.materials_decided_seq := old.materials_decided_seq;
--
--   -- (d) A new request: only from the statuses 0009 was written for.
--   if new.status = 'materials_requested'
--      and old.status in ('en_route', 'arrived', 'diagnosing', 'in_progress') then
--     new.materials_request_seq := old.materials_request_seq + 1;
--   end if;
--
--   -- (e) The decision counts once per request.
--   if old.status = 'materials_requested' and new.status is distinct from old.status then
--     undecided := old.materials_request_seq > old.materials_decided_seq;
--     if undecided and new.status = 'materials_approved' then
--       new.materials_approved_cents := coalesce(old.materials_approved_cents, 0)
--                                       + coalesce(old.materials_estimate_cents, 0);
--       new.materials_approved_at := now();
--       new.materials_decided_seq := old.materials_request_seq;
--     elsif undecided and new.status in ('materials_declined', 'inspection_completed') then
--       new.materials_approved_cents := coalesce(old.materials_approved_cents, 0);
--       -- materials_approved_at stays OLD: null when nothing was ever approved.
--       new.materials_decided_seq := old.materials_request_seq;
--     end if;
--   end if;
--
--   return new;
-- end;
-- $$;
--
-- -- Trigger functions run without EXECUTE; nobody needs to call it directly.
-- revoke all on function public.jobs_lock_materials_approved() from public, anon, authenticated;
-- commit;
-- END-ROLLBACK
