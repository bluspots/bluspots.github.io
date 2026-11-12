-- Haven: ROLLBACK for 0039 (customer status guard). DRAFT. Paste only if the founder asks.
-- One run, as the database owner. Removes only 0039's trigger and function. If 0029 is installed its rule
-- IV.3 still refuses the same Customer moves; without 0029 the F5 gap is open again.
begin;
drop trigger if exists jobs_customer_status_guard on public.jobs;
drop function if exists public.jobs_customer_status_guard();
commit;
