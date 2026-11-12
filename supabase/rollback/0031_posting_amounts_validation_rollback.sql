-- Haven: ROLLBACK for 0031 (posting amount validation). DRAFT. Paste only if the founder asks.
-- One run, as the database owner. Removes only 0031's trigger and function, which restores the exact
-- 0029 state (clients may again insert any amounts the table CHECKs allow). Roll 0031 back before 0029
-- if both are undone. No job row is read or changed.
begin;
drop trigger if exists jobs_validate_posting_amounts on public.jobs;
drop function if exists public.jobs_validate_posting_amounts();
commit;
