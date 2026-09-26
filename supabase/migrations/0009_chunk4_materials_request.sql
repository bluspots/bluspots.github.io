-- CHUNK 4 — Pro materials request (prototype)
-- Purpose:
-- - Allow an assigned Pro to PATCH a job INTO materials_requested
-- - Materials metadata columns are optionally re-added for paste-safety if 0008 was skipped
-- Notes:
-- - Idempotent where possible (ADD COLUMN IF NOT EXISTS; DROP POLICY IF EXISTS then CREATE POLICY)
-- - No new fees added. Grants from 0005 already allow UPDATE on public.jobs.

-- Optional columns (safe to re-apply)
alter table public.jobs
  add column if not exists materials_items jsonb not null default '[]'::jsonb;

alter table public.jobs
  add column if not exists materials_estimate_cents int not null default 0 check (materials_estimate_cents >= 0);

alter table public.jobs
  add column if not exists materials_requested_at timestamptz null;

-- Ensure RLS is enabled (safe repeat)
alter table public.jobs enable row level security;

-- RLS UPDATE: allow assigned pro to set materials_requested from mid-job states
drop policy if exists jobs_update_assigned_to_materials_requested on public.jobs;
create policy jobs_update_assigned_to_materials_requested
  on public.jobs
  for update
  to anon, authenticated
  using (
    pro_id is not null
    and status in ('en_route','arrived','diagnosing','in_progress')
  )
  with check (
    status = 'materials_requested'
    and pro_id is not null
  );

