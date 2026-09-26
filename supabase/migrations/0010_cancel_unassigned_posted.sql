-- Haven shared backend — CHUNK 3 RLS (customer pre‑accept cancel)
-- Purpose: Allow customers to cancel UNASSIGNED "posted" jobs so the Pro
--          marketplace does not keep them listed as claimable.
-- Notes:
-- - Idempotent: drop policy if exists, then recreate it.
-- - Scope is narrow: ONLY permits posted (unassigned) -> cancelled (still unassigned).
-- - This does NOT weaken claim / one‑active‑job / materials policies.
-- - Allows setting cancelled_at alongside status (no additional check required).

-- Ensure RLS is enabled (safe if already enabled)
alter table public.jobs enable row level security;

-- Update policy: posted (unassigned) → cancelled (unassigned)
drop policy if exists jobs_update_cancel_posted_to_cancelled on public.jobs;
create policy jobs_update_cancel_posted_to_cancelled
  on public.jobs
  for update
  to anon, authenticated
  using (
    status = 'posted'
    and pro_id is null
  )
  with check (
    status = 'cancelled'
    and pro_id is null
  );

