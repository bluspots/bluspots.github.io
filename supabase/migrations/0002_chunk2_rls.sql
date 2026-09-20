-- Haven shared backend — CHUNK 2 (Customer) RLS prototype
-- Scope: enable RLS on public.jobs and allow limited anonymous inserts/selects
-- NOTE: Prototype only until real auth is wired; policies will be tightened later.
--       Do NOT relax constraints that protect assignment/status beyond 'posted'.

-- Enable Row Level Security on jobs (minimum required in this chunk)
alter table public.jobs enable row level security;

-- Optional: keep as-is for other tables in this chunk. Additional tables will be
-- covered in later slices when those write/read paths are implemented.

-- Policy: Allow anonymous and authenticated clients to create "posted" jobs only,
--         with no pro assigned. This is sufficient for Customer-side job creation.
create policy jobs_insert_posted_only
  on public.jobs
  for insert
  to anon, authenticated
  with check (
    status = 'posted'
    and pro_id is null
  );

-- Policy: Allow reading jobs that are publicly "posted" (feed-safe subset).
create policy jobs_select_posted
  on public.jobs
  for select
  to anon, authenticated
  using (
    status = 'posted'
  );

-- Intentionally NO update/delete policies in this chunk.
-- - Pro assignment and status transitions are out of scope here.
-- - Materials/tips/inspection paths are also out of scope.
-- Real auth and finer-grained ownership checks will replace these prototypes.

