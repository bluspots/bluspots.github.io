-- Haven: ROLLBACK of MIG-0036 (realtime job signal). Paste ONLY if told to undo 0036.
-- Same SQL as the commented Rollback block at the end of supabase/migrations/0036_realtime_job_signal.sql.
-- Drops the trigger FIRST (so a job write never calls a missing function), then the function,
-- then the realtime.messages policy. Touches nothing else (no table, no row, no other policy).
-- Safe to re-run. After it, the apps stop receiving signals and keep working on focus /
-- reconnect / poll refetch (contract "failure modes").
begin;
drop trigger if exists jobs_signal_parties on public.jobs;
drop function if exists public.jobs_signal_parties();
drop policy if exists jobs_signal_read_own_topic on realtime.messages;
commit;
