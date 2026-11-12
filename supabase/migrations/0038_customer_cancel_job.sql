-- Haven shared backend: Customer cancel, including after a Pro has accepted (MIG-0038)
-- DRAFT. NOT APPLIED. Do not paste until the founder authorizes it in his own words.
-- Number: 0038 (0033 retired, never written; 0034/0035/0035a Founder Control Center; 0036 realtime job
-- signal; 0037 live-location sessions). Starting point: Hub PR #3
-- backend/contracts/customer-cancel-job-PROPOSED-2026-11-10.md, option 1 ("cancel allowed after accept").
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor as ONE run, as the database owner
-- (postgres). Paste order: checks/0038a (read-only, row 00 READY) -> this file -> checks/0038b
-- (read-only, row 000 LIVE). Rollback: supabase/rollback/0038_customer_cancel_job_rollback.sql.
-- Works with or without 0036 / 0037 / 0034-0035a, in any order relative to them.
--
-- WHAT IT ADDS: one function, public.customer_cancel_job(p_job_id uuid) returns jsonb, and one owner-only
-- table, public.job_pro_releases (t674): which Pro a cancel released. No column, policy, trigger, grant
-- to a client role, or status value is added or changed on any existing table, so no new client UPDATE
-- path is opened: the direct PATCH rules (0010 posted-only cancel, 0017 owner) stay exactly
-- as they are. This is a deliberate privileged path (SECURITY DEFINER, owner of public.jobs), like 0035.
--
-- Rules:
--   * Only the job's own Customer (customer_id = auth.uid()). Anyone else, a missing id or a null id get
--     the identical {ok:false, error:'not_found'}. The row is locked FOR UPDATE before any decision.
--   * Allowed: posted with no Pro; en_route or arrived with a Pro.
--   * Refused, row unchanged, no event, no signal: already_cancelled, job_finished (complete,
--     materials_declined), inspection_fee_due (inspection_completed), work_started (diagnosing,
--     in_progress), materials_pending / materials_approved (status, an undecided 0026 request, a
--     materials_requests row, or any 0025 approved amount), money_involved (reimbursed materials, a tip
--     amount or tip row, a receipt, an earnings statement), not_allowed_status (anything else, e.g. an
--     assignment that doesn't match the status). payment_snapshot is a placeholder and is NOT a money
--     signal. 0025/0026 materials columns are read through to_jsonb(row), so this file works whether or
--     not they exist.
--   * Effect: status = cancelled, cancelled_at = coalesce(cancelled_at, now()), pro_id = null,
--     accepted_at = null (same row update as 0035 F-1, so no Pro policy can match the cancelled job, and
--     the one_active_job_per_pro slot is free). The 0032 trigger wipes the live point when leaving
--     en_route, plus a direct delete here as belt and braces. 0037 (if applied) ends the live session by
--     trigger. One job_status_events row (actor_role 'customer', actor_id = the Customer). The 0036 trigger
--     (if applied) signals the Customer ('updated') and the released Pro ('removed'), both status cancelled.
--   * Released Pro (t674): when the cancel releases a Pro, one row in public.job_pro_releases
--     (event_id -> that job_status_events row, job_id, released_pro_id, at). Owner-only: RLS on, no
--     policies, no client grants, not published. Why not job_status_events: it has no Pro column, and its
--     read rules may open to the Customer later (job timeline); the Customer must never read the Pro's id.
--     Readers today: the database owner / SQL editor (and a future admin RPC). OPEN: should the released
--     Pro read their own rows?
--   * Inspection fee (t674 definition, OPEN for the founder): a cancel is refused for the inspection only
--     when a previously disclosed obligation is evidenced, and the schema's only evidence is that the
--     inspection actually started (status diagnosing -> work_started, inspection_completed ->
--     inspection_fee_due). A requires_diagnosis job with inspection_fee_cents > 0 that is en_route or
--     arrived is NOT refused: the fee value alone is not an acceptance. There is no fee-acceptance column
--     or event in the schema. If the founder wants "accepted at posting" to count, that needs a new,
--     server-set acceptance timestamp first (a later migration).
--   * No refund, fee, charge or payment logic of any kind.

begin;

-- ---------------------------------------------------------------- 0. guards (refuse, change nothing)
do $$
declare v text;
begin
  if to_regclass('public.jobs') is null or to_regclass('public.job_status_events') is null then
    raise exception '0038: public.jobs / public.job_status_events missing. Nothing was changed.';
  end if;
  if (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname)
        from pg_attribute a
       where a.attrelid = 'public.jobs'::regclass and a.attnum > 0 and not a.attisdropped
         and a.attname in ('id', 'customer_id', 'pro_id', 'status', 'accepted_at', 'cancelled_at'))
     is distinct from 'accepted_at:timestamp with time zone,cancelled_at:timestamp with time zone,customer_id:uuid,id:uuid,pro_id:uuid,status:job_status' then
    raise exception '0038: public.jobs columns are not as expected. Nothing was changed.';
  end if;
  if (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = 'public.job_status'::regtype)
     is distinct from 'posted,en_route,arrived,diagnosing,materials_requested,materials_approved,materials_declined,in_progress,inspection_completed,complete,cancelled' then
    raise exception '0038: job_status values differ from the reviewed set. Send this to Codey. Nothing was changed.';
  end if;
  if (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname)
        from pg_attribute a
       where a.attrelid = 'public.job_status_events'::regclass and a.attnum > 0 and not a.attisdropped
         and a.attname in ('job_id', 'from_status', 'to_status', 'actor_role', 'actor_id'))
     is distinct from 'actor_id:uuid,actor_role:text,from_status:job_status,job_id:uuid,to_status:job_status' then
    raise exception '0038: public.job_status_events columns are not as expected. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.job_status_events'::regclass and c.contype = 'c'
                    and c.conname = 'job_status_events_actor_role_check' and pg_get_constraintdef(c.oid) like '%''customer''%') then
    raise exception '0038: job_status_events_actor_role_check missing or does not allow ''customer''. Nothing was changed.';
  end if;
  if to_regclass('public.materials_requests') is null or to_regclass('public.materials_receipts') is null
     or to_regclass('public.tips') is null or to_regclass('public.earnings_statements') is null
     or to_regclass('public.job_live_locations') is null then
    raise exception '0038: materials_requests / materials_receipts / tips / earnings_statements / job_live_locations missing. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
     or not has_schema_privilege(current_user, 'public', 'create') then
    raise exception '0038: run as the database owner (postgres), not %. Nothing was changed.', current_user;
  end if;
  if to_regclass('public.job_pro_releases') is not null
     and ((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' order by a.attnum)
             from pg_attribute a where a.attrelid = to_regclass('public.job_pro_releases') and a.attnum > 0 and not a.attisdropped)
            is distinct from 'event_id:bigint:true,job_id:uuid:true,released_pro_id:uuid:true,at:timestamp with time zone:true'
          or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_pro_releases')) then
    raise exception '0038: public.job_pro_releases exists with other columns or with policies. Nothing was changed.';
  end if;
  select md5(replace(p.prosrc, E'\r', '')) into v from pg_proc p where p.oid = to_regprocedure('public.customer_cancel_job(uuid)');
  if v is not null and v <> 'f166ad02756be2a392a2cb1ecf510fe5' then
    raise exception '0038: public.customer_cancel_job(uuid) already exists with another body (md5 %). Send this to Codey. Nothing was changed.', v;
  end if;
end $$;

-- ---------------------------------------------------------------- 1. released-Pro record (owner-only)
create table if not exists public.job_pro_releases (
  event_id        bigint primary key references public.job_status_events(id) on delete cascade,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  released_pro_id uuid not null,
  at              timestamptz not null default now()
);
create index if not exists job_pro_releases_job_idx on public.job_pro_releases(job_id);
comment on table public.job_pro_releases is
  'Which Pro a Customer cancel released (0038). Owner-only: RLS on, no policies, no client grants. The Customer never reads it.';
alter table public.job_pro_releases enable row level security;
revoke all on table public.job_pro_releases from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 2. the RPC
create or replace function public.customer_cancel_job(p_job_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  j public.jobs;
  r jsonb;
  v_err text;
  v_n int;
  v_ev bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into j from public.jobs x where x.id = p_job_id and x.customer_id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  r := to_jsonb(j);
  v_err := case
    when j.status = 'cancelled' then 'already_cancelled'
    when j.status in ('complete', 'materials_declined') then 'job_finished'
    when j.status = 'inspection_completed' then 'inspection_fee_due'
    when j.status = 'materials_requested' then 'materials_pending'
    when j.status = 'materials_approved' then 'materials_approved'
    when j.status in ('diagnosing', 'in_progress') then 'work_started'
    when j.status = 'posted' and j.pro_id is null then null
    when j.status in ('en_route', 'arrived') and j.pro_id is not null then null
    else 'not_allowed_status' end;
  if v_err is null then
    if exists (select 1 from public.materials_requests m where m.job_id = j.id and m.status = 'pending')
       or coalesce((r ->> 'materials_request_seq')::int, 0) > coalesce((r ->> 'materials_decided_seq')::int, 0)
       or (r ->> 'materials_requested_at') is not null then
      v_err := 'materials_pending';
    elsif exists (select 1 from public.materials_requests m where m.job_id = j.id and m.status = 'approved')
       or coalesce((r ->> 'materials_approved_cents')::numeric, 0) > 0
       or (r ->> 'materials_approved_at') is not null then
      v_err := 'materials_approved';
    elsif coalesce((r ->> 'materials_reimbursed_cents')::numeric, 0) > 0
       or coalesce((r ->> 'tip_amount_cents')::numeric, 0) > 0
       or exists (select 1 from public.tips t where t.job_id = j.id and t.status <> 'not_added')
       or exists (select 1 from public.materials_receipts m where m.job_id = j.id)
       or exists (select 1 from public.earnings_statements e where e.job_id = j.id) then
      v_err := 'money_involved';
    end if;
  end if;
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err, 'status', j.status);
  end if;
  update public.jobs
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), pro_id = null, accepted_at = null
   where id = j.id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'customer_cancel_job: expected one row, got %', v_n;
  end if;
  delete from public.job_live_locations where job_id = j.id;
  insert into public.job_status_events (job_id, from_status, to_status, actor_role, actor_id)
  values (j.id, j.status, 'cancelled', 'customer', v_uid)
  returning id into v_ev;
  if j.pro_id is not null then
    insert into public.job_pro_releases (event_id, job_id, released_pro_id) values (v_ev, j.id, j.pro_id);
  end if;
  return jsonb_build_object('ok', true, 'status', 'cancelled', 'from_status', j.status,
                            'pro_released', j.pro_id is not null);
