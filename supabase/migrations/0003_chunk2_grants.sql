-- Haven shared backend — CHUNK 2 (Customer) grants
-- Purpose: ensure anon/authenticated can SELECT and INSERT via Supabase REST
-- Idempotent: re-running these GRANTs is safe.
grant select, insert on public.jobs to anon, authenticated;

