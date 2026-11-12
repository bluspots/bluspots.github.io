-- Haven shared backend: the Customer cannot move their own job into a work status (MIG-0039)
-- DRAFT. NOT APPLIED. Do not merge. Paste only after the founder authorizes it in his own words.
-- CoS audit finding F5 (2026-11-12, /t666): a Customer could PATCH their own job to complete (or to
-- en_route / arrived / in_progress ...) through RLS. 0029 (#90 eff1315e, rule IV.3) already closes this,
-- but 0029 waits behind 0025 -> 0026 -> 0028 and the fee decisions. 0039 is the same rule on its own, so
-- it can ship first. It coexists with 0029 in either order (same SQLSTATE 42501 and message).
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor as ONE run, as the database owner
-- (postgres). Order: checks/0039a (read-only, row 00 READY) -> this file -> checks/0039b (row 000 LIVE).
-- Rollback: supabase/rollback/0039_customer_status_guard_rollback.sql. Contract: supabase/contracts/
-- CUSTOMER_STATUS_GUARD_CONTRACT.md. Needs only public.jobs and the job_status type (0001); works with or
-- without 0025-0029, 0036, 0037, 0038.
--
-- WHAT IT ADDS: one SECURITY INVOKER trigger function public.jobs_customer_status_guard() and one
-- BEFORE UPDATE OF status trigger on public.jobs. For anon / authenticated callers only: when the caller
-- is the job's Customer (and not also its assigned Pro) and the status changes INTO posted, en_route,
-- arrived, diagnosing, materials_requested, in_progress or complete, the update is refused (42501) and
-- nothing is written. Unchanged: the Customer's own moves (cancelled, materials_approved,
-- materials_declined, inspection_completed, under the existing RLS and 0026/0029 rules), every Pro
-- move, and every privileged path (pro_claim_job, customer_cancel_job, admin RPCs, the SQL editor).
-- No table, column, policy, grant or data row is added or changed.

begin;

-- ---------------------------------------------------------------- 0. guards (refuse, change nothing)
do $$
declare v text;
begin
  if to_regclass('public.jobs') is null then
    raise exception '0039: public.jobs missing. Nothing was changed.';
  end if;
  if (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname)
        from pg_attribute a where a.attrelid = 'public.jobs'::regclass and a.attnum > 0 and not a.attisdropped
         and a.attname in ('customer_id', 'pro_id', 'status'))
     is distinct from 'customer_id:uuid,pro_id:uuid,status:job_status' then
    raise exception '0039: public.jobs customer_id / pro_id / status are not as reviewed. Nothing was changed.';
  end if;
  if (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = 'public.job_status'::regtype)
     is distinct from 'posted,en_route,arrived,diagnosing,materials_requested,materials_approved,materials_declined,in_progress,inspection_completed,complete,cancelled' then
    raise exception '0039: job_status values differ from the reviewed set. Send this to Codey. Nothing was changed.';
  end if;
  if to_regprocedure('auth.uid()') is null then
    raise exception '0039: auth.uid() missing. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
     or not has_table_privilege(current_user, 'public.jobs', 'trigger')
     or not has_schema_privilege(current_user, 'public', 'create') then
    raise exception '0039: run as the database owner (postgres), not %. Nothing was changed.', current_user;
  end if;
  select md5(replace(p.prosrc, E'\r', '')) into v from pg_proc p where p.oid = to_regprocedure('public.jobs_customer_status_guard()');
  if v is not null and v <> '5712f23601a5d5428f774ae71ace3593' then
    raise exception '0039: public.jobs_customer_status_guard() already exists with another body (md5 %). Send this to Codey. Nothing was changed.', v;
  end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_customer_status_guard'
                and t.tgfoid is distinct from to_regprocedure('public.jobs_customer_status_guard()')) then
    raise exception '0039: a trigger named jobs_customer_status_guard runs another function. Nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------- 1. trigger function
-- SECURITY INVOKER on purpose: current_user is the real caller role.
create or replace function public.jobs_customer_status_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$-- haven-version: 0039-v1 (2026-11-12 t674, CoS audit F5).
declare
  v_uid uuid := auth.uid();
begin
  -- privileged callers (SQL editor / owner, service_role, SECURITY DEFINER RPCs such as
  -- pro_claim_job, customer_cancel_job and the Founder Control Center) are not limited here
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  -- the job's own Customer (who is not also its assigned Pro) may not set a work or dispatch status
  if v_uid is not null and v_uid = old.customer_id and old.pro_id is distinct from v_uid
     and new.status in ('posted', 'en_route', 'arrived', 'diagnosing', 'materials_requested', 'in_progress', 'complete') then
    raise exception 'The customer cannot set this job status'
      using errcode = '42501',
            hint = 'Only the assigned Pro (or Haven) moves a job to en_route, arrived, diagnosing, materials_requested, in_progress, complete or back to posted.';
  end if;
  return new;
end;
$$;

revoke all on function public.jobs_customer_status_guard() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 2. trigger
drop trigger if exists jobs_customer_status_guard on public.jobs;
create trigger jobs_customer_status_guard
  before update of status on public.jobs
  for each row execute function public.jobs_customer_status_guard();

-- ---------------------------------------------------------------- 3. post-checks (any failure rolls back)
do $$
begin
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.jobs_customer_status_guard()')
                    and md5(replace(p.prosrc, E'\r', '')) = '5712f23601a5d5428f774ae71ace3593'
                    and not p.prosecdef and p.proconfig = array['search_path=pg_catalog, public, pg_temp']
                    and not has_function_privilege('anon', p.oid, 'execute')
                    and not has_function_privilege('authenticated', p.oid, 'execute')
                    and not has_function_privilege('service_role', p.oid, 'execute')) then
    raise exception '0039 post-check: function body / invoker / search_path / grants wrong. Rolled back.';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_customer_status_guard'
                    and t.tgtype = 19 and t.tgenabled = 'O' and t.tgqual is null
                    and t.tgattr::text = (select a.attnum::text from pg_attribute a where a.attrelid = 'public.jobs'::regclass and a.attname = 'status')
                    and t.tgfoid = to_regprocedure('public.jobs_customer_status_guard()')) then
    raise exception '0039 post-check: trigger is not BEFORE UPDATE OF status FOR EACH ROW, enabled. Rolled back.';
  end if;
end $$;

commit;
