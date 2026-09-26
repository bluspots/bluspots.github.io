-- CHUNK 4 — Customer materials approval (prototype)
-- Purpose:
-- - Allow a customer to PATCH an assigned job from materials_requested → materials_approved
-- - Add minimal optional columns for materials request metadata if not already present
-- Notes:
-- - Idempotent where possible (ADD COLUMN IF NOT EXISTS; DROP POLICY IF EXISTS then CREATE POLICY)
-- - No new fees added here. Existing Chunk 3 grants/policies remain intact.
-- - SELECT visibility for materials_approved is already covered by 0007 (assigned/active SELECT); no change needed.

-- Optional columns for demo metadata captured on the job row itself (lightweight projection)
alter table public.jobs
  add column if not exists materials_items jsonb not null default '[]'::jsonb;

alter table public.jobs
  add column if not exists materials_estimate_cents int not null default 0 check (materials_estimate_cents >= 0);

alter table public.jobs
  add column if not exists materials_requested_at timestamptz null;

-- Ensure RLS is enabled (safe to repeat)
alter table public.jobs enable row level security;

-- RLS UPDATE: allow customer-side transition materials_requested → materials_approved
drop policy if exists jobs_update_materials_requested_to_approved on public.jobs;
create policy jobs_update_materials_requested_to_approved
  on public.jobs
  for update
  to anon, authenticated
  using (
    status = 'materials_requested'
    and pro_id is not null
  )
  with check (
    status = 'materials_approved'
    and pro_id is not null
  );

