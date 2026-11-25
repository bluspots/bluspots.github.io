-- Haven shared backend: the Customer cannot drive their own job, and nobody claims a job they posted (MIG-0039)
-- DRAFT. NOT APPLIED. Do not merge. Paste only after the founder authorizes it in his own words.
-- CoS audit finding F5 (2026-11-12, /t666): a Customer could PATCH their own job to complete (or to
-- en_route / arrived / in_progress ...) through RLS. 0029 (#90 eff1315e, rules IV.1-IV.3) already closes
-- this, but 0029 waits behind 0025 -> 0026 -> 0028 and the fee decisions. 0039 is the same rules on their
-- own, so it can ship first. It coexists with 0029 in either order (same SQLSTATE 42501 and messages).
-- v2 (t676, Quagon review of 58489a14): HIGH-1 self-claim bypass closed (a Customer could set their own
-- operating point, claim their own posted job through pro_claim_job and then complete it as its "Pro");
-- MED-1 source-state limits for the Customer's 4 own targets; LOW-1 complete only from in_progress.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor as ONE run, as the database owner
-- (postgres). Order: checks/0039a (read-only, row 00 READY) -> this file -> checks/0039b (row 000 LIVE).
-- Rollback: supabase/rollback/0039_customer_status_guard_rollback.sql. Contract: supabase/contracts/
-- CUSTOMER_STATUS_GUARD_CONTRACT.md. Needs public.jobs, the job_status type (0001) and the LIVE 0030
-- pro_claim_job (body md5 789cb65e77775da031012f78227d76ad); works with or without 0025-0029, 0036-0038.
--
-- WHAT IT ADDS / CHANGES:
-- 1. public.jobs_customer_status_guard() (SECURITY INVOKER) + BEFORE UPDATE OF status trigger. For anon /
--    authenticated callers only, on a real status change:
--    a. the job's Customer may only: cancel from posted with no Pro; approve or decline materials from
--       materials_requested; end at inspection_completed from diagnosing or materials_requested
--       (0029 IV.3 + I + III.4 sources). Every other Customer move is refused. There is NO exemption for a
--       Customer who is also the assigned Pro (v1 had one; that was HIGH-1).
--    b. anyone else (the assigned Pro): complete only from in_progress (0029 IV.1).
-- 2. public.jobs_no_self_assignment() (SECURITY INVOKER) + BEFORE INSERT OR UPDATE OF pro_id, customer_id
--    trigger: a job can never be claimed by or assigned to the account that posted it. EVERY caller,
--    privileged ones too (0029 IV.2, founder policy 2026-10-23, same message and SQLSTATE).
-- 3. public.pro_claim_job(uuid): the LIVE 0030 body with one added condition (customer_id <> caller) in
--    the claimable-job lookup and in the claim UPDATE. A self-claim gets the same P0002 "job not claimable"
--    as a job that is already taken, before the busy-Pro (C1) and radius checks, so the C1 error order and
--    the no-existence-leak property are unchanged. Same signature, return, owner, grants, search_path.
--    NOTE: the Founder Control Center fingerprint haven_admin.baseline_mismatches() (0035) pins the 0030
--    pro_claim_job; after this paste it reports "public.pro_claim_job(uuid) (changed)". That is expected
--    (see the contract) and is only read at 0035 paste time and by the read-only FCC verify probe.
-- Unchanged: the job board (jobs_posted_within_radius), every policy, grant, column and data row.
-- The 0038 customer_cancel_job, the FCC admin RPCs and the SQL editor are privileged and skip rule 1.

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
  if v is not null and v <> '46c813cf28c2ccabd206ff24c960bee3' then
    raise exception '0039: public.jobs_customer_status_guard() already exists with another body (md5 %). Send this to Codey. Nothing was changed.', v;
  end if;
  select md5(replace(p.prosrc, E'\r', '')) into v from pg_proc p where p.oid = to_regprocedure('public.jobs_no_self_assignment()');
  if v is not null and v <> '0527ced8e3546472bb31b7259b13024f' then
    raise exception '0039: public.jobs_no_self_assignment() already exists with another body (md5 %). Send this to Codey. Nothing was changed.', v;
  end if;
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.pro_claim_job(uuid)')
                    and pg_has_role(current_user, p.proowner, 'MEMBER')) then
    raise exception '0039: run as the owner of public.pro_claim_job(uuid) (postgres), not %. Nothing was changed.', current_user;
  end if;
  -- pro_claim_job must be the LIVE 0030 body (or this file's, on a re-run)
  select md5(replace(p.prosrc, E'\r', '')) into v from pg_proc p where p.oid = to_regprocedure('public.pro_claim_job(uuid)');
  if v is null or v not in ('789cb65e77775da031012f78227d76ad', 'f72dcd37731bf7379803e9be680d70f0') then
    raise exception '0039: public.pro_claim_job(uuid) body (md5 %) is neither 0030 nor 0039. Send this to Codey. Nothing was changed.', coalesce(v, 'missing');
  end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_customer_status_guard'
                and t.tgfoid is distinct from to_regprocedure('public.jobs_customer_status_guard()'))
     or exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_no_self_assignment'
                and t.tgfoid is distinct from to_regprocedure('public.jobs_no_self_assignment()')) then
    raise exception '0039: a trigger named jobs_customer_status_guard / jobs_no_self_assignment runs another function. Nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------- 1. status guard (Customer + complete rule)