end;
$$;

revoke all on function public.customer_cancel_job(uuid) from public, anon, service_role;
grant execute on function public.customer_cancel_job(uuid) to authenticated;

-- ---------------------------------------------------------------- 3. post-checks (any failure rolls back)
do $$
begin
  if to_regclass('public.job_pro_releases') is null
     or (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' order by a.attnum)
           from pg_attribute a where a.attrelid = to_regclass('public.job_pro_releases') and a.attnum > 0 and not a.attisdropped)
          is distinct from 'event_id:bigint:true,job_id:uuid:true,released_pro_id:uuid:true,at:timestamp with time zone:true'
     or not (select relrowsecurity from pg_class where oid = 'public.job_pro_releases'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_pro_releases')
     or has_table_privilege('anon', 'public.job_pro_releases', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.job_pro_releases', 'select, insert, update, delete')
     or has_table_privilege('service_role', 'public.job_pro_releases', 'select, insert, update, delete')
     or exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'job_pro_releases') then
    raise exception '0038 post-check: job_pro_releases must be owner-only (RLS on, no policies, no grants, no publication). Rolled back.';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.customer_cancel_job(uuid)')
                    and md5(replace(p.prosrc, E'\r', '')) = 'f166ad02756be2a392a2cb1ecf510fe5'
                    and p.prosecdef and p.proconfig = array['search_path=pg_catalog, public, pg_temp']
                    and p.prorettype = 'jsonb'::regtype
                    and has_function_privilege('authenticated', p.oid, 'execute')
                    and not has_function_privilege('anon', p.oid, 'execute')
                    and not has_function_privilege('service_role', p.oid, 'execute')
                    and not has_function_privilege('public', p.oid, 'execute')) then
    raise exception '0038 post-check: customer_cancel_job body / security definer / search_path / grants wrong. Rolled back.';
  end if;
end $$;

commit;
