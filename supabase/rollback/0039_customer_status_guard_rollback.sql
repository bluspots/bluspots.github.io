-- Haven: ROLLBACK for 0039 v2 (customer status guard + no self-assignment + pro_claim_job self-claim check).
-- DRAFT. Paste only if the founder asks. One run, as the database owner.
-- Removes 0039's two triggers and two trigger functions and restores pro_claim_job to the exact LIVE 0030
-- body (md5 789cb65e77775da031012f78227d76ad). Refuses (changes nothing) if pro_claim_job is neither the
-- 0039 body nor the 0030 body. If 0029 is installed its rules IV.1-IV.3 still refuse the same moves;
-- without 0029 the F5 gap and the self-claim path are open again.
begin;
do $$
declare v text;
begin
  select md5(replace(p.prosrc, E'\r', '')) into v from pg_proc p where p.oid = to_regprocedure('public.pro_claim_job(uuid)');
  if v is null or v not in ('f72dcd37731bf7379803e9be680d70f0', '789cb65e77775da031012f78227d76ad') then
    raise exception '0039 rollback: pro_claim_job(uuid) body (md5 %) is neither 0039 nor 0030. Nothing was changed.', coalesce(v, 'missing');
  end if;
end $$;
drop trigger if exists jobs_customer_status_guard on public.jobs;
drop function if exists public.jobs_customer_status_guard();
drop trigger if exists jobs_no_self_assignment on public.jobs;
drop function if exists public.jobs_no_self_assignment();
-- pro_claim_job: the exact 0030 definition (Customer repo #94 21ee835b, supabase/migrations/0030_assigned_job_destination.sql)
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
    and j.pro_id is null;

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
do $$
begin
  if (select md5(replace(p.prosrc, E'\r', '')) from pg_proc p where p.oid = to_regprocedure('public.pro_claim_job(uuid)'))
     is distinct from '789cb65e77775da031012f78227d76ad' then
    raise exception '0039 rollback post-check: pro_claim_job is not the 0030 body. Rolled back.';
  end if;
end $$;
commit;
