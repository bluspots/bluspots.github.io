-- Haven: ROLLBACK for 0038 (customer_cancel_job). DRAFT. Paste only if the founder asks.
-- One run, as the database owner. Drops only the function (PostgREST then answers 404 for it).
-- Jobs already cancelled through it stay cancelled, and their job_status_events rows stay.
begin;
drop function if exists public.customer_cancel_job(uuid);
commit;
