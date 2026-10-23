-- Haven shared backend — customer-only materials approval (Phase 1B P1)
-- Number: 0026 (next after 0025_materials_approved_lock.sql).
-- Pro has no migrations folder. This is the one paste for both apps.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor and run
-- it as ONE single run (one query, one session). Do not highlight and run
-- statements one at a time: the editor may send each selection on its own
-- connection, so begin; would not carry over and a partial install could
-- break every jobs write. The same applies to every other migration file
-- and to each founder step / rollback block below: one block, one run.
--
-- Paste this whole file in the Supabase SQL editor as the database owner,
-- AFTER 0025 (it needs 0025's columns and replaces 0025's trigger function;
-- section 0 stops with an error if 0025 is missing). Do not apply it from
-- the app, from CI, or from an agent. Re-run: safe ONLY while 0028 is not
-- installed (idempotent; the one-time seq init does not repeat). After 0028
-- a re-run would downgrade the trigger function, so section 0b refuses.
-- PASTE ORDER: 0025 body, then 0027, then 0026 (this file), then 0028,
-- each pasted as its own run. 0026 does not depend on 0027.
-- The whole migration (sections 0-3) is one transaction (begin; ... commit;):
-- if the 0025 check or any statement fails, nothing is applied, as long as
-- the file goes in as one single run (see HOW TO RUN above; this holds
-- only within one session). The founder steps below the commit are
-- commented out.
--
-- What it does
--   1. Customer-only decision (founder-approved 2026-10-08). On a jobs row
--      that is at materials_requested, only the job's customer
--      (auth.uid() = jobs.customer_id) or a privileged caller (database
--      owner / SQL editor, service_role; same current_user check as 0024 /
--      0025) may move it to materials_approved, materials_declined or
--      inspection_completed. Anyone else, in practice the assigned Pro, gets
--      SQLSTATE 42501 "Only the customer can approve or decline materials on
--      this job" and the row does not change. This replaces 0025's softer
--      rule (Pro-alone approval moved the status but recorded $0).
--      inspection_completed is in this list only as a move FROM
--      materials_requested: that is the diagnosis-category decline
--      (HAVEN_JOB_CONTRACT.md: "materials_requested -> inspection_completed |
--      Customer | Declines on diagnosis categories"; 0006 "diagnosis decline
--      path"; the Customer app sends it from Decline for diagnosis jobs). It
--      is the same customer decision as materials_declined under the
--      diagnosis-path name. The permissive UPDATE policies (0008 approve
--      check, 0012/0013/0014 lifecycle, decline terminals) are OR-ed, so RLS
--      alone lets the assigned Pro reach these states by other routes. The
--      trigger therefore enforces, for every caller that is neither
--      privileged nor the job's customer (rules G1-G3 in section 2):
--        G1. Setting status to materials_approved or materials_declined from
--            ANY other status is refused (42501).
--        G2. Leaving materials_requested to ANY other status (arrived,
--            in_progress, complete, cancelled, decline terminals, ...) is
--            refused (42501): only the customer decides a pending request.
--        G3. While a request is undecided (materials_request_seq >
--            materials_decided_seq) inspection_completed is refused from any
--            status, so a pending request cannot be dodged and decided by the
--            Pro in two hops.
--        C2. While a request is pending (status materials_requested, or
--            materials_request_seq > materials_decided_seq) the requested
--            amount columns (materials_estimate_cents, materials_items) are
--            frozen for every non-privileged caller, the job's customer
--            included: changing them is refused (42501), also in the same
--            PATCH as the approval. The customer approves exactly the amount
--            the Pro requested. A Pro who wants a
--            different amount must make a NEW request (see counting rule),
--            which gets its own number. The only allowed change is the
--            new-request move itself (en_route / arrived / diagnosing /
--            in_progress -> materials_requested), which sets the amount.
--        C3. Entering materials_requested is allowed only from en_route,
--            arrived, diagnosing or in_progress. A move into it from any
--            decided or terminal status (materials_approved,
--            materials_declined, inspection_completed, complete, cancelled,
--            ...) is refused (42501).
--      FOUNDER DECISION PENDING: the Pro may still move to
--      inspection_completed from diagnosing / arrived / in_progress / ...
--      when NO request is pending (today's behaviour, one marked block in
--      the trigger). Re-sending the status the row already has (no
--      transition) is unchanged. Pros can still create and re-send
--      materials requests. No RLS policy, status value or lifecycle policy
--      is added, dropped or changed; the guard lives only in this trigger.
--   2. Exactly-once counting, stamped by the server. Two bookkeeping
--      columns on public.jobs, integer not null default 0:
--        materials_request_seq  number of the current materials request.
--        materials_decided_seq  highest request number already decided
--                               (approved or declined).
--      Clients cannot write either one (the trigger keeps OLD); the SQL
--      editor and service_role can, for manual correction.
--
-- Counting rule (what is a "genuinely new request")
--   The Pro app sends one PATCH per request: status materials_requested plus
--   that request's own items and estimate (not a running total), only from
--   the Request Materials buttons on diagnosing / in_progress. 0009 allows
--   that move from en_route, arrived, diagnosing and in_progress. So:
--   - NEW REQUEST: a move INTO materials_requested from en_route, arrived,
--     diagnosing or in_progress. The trigger stamps
--     materials_request_seq = previous + 1. Nothing the client sends
--     (timestamps, items, estimate) can make a request new.
--   - SAME REQUEST: materials_requested -> materials_requested (a retried or
--     re-sent request PATCH). The number stays. A revised estimate or item
--     list is refused (C2), so the amount counted is the one locked when
--     the request was made.
--   - REOPEN: a move into materials_requested from any other status
--     (materials_approved, materials_declined, inspection_completed,
--     complete, cancelled, ...). Permissive policies are OR-ed, so RLS
--     allows these, but no app sends them. Refused for clients (C3); a
--     privileged caller keeps the number (no new request).
--   - A decision counts only for an undecided request
--     (materials_request_seq > materials_decided_seq):
--       approve -> materials_approved_cents += OLD.materials_estimate_cents
--                  (frozen since the request by C2, so it is the amount the
--                  request was made with),
--                  materials_approved_at = now(), decided = request number.
--       decline (materials_declined or inspection_completed) -> adds 0
--                  (null becomes 0), decided = request number.
--     A decided request never counts again, in either direction: the first
--     decision is final.
--   Consequences (all covered by the local harness):
--     $18 approved, receipt, in_progress, $12 requested and approved = $30.
--     Duplicate / retried approve PATCH: the row is already
--       materials_approved, so there is no transition and nothing is added.
--     approved -> requested -> approved replay: refused for clients (C3);
--       a privileged reopen keeps request #n, already decided, so $0. Only a request created from
--       en_route / arrived / diagnosing / in_progress counts again.
--     Declined, then reopened: refused for clients (C3); a privileged
--       reopen then approve adds $0 (first decision final).
--     Request #n abandoned without a decision, then request #n+1 approved:
--       only #n+1 counts.
--   Why this rule: it needs no Pro app change, it is stamped server-side so
--   a client cannot mint a new request, and it matches the lifecycle 0009
--   was written for. A Pro who needs more materials goes through receipt ->
--   in_progress -> Request Materials, which is a new request.
--
-- Existing rows (one-time, only when the columns are first added)
--   A job sitting at materials_requested when this file is pasted is request
--   #1, undecided (materials_request_seq = 1), so the customer can still
--   approve or decline it and it counts once. Every other row starts at 0/0,
--   meaning "nothing undecided": a reopen of an old request counts $0. This
--   UPDATE touches only materials_request_seq. No financial column, status
--   or other column is changed. Re-running the file does not repeat it.
--
-- Supersedes 0025's backfill
--   0025's commented "Founder step: optional backfill" (options A/B/C and
--   the option C UPDATE) is SUPERSEDED. Do not run it. The founder tightened
--   the rule on 2026-10-08: fill an approved amount only where explicit
--   customer approval is documented. See "Founder steps" below.
--
-- Does not change: RLS policies (0002 ... 0023), grants on public.jobs, the
--   job_status enum or lifecycle policies, pricing, fees (labor, emergency,
--   inspection, convenience, tip), materials_estimate_cents /
--   materials_items / materials_reimbursed_cents, payment fields, the
--   radius functions and triggers from 0023 (jobs_posted_within_radius,
--   haven_caller_within_radius, pro_claim_job, jobs_enforce_claim_radius),
--   profiles, the 0024 QA gate, or any existing financial value.

