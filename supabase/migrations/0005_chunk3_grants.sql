-- Haven shared backend — CHUNK 3 grants
-- Purpose: grant additional privileges required for prototype UPDATEs (and optional audit inserts)
-- Idempotent: re-running these GRANTs is safe.

-- Allow anon/authenticated to UPDATE jobs (needed for claim + terminal transitions)
grant update on public.jobs to anon, authenticated;

-- Optional (nice-to-have): allow inserting job status events for audit during prototype.
-- No RLS is enabled on this table in this prototype; GRANT suffices.
grant insert on public.job_status_events to anon, authenticated;