-- SECURITY INVOKER on purpose: current_user is the real caller role.
create or replace function public.jobs_customer_status_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$-- haven-version: 0039-v2 (2026-11-12 t676, CoS audit F5 + Quagon HIGH-1 / MED-1 / LOW-1).
declare
  v_uid uuid := auth.uid();
begin
  -- privileged callers (SQL editor / owner, SECURITY DEFINER RPCs such as pro_claim_job,
  -- customer_cancel_job and the Founder Control Center) are not limited here
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  -- the job's own Customer (even if also its assigned Pro): only the 0029 Customer moves, from their sources
  if v_uid is not null and v_uid = old.customer_id then
    if not ((new.status = 'cancelled' and old.status = 'posted' and old.pro_id is null)
            or (new.status in ('materials_approved', 'materials_declined') and old.status = 'materials_requested')
            or (new.status = 'inspection_completed' and old.status in ('diagnosing', 'materials_requested'))) then
      raise exception 'The customer cannot set this job status'
        using errcode = '42501',
              hint = 'The customer may cancel while posted with no Pro, approve or decline a materials request, or end at the inspection fee from diagnosing or materials_requested.';
    end if;
    return new;
  end if;
  -- everyone else (the assigned Pro): complete only from in_progress (0029 IV.1)
  if new.status = 'complete' and old.status <> 'in_progress' then
    raise exception 'A job can only be completed from in_progress'
      using errcode = '42501',
            hint = 'Start the work (in_progress) before marking the job complete.';
  end if;
  return new;
end;
$$;

revoke all on function public.jobs_customer_status_guard() from public, anon, authenticated, service_role;

drop trigger if exists jobs_customer_status_guard on public.jobs;
create trigger jobs_customer_status_guard
  before update of status on public.jobs
  for each row execute function public.jobs_customer_status_guard();

-- ---------------------------------------------------------------- 2. no self-assignment (0029 IV.2, every caller)
create or replace function public.jobs_no_self_assignment()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$-- haven-version: 0039-v2 (2026-11-12 t676; founder rule 2, 2026-10-23; same rule as 0029 IV.2).
begin
  if new.pro_id is not null
     and new.pro_id = new.customer_id
     and (tg_op = 'INSERT'
          or new.pro_id is distinct from old.pro_id
          or new.customer_id is distinct from old.customer_id) then
    raise exception 'A job cannot be claimed by or assigned to the account that posted it'
      using errcode = '42501',
            hint = 'pro_id must differ from customer_id.';
  end if;
  return new;
end;
$$;

revoke all on function public.jobs_no_self_assignment() from public, anon, authenticated, service_role;

drop trigger if exists jobs_no_self_assignment on public.jobs;
create trigger jobs_no_self_assignment
  before insert or update of pro_id, customer_id on public.jobs
  for each row execute function public.jobs_no_self_assignment();

-- ---------------------------------------------------------------- 3. pro_claim_job: LIVE 0030 body + the self-claim condition
create or replace function public.pro_claim_job(job_id uuid)
returns setof public.jobs
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_pro uuid := auth.uid();
  v_lat numeric;
  v_lng numeric;
  claimed public.jobs;