begin;

-- ── 0. Requires 0025 ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'jobs'
       and column_name = 'materials_approved_cents'
  ) then
    raise exception '0026 needs 0025_materials_approved_lock.sql first (jobs.materials_approved_cents is missing)';
  end if;
end$$;

-- ── 0b. Refuse to downgrade (added 2026-10-23, review finding 1) ──────────
-- 0028's body carries legacy_fill_ok and the ABANDON (0028) marker; a later
-- body is expected to carry a "haven-version:" line. If any is present,
-- re-running 0026 would undo it, so stop here: nothing in this file runs.
do $$
begin
  if exists (select 1 from pg_proc
              where pronamespace = 'public'::regnamespace
                and proname = 'jobs_lock_materials_approved'
                and (prosrc like '%legacy_fill_ok%' or prosrc like '%ABANDON (0028%'
                     or prosrc like '%haven-version:%')) then
    raise exception '0026 refused: 0028 or later is installed; re-running 0026 would downgrade jobs_lock_materials_approved. Nothing was changed.';
  end if;
end$$;

-- ── 1. Request bookkeeping columns (+ one-time init) ──────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'jobs'
       and column_name = 'materials_request_seq'
  ) then
    alter table public.jobs
      add column materials_request_seq integer not null default 0
        check (materials_request_seq >= 0);
    -- A request pending right now is request #1, still undecided.
    update public.jobs
       set materials_request_seq = 1
     where status = 'materials_requested';
  end if;
