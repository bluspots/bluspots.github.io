-- Rollback for 0032_job_live_location.sql (MIG-0032, live tracking v1).
-- DRAFT. NOT AUTHORIZED TO RUN. Same SQL as the commented Rollback block at the
-- end of 0032. Paste as one run in the Supabase SQL editor as the database owner,
-- only with founder approval. Discards every live point (they are ephemeral).
-- Drops the trigger FIRST (including its status / pro_id / customer_id watch),
-- then the functions (their grants and revokes go with them), then the table.
-- Touches nothing else (jobs, profiles, 0027 / 0030 objects stay exactly as
-- they are).
begin;
drop trigger if exists jobs_discard_live_location on public.jobs;
drop function if exists public.jobs_discard_live_location();
drop function if exists public.get_job_live_location(uuid);
drop function if exists public.pro_update_live_location(uuid, double precision, double precision, timestamptz);
drop table if exists public.job_live_locations;
commit;
