-- Haven shared backend — approved-materials lock (Phase 1B B2)
-- Number: 0025 (next after 0024_qa_tester_gate.sql).
-- Pro has no migrations folder. This is the one paste for both apps.
--
-- Paste this whole file in the Supabase SQL editor as the database owner,
-- after 0024 (already applied live). Do not apply it from the app, from CI,
-- or from an agent. Safe to re-run.
--
-- Why
--   The Customer receipt (PR #45) counts materials_estimate_cents whenever
--   status is materials_approved, in_progress or complete. The estimate is
--   written when the Pro requests materials and a decline never clears it,
--   so a job whose request was declined and that later reached in_progress or
--   complete still showed the estimate. The status alone cannot say whether
--   the customer approved. This file stores the approved amount at the
--   moment of approval, so the receipt reads a fact instead of guessing.
--
-- What it does
--   1. jobs.materials_approved_cents integer, nullable, no default, >= 0.
--      jobs.materials_approved_at timestamptz, nullable.
--        null  = no approval recorded (never requested, or a row from before
--                this file that has not been backfilled). The app treats
--                null as $0 materials.
--        0     = a materials request was declined and nothing had been
--                approved earlier on the job.
--        > 0   = total materials the customer approved on this job.
--      Nullable (not default 0) on purpose: it keeps "the trigger recorded a
--      decision" (0 or more) apart from "no record yet" (null), which is what
--      the optional backfill below needs to find legacy rows. No existing row
--      is changed by adding the columns.
--   2. BEFORE INSERT OR UPDATE trigger jobs_lock_materials_approved on
--      public.jobs. Status values are the job_status enum from 0001 / 0004.
--        materials_requested -> materials_approved (customer approves, 0008):
--          materials_approved_cents = prior approved amount (or 0)
--                                     + OLD.materials_estimate_cents
--          materials_approved_at    = now()
--          OLD is the estimate the customer was shown. An estimate change
--          sent in the same PATCH as the approval is not what gets locked.
--        materials_requested -> materials_declined (standard decline, 0006)
--        materials_requested -> inspection_completed (diagnosis decline, 0006):
--          materials_approved_cents = prior approved amount, or 0 if none
--          materials_approved_at    = unchanged (null if nothing was approved)
--          "Zeroed" means this request adds nothing. It never erases an
--          amount the customer approved on an earlier request.
--        Every other insert or update by anon / authenticated: client values
--          for both columns are ignored. INSERT forces null / null. UPDATE
--          keeps OLD. So a customer or Pro cannot write either column
--          directly, and a later edit of materials_estimate_cents (possible:
--          jobs has a table-level UPDATE grant) does not move the lock.
--        The database owner / SQL editor and service_role may set the two
--          columns explicitly (the founder backfill below needs that). If
--          they change status without touching the columns, the same
--          transition rules apply.
--   3. Revokes column INSERT / UPDATE on both columns from public, anon and
--      authenticated, as 0024 does.
--
-- Grants on public.jobs (checked in migrations, confirm with Verify below)
--   UPDATE is a TABLE-level grant: 0005 "grant update on public.jobs to anon,
--   authenticated" (0019 revoked it from anon only). INSERT is table-level
--   too (0002 / 0003, anon revoked by 0019). Supabase's default privileges
--   also grant table-level rights on new public tables. A table-level grant
--   covers every column, including new ones, and a column-level REVOKE does
--   not remove it. So the revokes in section 3 are belt-and-braces only; the
--   trigger is the real guard. This file does not narrow the table grant,
--   because that would change what the apps can write today.
--
-- Re-request (second materials request on the same job)
--   0009 lets the assigned Pro move in_progress -> materials_requested, and
--   the Pro app shows "Need materials? Request them" on in_progress. That
--   request PATCH replaces materials_items and materials_estimate_cents with
--   the NEW request only (haven-pro backend_adapter.js), and the Pro's
--   materials_reimbursed_cents grows per receipt. So:
--     approve #1 ($18) -> approved 1800
--     approve #2 ($12) -> approved 3000 (adds, does not replace)
--     decline #2       -> approved stays 1800 (job ends materials_declined)
--   Known limit: if a job goes materials_approved -> materials_requested
--   with no receipt in between (RLS allows it, the Pro app has no button for
--   it) and the Pro re-sends a revised full list, approving it adds again.
--   Flagged for the founder; not handled here because it needs a lifecycle
--   rule.
--
-- Does not change: RLS policies (0002 ... 0023), the job status ladder or
--   lifecycle policies (including who may write materials_approved; see the
--   note below), pricing, fees (labor, emergency, inspection, convenience,
--   tip), materials_estimate_cents / materials_items /
--   materials_reimbursed_cents, the radius functions and triggers from 0023
--   (jobs_posted_within_radius, haven_caller_within_radius, pro_claim_job,
--   jobs_enforce_claim_radius), profiles, the 0024 QA gate, or any existing
--   row. It does not add a "require in_progress before complete" rule.
--
-- Note (not changed here): permissive UPDATE policies are OR-ed, and 0006 /
--   0012 / 0013 use USING (pro_id is not null). So any assigned row can be
--   moved to materials_approved, including by the assigned Pro (0017 allows
--   the Pro on their own job). This trigger records the amount on any
--   materials_requested -> materials_approved write, whoever sends it.

-- ── 1. Columns ────────────────────────────────────────────────────────────
alter table public.jobs
  add column if not exists materials_approved_cents integer null
    check (materials_approved_cents is null or materials_approved_cents >= 0);

alter table public.jobs
  add column if not exists materials_approved_at timestamptz null;

comment on column public.jobs.materials_approved_cents is
  'Materials the customer approved on this job, in cents. Set only by trigger jobs_lock_materials_approved on materials_requested -> materials_approved (adds OLD.materials_estimate_cents). A decline adds nothing. null = no approval recorded. Clients cannot write it.';

comment on column public.jobs.materials_approved_at is
  'When the latest materials approval was recorded. Set only by trigger jobs_lock_materials_approved. Clients cannot write it.';

-- ── 2. Lock trigger ───────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose so current_user is the real caller role.
-- PostgREST runs client requests as anon or authenticated; the SQL editor
-- runs as the owner; server jobs use service_role. Same test as 0024's
-- haven_qa_privileged_caller(), inlined so this file stands alone.
create or replace function public.jobs_lock_materials_approved()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  privileged boolean := current_user not in ('anon', 'authenticated');
  prior_cents integer;
begin
  if tg_op = 'INSERT' then
    if not privileged then
      new.materials_approved_cents := null;
      new.materials_approved_at := null;
    end if;
    return new;
  end if;

  -- UPDATE. An explicit change by a privileged caller wins (founder backfill
  -- or a manual correction in the SQL editor).
  if privileged
     and (new.materials_approved_cents is distinct from old.materials_approved_cents
          or new.materials_approved_at is distinct from old.materials_approved_at) then
    return new;
  end if;

  -- Client values are ignored: keep what is stored.
  new.materials_approved_cents := old.materials_approved_cents;
  new.materials_approved_at := old.materials_approved_at;

  if old.status = 'materials_requested' and new.status is distinct from old.status then
    prior_cents := coalesce(old.materials_approved_cents, 0);
    if new.status = 'materials_approved' then
      new.materials_approved_cents := prior_cents + coalesce(old.materials_estimate_cents, 0);
      new.materials_approved_at := now();
    elsif new.status in ('materials_declined', 'inspection_completed') then
      new.materials_approved_cents := prior_cents;
      -- materials_approved_at stays OLD: null when nothing was ever approved.
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.jobs_lock_materials_approved() from public;
grant execute on function public.jobs_lock_materials_approved() to anon, authenticated;

drop trigger if exists jobs_lock_materials_approved on public.jobs;
create trigger jobs_lock_materials_approved
  before insert or update on public.jobs
  for each row
  execute procedure public.jobs_lock_materials_approved();

-- ── 3. Column revokes ─────────────────────────────────────────────────────
-- No-op while the table-level INSERT / UPDATE grants above exist (see
-- header). Kept so the columns stay out of any future column-level grant.
-- (Revoking a privilege that was never granted is a warning, not an error.)
revoke insert (materials_approved_cents, materials_approved_at),
       update (materials_approved_cents, materials_approved_at)
  on table public.jobs from public;
revoke insert (materials_approved_cents, materials_approved_at),
       update (materials_approved_cents, materials_approved_at)
  on table public.jobs from anon;
revoke insert (materials_approved_cents, materials_approved_at),
       update (materials_approved_cents, materials_approved_at)
  on table public.jobs from authenticated;

-- ── Founder step: optional backfill (decide first, then run by hand) ──────
-- Existing rows get materials_approved_cents = null, which the updated
-- Customer app shows as $0 materials. Rows already at materials_approved,
-- in_progress or complete may have had an approval before this file.
--
-- What history exists (checked in both repos):
--   - job_status_events, materials_requests, materials_receipts (0001) are
--     never written by either app. Expect 0 rows (first query below).
--   - No decline timestamp exists. jobs.materials_requested_at is the
--     request time only.
--   - Indirect evidence on the job row:
--       materials_reimbursed_cents > 0: the Pro submitted a receipt, which
--         the Pro app only allows from materials_approved (receipt PATCH is
--         materials_approved -> in_progress). Strong sign of approval.
--       convenience_fee_cents > 0: a standard decline wrote it (customer
--         and Pro decline both send 3000). Strong sign of a decline.
--       inspection_fee_cents is not a signal: the Customer app writes 4500
--         at posting for every diagnosis job.
--   - An in_progress / complete row with an estimate, no receipt amount and
--     no decline fee cannot be told apart: approved-but-no-receipt and
--     declined-then-moved look the same.
--   - For a job with two requests, materials_estimate_cents is only the
--     latest request, so a backfill from it can be short.
--
-- Options:
--   A. Do nothing. Old receipts show labor only until corrected by hand.
--      Never overstates; may understate approved materials.
--   B. Copy materials_estimate_cents for every materials_approved /
--      in_progress / complete row. Same numbers as PR #45 today, including
--      the bug this file fixes for declined-then-moved rows.
--   C. Evidence only (recommended): backfill rows at materials_approved and
--      rows with a receipt amount and no decline fee (buckets 1 and 2 in the
--      preview). Leave bucket 3 (no evidence) and bucket 4 (decline fee) at
--      null and review them by hand; with no charge taken yet ("Not charged
--      yet"), understating is safer than billing a declined amount.
--   Run the backfill before any re-request on a legacy job: a later approval
--   adds to the stored amount, and null counts as 0.
--
-- History tables (expect all three to be 0):
-- select (select count(*) from public.job_status_events)   as status_events,
--        (select count(*) from public.materials_requests)  as materials_requests,
--        (select count(*) from public.materials_receipts)  as materials_receipts;
--
-- Preview (read-only). Lists every row a backfill could touch, by evidence:
-- select id, status, materials_estimate_cents, materials_reimbursed_cents,
--        convenience_fee_cents, materials_requested_at, completed_at,
--        case
--          when status = 'materials_approved'                               then '1_currently_approved'
--          when materials_reimbursed_cents > 0 and convenience_fee_cents = 0 then '2_receipt_submitted'
--          when convenience_fee_cents > 0                                    then '4_decline_fee_present'
--          else                                                                   '3_no_evidence'
--        end as evidence
--   from public.jobs
--  where status in ('materials_approved', 'in_progress', 'complete')
--    and materials_estimate_cents > 0
--    and materials_approved_cents is null
--  order by evidence, posted_at;
--
-- Option C (buckets 1 and 2). materials_approved_at is set to the backfill
-- time: the real approval time is not stored anywhere. Only rows still null,
-- so it never overwrites a decision the trigger recorded. Safe to re-run.
-- update public.jobs
--    set materials_approved_cents = materials_estimate_cents,
--        materials_approved_at    = now()
--  where materials_approved_cents is null
--    and materials_estimate_cents > 0
--    and (   status = 'materials_approved'
--         or (status in ('in_progress', 'complete')
--             and materials_reimbursed_cents > 0
--             and convenience_fee_cents = 0));
--
-- Option B would drop the last two conditions (and accept the bug above).
-- Single-row fix after review (replace the id and amount):
-- update public.jobs set materials_approved_cents = 1800, materials_approved_at = now()
--  where id = '<job uuid>' and materials_approved_cents is null;

-- ── Verify ────────────────────────────────────────────────────────────────
-- Columns: integer and timestamptz, both nullable, no default.
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'jobs'
--    and column_name in ('materials_approved_cents', 'materials_approved_at');
--
-- Lock trigger is installed and enabled ('O').
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.jobs'::regclass and tgname = 'jobs_lock_materials_approved';
--
-- Grants. table_update is expected true for authenticated (table-level grant
-- from 0005), which is why col_update also reads true and why the trigger,
-- not the revoke, is the guard. anon is expected false on both.
-- select has_table_privilege('authenticated', 'public.jobs', 'UPDATE') as auth_table_update,
--        has_column_privilege('authenticated', 'public.jobs', 'materials_approved_cents', 'UPDATE') as auth_col_update,
--        has_table_privilege('anon', 'public.jobs', 'UPDATE') as anon_table_update,
--        has_column_privilege('anon', 'public.jobs', 'materials_approved_cents', 'UPDATE') as anon_col_update;
--
-- No policy was added or changed by this file (same list as before pasting).
-- select policyname, cmd, permissive from pg_policies
--  where schemaname = 'public' and tablename = 'jobs' order by policyname;
--
-- Negative check in a transaction that is rolled back (replace both
-- placeholders with a real job and its customer). The row must come back
-- with materials_approved_cents unchanged, not 99999.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<customer uuid>","role":"authenticated"}', true);
--   update public.jobs set materials_approved_cents = 99999, materials_approved_at = now()
--    where id = '<job uuid>';
--   select id, status, materials_approved_cents, materials_approved_at from public.jobs where id = '<job uuid>';
-- rollback;
--
-- Transition check, rolled back (replace with a job now at
-- materials_requested). Expect materials_approved_cents = its estimate (plus
-- any earlier approved amount) and materials_approved_at set.
-- begin;
--   update public.jobs set status = 'materials_approved' where id = '<job uuid>';
--   select id, status, materials_estimate_cents, materials_approved_cents, materials_approved_at
--     from public.jobs where id = '<job uuid>';
-- rollback;

-- ── Rollback (only if this file must be undone) ───────────────────────────
-- The updated Customer app then falls back to the PR #45 status rule on its
-- next load (the column is gone, so its select retries without it).
-- drop trigger if exists jobs_lock_materials_approved on public.jobs;
-- drop function if exists public.jobs_lock_materials_approved();
-- alter table public.jobs drop column if exists materials_approved_at;
-- alter table public.jobs drop column if exists materials_approved_cents;
