-- Haven: ROLLBACK for 0037 (live-location sessions + immediate stop). DRAFT. Paste only if the founder asks.
-- One run, as the database owner. Removes only 0037 objects. 0032 (its writer, reader, discard trigger,
-- table and grants) is untouched, so after this the 0032 4-argument writer works again exactly as
-- before 0037 and the new 5-argument writer / start / stop no longer exist (PostgREST 404).
-- Live points already stored stay until the job leaves en_route (0032) or the 5-minute 'paused' rule.
begin;
drop trigger if exists job_live_locations_require_session on public.job_live_locations;
drop trigger if exists jobs_end_live_session on public.jobs;
drop function if exists public.job_live_locations_require_session();
drop function if exists public.jobs_end_live_session();
drop function if exists public.pro_start_live_location(uuid);
drop function if exists public.pro_stop_live_location(uuid);
drop function if exists public.pro_update_live_location(uuid, uuid, double precision, double precision, timestamptz);
drop table if exists public.job_live_sessions;
commit;
