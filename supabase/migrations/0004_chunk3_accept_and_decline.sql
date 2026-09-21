-- Haven shared backend — CHUNK 3 (Accept + Materials‑Decline)
-- Scope:
-- 1) Extend job_status enum with 'materials_declined'
-- 2) Add convenience_fee_cents to jobs
-- 3) Prototype RLS UPDATE policies to allow:
--    - Claim: posted (unassigned) -> en_route (assigned)
--    - Terminal writes needed for demo: -> inspection_completed or -> materials_declined
-- 4) Grant UPDATE on jobs to anon/authenticated (prototype)
--
-- Notes:
-- - Additive/idempotent where possible.
-- - Do NOT weaken the one_active_job_per_pro unique index; terminals are not active.
-- - Policies here are intentionally narrow and temporary for the prototype;
--   they will be replaced by auth-scoped ownership checks later.

-- 1) Add enum value to job_status: 'materials_declined'
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'job_status'
      and e.enumlabel = 'materials_declined'
  ) then
    -- Place after 'materials_approved' for readability; position is informational.
    alter type job_status add value 'materials_declined' after 'materials_approved';
  end if;
end$$;

-- 2) Add convenience_fee_cents to jobs (non-negative, default 0)
alter table public.jobs
  add column if not exists convenience_fee_cents int not null default 0 check (convenience_fee_cents >= 0);

-- 3) RLS UPDATE policies for CHUNK 3 prototype
-- Ensure RLS is enabled (already enabled in 0002; safe to re-run)
alter table public.jobs enable row level security;

-- 3a) Claim policy — allow accepting a job:
--     Only when the CURRENT row is posted and unassigned,
--     and the NEW row becomes en_route with a pro assigned.
create policy if not exists jobs_update_claim_posted_to_en_route
  on public.jobs
  for update
  to anon, authenticated
  using (
    status = 'posted'
    and pro_id is null
  )
  with check (
    status = 'en_route'
    and pro_id is not null
  );

-- 3b) Terminal writes for demo — allow setting assigned jobs to:
--     - inspection_completed (diagnosis decline path), or
--     - materials_declined (standard decline path).
--     Narrow: requires the row is already assigned; only permits those terminal statuses.
create policy if not exists jobs_update_assigned_to_decline_terminals
  on public.jobs
  for update
  to anon, authenticated
  using (
    pro_id is not null
  )
  with check (
    status in ('inspection_completed','materials_declined')
  );

-- 4) Table privileges for REST access (prototype; idempotent)
grant update on public.jobs to anon, authenticated;