begin
  if v_pro is null then
    raise exception 'claim requires auth.uid()'
      using errcode = '28000';
  end if;

  select j.lat, j.lng
    into v_lat, v_lng
  from public.jobs j
  where j.id = job_id
    and j.status = 'posted'
    and j.pro_id is null
    and j.customer_id is distinct from v_pro;  -- 0039 (IV.2): nobody claims a job they posted

  if not found then
    raise exception 'job not claimable'
      using errcode = 'P0002';
  end if;

  -- C1: one active job per Pro, refused before any location check, with the
  -- same error the one_active_job_per_pro unique index raises today.
  if exists (select 1
               from public.jobs a
              where a.pro_id = v_pro
                and a.status in ('en_route', 'arrived', 'diagnosing',
                                 'materials_requested', 'materials_approved', 'in_progress')) then
    raise exception 'duplicate key value violates unique constraint "one_active_job_per_pro"'
      using errcode = '23505',
            detail = format('Key (pro_id)=(%s) already exists.', v_pro),
            schema = 'public',
            table = 'jobs',
            constraint = 'one_active_job_per_pro';
  end if;

  if not public.haven_caller_within_radius(v_lat, v_lng) then
    raise exception 'job outside operating radius'
      using errcode = 'P0001';
  end if;

  update public.jobs j
  set
    status = 'en_route',
    pro_id = v_pro,
    accepted_at = timezone('utc', now())
  where j.id = job_id
    and j.status = 'posted'
    and j.pro_id is null
    and j.customer_id is distinct from v_pro
  returning j.* into claimed;

  if claimed.id is null then
    raise exception 'job not claimable'
      using errcode = 'P0002';
  end if;

  return next claimed;
end;
$$;

revoke all on function public.pro_claim_job(uuid) from public;
revoke all on function public.pro_claim_job(uuid) from anon;
grant execute on function public.pro_claim_job(uuid) to authenticated;

-- ---------------------------------------------------------------- 4. post-checks (any failure rolls back)
do $$
begin
  if (select count(*) from pg_proc p
       where p.oid in (to_regprocedure('public.jobs_customer_status_guard()'), to_regprocedure('public.jobs_no_self_assignment()'))
         and md5(replace(p.prosrc, E'\r', '')) in ('46c813cf28c2ccabd206ff24c960bee3', '0527ced8e3546472bb31b7259b13024f')
         and not p.prosecdef and p.proconfig = array['search_path=pg_catalog, public, pg_temp']
         and not has_function_privilege('anon', p.oid, 'execute')
         and not has_function_privilege('authenticated', p.oid, 'execute')
         and not has_function_privilege('service_role', p.oid, 'execute')) <> 2 then
    raise exception '0039 post-check: trigger function body / invoker / search_path / grants wrong. Rolled back.';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.pro_claim_job(uuid)')
                    and md5(replace(p.prosrc, E'\r', '')) = 'f72dcd37731bf7379803e9be680d70f0'
                    and p.prosecdef and p.proconfig = array['search_path=pg_catalog, public, pg_temp']
                    and has_function_privilege('authenticated', p.oid, 'execute')
                    and not has_function_privilege('anon', p.oid, 'execute')
                    and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)) then
    raise exception '0039 post-check: pro_claim_job body / definer / search_path / grants wrong. Rolled back.';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_customer_status_guard'
                    and t.tgtype = 19 and t.tgenabled = 'O' and t.tgqual is null
                    and t.tgattr::text = (select a.attnum::text from pg_attribute a where a.attrelid = 'public.jobs'::regclass and a.attname = 'status')
                    and t.tgfoid = to_regprocedure('public.jobs_customer_status_guard()')) then
    raise exception '0039 post-check: status trigger is not BEFORE UPDATE OF status FOR EACH ROW, enabled. Rolled back.';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_no_self_assignment'
                    and t.tgtype = 23 and t.tgenabled = 'O' and t.tgqual is null
                    and (select string_agg(a.attname, ',' order by a.attname) from pg_attribute a
                          where a.attrelid = 'public.jobs'::regclass and a.attnum = any (t.tgattr::int2[])) = 'customer_id,pro_id'
                    and t.tgfoid = to_regprocedure('public.jobs_no_self_assignment()')) then
    raise exception '0039 post-check: self-assignment trigger is not BEFORE INSERT OR UPDATE OF pro_id, customer_id, enabled. Rolled back.';
  end if;
end $$;

commit;