end$$;

alter table public.jobs
  add column if not exists materials_decided_seq integer not null default 0
    check (materials_decided_seq >= 0);

comment on column public.jobs.materials_request_seq is
  'Number of the current materials request. Stamped by trigger jobs_lock_materials_approved (0026) when a job moves into materials_requested from en_route, arrived, diagnosing or in_progress. Clients cannot write it.';

comment on column public.jobs.materials_decided_seq is
  'Highest materials request number already approved or declined. Each request is counted at most once (0026). Clients cannot write it.';

-- ── 2. Trigger function (replaces 0025's body, same name and trigger) ─────
-- SECURITY INVOKER on purpose so current_user is the real caller role.
-- PostgREST runs client requests as anon or authenticated; the SQL editor
-- runs as the owner; server jobs use service_role. auth.uid() is
-- Supabase's helper (request.jwt claims sub).
create or replace function public.jobs_lock_materials_approved()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  privileged boolean := current_user not in ('anon', 'authenticated');
  undecided boolean;
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

  -- C2: while a request is pending, the requested amount is frozen for
  --     EVERY client caller, the job's customer included (only privileged
  --     callers may correct it). The new-request move itself (allowed
  --     statuses -> materials_requested) sets it.
  if not privileged
     and (old.status = 'materials_requested'
          or old.materials_request_seq > old.materials_decided_seq)
     and not (new.status = 'materials_requested'
              and old.status in ('en_route', 'arrived', 'diagnosing', 'in_progress'))
     and (new.materials_estimate_cents is distinct from old.materials_estimate_cents
          or new.materials_items is distinct from old.materials_items) then
    raise exception 'The requested materials amount cannot change while the request is pending'
      using errcode = '42501',
            hint = 'The customer approves the amount shown at request time. Make a new request for a different amount.';
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
  if new.status = 'materials_requested'
     and old.status in ('en_route', 'arrived', 'diagnosing', 'in_progress') then
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
    end if;
  end if;

  return new;
end;
$$;

-- Trigger functions run without EXECUTE; nobody needs to call it directly.
revoke all on function public.jobs_lock_materials_approved() from public, anon, authenticated;

drop trigger if exists jobs_lock_materials_approved on public.jobs;
create trigger jobs_lock_materials_approved
  before insert or update on public.jobs
  for each row
  execute procedure public.jobs_lock_materials_approved();

-- ── 3. Column revokes ─────────────────────────────────────────────────────
-- No-op while the table-level INSERT / UPDATE grants on public.jobs exist
-- (0005 / 0002 / 0003, see 0025). The trigger is the guard; these keep the
-- columns out of any future column-level grant.
revoke insert (materials_request_seq, materials_decided_seq),
       update (materials_request_seq, materials_decided_seq)
  on table public.jobs from public;
revoke insert (materials_request_seq, materials_decided_seq),
       update (materials_request_seq, materials_decided_seq)
  on table public.jobs from anon;
revoke insert (materials_request_seq, materials_decided_seq),
       update (materials_request_seq, materials_decided_seq)
  on table public.jobs from authenticated;

commit;

-- ── Founder steps: historical materials (read-only first) ─────────────────
-- Rule (founder, 2026-10-08): fill materials_approved_cents only where
-- explicit customer approval is documented. A Pro receipt amount, a missing
-- decline fee, or status = materials_approved is not evidence on its own,
-- unless the actor is provably the customer. Never alter any other
-- financial column. 0025's option C backfill is superseded.
--
-- What evidence could exist (from the migrations and both apps' code):
--   job_status_events (0001): from_status, to_status, actor_role, actor_id,
--     at. The only table with an actor. Neither app writes it (no code path
--     in Customer or Pro). 0005 granted INSERT to anon and authenticated
--     (0019 removed anon), and no migration enables RLS on it, so any row
--     there was self-reported by a client: not proof of who acted.
--   materials_requests (0001): status pending/approved/declined,
--     responded_at, responded_by. Never written by either app. No migration
--     grants INSERT/UPDATE on it to anon or authenticated, so clients cannot
--     write it: a row there came from the owner / service_role. An
--     'approved' row with responded_by = jobs.customer_id is therefore
--     documented customer approval (group "documented" below).
--   materials_receipts (0001): Pro receipts. Never written (the Pro writes
--     jobs.materials_reimbursed_cents instead). Pro evidence, not customer.
--   Notifications: none in the database. Customer and Pro notifications are
--     localStorage only.
--   updated_by / approved_by / actor columns on jobs: none. jobs has no
--     updated_at either. The query below also searches the live schema for
--     any such column or table added outside the migrations.
--   jobs columns (status, materials_requested_at, materials_estimate_cents,
--     materials_reimbursed_cents, convenience_fee_cents): no actor. 0008 /
--     0006 / 0012 let the assigned Pro write materials_approved too (until
--     this file), so even status = materials_approved is not customer proof.
--   Supabase API / Postgres logs are outside the schema, short-lived, and do
--     not log PATCH bodies, so they cannot show who approved.
-- Conclusion: the only documented customer approval possible is an
-- 'approved' materials_requests row whose responded_by is the job's
-- customer. Everything else is ambiguous / Pro-only, stays at $0 materials
-- and is flagged. Founder decision (Req3) is PENDING: this file applies no
-- backfill; Step 3 is a disabled, opt-in fill for the documented group.
--
-- Step 1 (read-only). Every candidate evidence source: row count, whether
-- RLS is on, and whether API roles can write it. Expect 0 rows each.
-- select 'job_status_events' as source, count(*) as rows from public.job_status_events
-- union all select 'materials_requests', count(*) from public.materials_requests
-- union all select 'materials_receipts', count(*) from public.materials_receipts;
--
-- select c.relname as tbl, c.relrowsecurity as rls_enabled,
--        has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
--        has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert,
--        has_table_privilege('authenticated', c.oid, 'UPDATE') as auth_update
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public'
--    and c.relname in ('job_status_events', 'materials_requests', 'materials_receipts')
--  order by 1;
--
-- Anything added outside the migrations that could carry an actor:
-- select table_name, column_name
--   from information_schema.columns
--  where table_schema = 'public'
--    and (   column_name ~ '(updated|approved|responded|decided|actor|changed)_(by|id)$'
--         or table_name ~ '(notif|event|history|audit|approval)')
--  order by 1, 2;
--
-- The rows themselves, if any (materials decisions only):
-- select e.*, j.customer_id, (e.actor_id = j.customer_id) as actor_is_customer_id
--   from public.job_status_events e join public.jobs j on j.id = e.job_id
--  where e.from_status = 'materials_requested'
--     or e.to_status in ('materials_approved', 'materials_declined', 'inspection_completed')
--  order by e.job_id, e.at;
-- select r.*, j.customer_id, (r.responded_by = j.customer_id) as responder_is_customer_id
--   from public.materials_requests r join public.jobs j on j.id = r.job_id
--  order by r.job_id, r.requested_at;
--
-- Step 2 (read-only). ONE preview query, two labelled groups. Replace
-- <0026 paste time> with when you pasted 0026 (now() works in the same
-- sitting); later approvals are recorded by the trigger and are not legacy.
--   group = 'documented': Customer-responded request row (documented
--           evidence). documented_cents = sum of the approved rows'
--           estimated_total_cents; Step 3 would fill exactly this.
--   group = 'ambiguous':  ambiguous / Pro-only. Stays at $0 materials
--           (materials_approved_cents null) and is flagged for review.
-- with docs as (
--   select r.job_id, sum(r.estimated_total_cents)::int as documented_cents
--     from public.materials_requests r join public.jobs j on j.id = r.job_id
--    where r.status = 'approved' and r.responded_by = j.customer_id
--    group by r.job_id)
-- select case when d.job_id is not null
--             then 'documented: Customer-responded request row (documented evidence)'
--             else 'ambiguous / Pro-only: stays $0, flagged' end as review_group,
--        j.id, j.status, j.customer_id, j.pro_id, d.documented_cents,
--        j.materials_estimate_cents, j.materials_requested_at,
--        j.materials_reimbursed_cents, j.convenience_fee_cents, j.completed_at,
--        concat_ws(', ',
--          case when j.status = 'materials_approved' then 'status materials_approved (actor unknown)' end,
--          case when j.materials_reimbursed_cents > 0 then 'Pro receipt amount' end,
--          case when j.convenience_fee_cents > 0 then 'decline fee present' end,
--          case when j.materials_estimate_cents > 0 then 'estimate on row' end,
--          case when j.materials_requested_at is not null then 'request time on row' end,
--          case when exists (select 1 from public.job_status_events e where e.job_id = j.id
--                             and e.to_status = 'materials_approved') then 'status event (client-writable, not proof)' end,
--          case when exists (select 1 from public.materials_requests r where r.job_id = j.id
--                             and r.status = 'approved' and r.responded_by is distinct from j.customer_id)
--               then 'materials_requests approved row, responder not the customer' end
--        ) as signals
--   from public.jobs j left join docs d on d.job_id = j.id
--  where j.materials_approved_cents is null
--    and coalesce(j.materials_requested_at, j.posted_at) < '<0026 paste time>'
--    and (   d.job_id is not null
--         or j.status = 'materials_approved'
--         or j.materials_estimate_cents > 0
--         or j.materials_reimbursed_cents > 0
--         or j.materials_requested_at is not null
--         or jsonb_array_length(coalesce(j.materials_items, '[]'::jsonb)) > 0)
--  order by 1, j.posted_at;
--
-- Step 3. OPT-IN, DISABLED (founder decision pending, Req3). Fills the
-- 'documented' group only: materials_approved_cents / materials_approved_at,
-- only while still null, so a second run updates 0 rows and ambiguous jobs
-- (no customer-responded approved row) are never touched. To enable, remove
-- the leading "-- " from the lines between BEGIN-OPT-IN and END-OPT-IN and
-- run them as one query.
-- BEGIN-OPT-IN
-- begin;
-- update public.jobs j
--    set materials_approved_cents = d.documented_cents,
--        materials_approved_at    = coalesce(d.responded_at, now())
--   from (select r.job_id, sum(r.estimated_total_cents)::int as documented_cents,
--                max(r.responded_at) as responded_at
--           from public.materials_requests r join public.jobs jj on jj.id = r.job_id
--          where r.status = 'approved' and r.responded_by = jj.customer_id
--          group by r.job_id) d
--  where j.id = d.job_id
--    and j.materials_approved_cents is null;
-- commit;
-- END-OPT-IN
--
-- Any other job: founder decision only, one job at a time. If the customer
-- confirms an approval in writing outside the app (keep that record), fill
-- that job by hand (materials_approved_cents / materials_approved_at only,
-- only while null). Replace the id and the confirmed amount.
-- update public.jobs
--    set materials_approved_cents = 1800,
--        materials_approved_at    = now()
--  where id = '<job uuid>'
--    and materials_approved_cents is null;

-- ── Verify ────────────────────────────────────────────────────────────────
-- Columns: integer, not null, default 0.
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'jobs'
--    and column_name in ('materials_request_seq', 'materials_decided_seq');
--
-- Trigger installed and enabled ('O'); its function carries the 0026 guard.
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.jobs'::regclass and tgname = 'jobs_lock_materials_approved';
-- select prosrc like '%Only the customer can approve or decline materials%' as has_0026_guard
--   from pg_proc where proname = 'jobs_lock_materials_approved';
--
-- No policy was added or changed (same list as before pasting).
-- select policyname, cmd, permissive from pg_policies
--  where schemaname = 'public' and tablename = 'jobs' order by policyname;
--
-- Pro decision is refused, rolled back (replace with a job now at
-- materials_requested and its assigned Pro). Expect ERROR 42501
-- "Only the customer can approve or decline materials on this job".
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<pro uuid>","role":"authenticated"}', true);
--   update public.jobs set status = 'materials_approved' where id = '<job uuid>';
-- rollback;
--
-- Customer approval counts once, rolled back (same job, its customer).
-- Expect materials_approved_cents = earlier amount + estimate, and
-- materials_decided_seq = materials_request_seq.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<customer uuid>","role":"authenticated"}', true);
--   update public.jobs set status = 'materials_approved' where id = '<job uuid>';
--   select status, materials_estimate_cents, materials_approved_cents,
--          materials_request_seq, materials_decided_seq
--     from public.jobs where id = '<job uuid>';
-- rollback;

-- ── Rollback (only if this file must be undone) ───────────────────────────
-- Each option is ONE transaction; run it as one SQL-editor query. Order
-- matters: undo 0026's trigger function first, then 0025, then drop
-- columns. Dropping a column while a function that reads it is still the
-- trigger breaks every jobs write (42703).
--
-- R1. Undo 0026 only, back to 0025 behaviour (Pro-alone approval moves the
--     status and records $0):
--     For rollback use 0025-review/recovery/0026_R1_back_to_0025.sql (one
--     run, one transaction). It restores 0025's trigger function, then drops
--     the 0026 seq columns, and refuses while 0028 or 0029 is installed.
--     Do not re-paste 0025 for this: the guarded 0025 refuses while the 0026
--     columns exist.
--
-- R2. Undo 0026 and 0025 together:
-- begin;
-- drop trigger if exists jobs_lock_materials_approved on public.jobs;
-- drop function if exists public.jobs_lock_materials_approved();
-- alter table public.jobs drop column if exists materials_decided_seq;
-- alter table public.jobs drop column if exists materials_request_seq;
-- alter table public.jobs drop column if exists materials_approved_at;
-- alter table public.jobs drop column if exists materials_approved_cents;
-- commit;
