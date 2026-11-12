-- Haven shared backend — realtime job signal: a minimal private "job changed" broadcast to each party of a job (MIG-0036)
-- Number: 0036. 0033 is reserved for the (c-min) stop-marker proposal (Hub PR #3); 0034 / 0035 /
-- 0035a are the Founder Control Center drafts (Hub PRs #6 / #7). This file shares no object
-- with any of them, with 0023 / 0025-0032, or with one_active_job_per_pro, and works whether or
-- not 0034 / 0035 are ever applied (before or after this file).
--
-- DRAFT. NOT AUTHORIZED TO APPLY. Paste only after Quagon QA passes this exact committed file
-- (sha256 of the body) and Alex approves execution. PASTE THIS WHOLE FILE AS ONE SINGLE RUN in
-- the Supabase SQL editor as the database owner (postgres). Wrapped in BEGIN/COMMIT: it applies
-- fully or not at all. Re-running it is a no-op. Rollback:
-- supabase/rollback/0036_realtime_job_signal_rollback.sql. Read-only checks:
-- supabase/checks/0036a_check_before_READ_ONLY.sql and 0036b_check_after_READ_ONLY.sql.
-- Contract: supabase/contracts/REALTIME_JOB_SIGNAL_CONTRACT.md (topic, channel config, payload, app behaviour).
--
-- Why Broadcast-from-database and not "add jobs to the supabase_realtime publication":
--   Postgres Changes checks RLS against the NEW row only. Admin release (0035) and admin
--   cancel (0035 F-1) clear pro_id, so the Pro who just lost the job fails
--   jobs_select_assigned_pro and is never told. It would also stream the whole jobs row
--   (address_snapshot, lat, lng, payment_snapshot, prices) on every change, and DELETE events
--   skip RLS entirely. See the PR body for the local evidence (realtime.apply_rls).
--
-- What this adds (nothing else)
--   (a) public.jobs_signal_parties(): trigger function. SECURITY DEFINER (owner = the role that
--       runs this file, on Supabase postgres: rolbypassrls, so its insert into the RLS-protected
--       realtime.messages is allowed). search_path = pg_catalog, public, pg_temp; every call is
--       schema-qualified (realtime.send). lock_timeout = 1s inside the function only.
--       EXECUTE revoked from PUBLIC, anon, authenticated and service_role.
--       For each DISTINCT non-null party (old/new customer_id, old/new pro_id) it calls
--         realtime.send(payload, 'job_changed', 'jobs:user:' || <uuid>, true)   -- private
--       with payload exactly
--         { "v": 1, "job_id": <uuid>, "status": <job_status text or null>,
--           "reason": "created" | "updated" | "added" | "removed",
--           "at": "<UTC ISO-8601 with ms>" }         (+ "id": message uuid, added by realtime.send)
--         reason per recipient: party before and after = "updated"; only after = "created"
--         (INSERT) or "added" (became the Pro / Customer); only before = "removed" (released,
--         unassigned by admin cancel, reassigned away, or the row was deleted).
--         status = the job's status after the change; null only when the row was deleted.
--       NO address, coordinates, prices, names, notes, payment, materials or other row data.
--       An UPDATE that changes nothing (to_jsonb(old) = to_jsonb(new)) sends nothing.
--       NEVER BLOCKS OR ROLLS BACK THE JOB WRITE: all of its work is inside
--       BEGIN ... EXCEPTION WHEN others THEN RAISE WARNING; it always returns null (AFTER
--       trigger), never reads or changes any table, never raises. realtime.send itself also
--       swallows its own errors (WarnSendingBroadcastMessage). Messages are rows in the same
--       transaction, so a rolled-back job write never broadcasts.
--   (b) Trigger jobs_signal_parties: AFTER INSERT OR UPDATE OR DELETE ON public.jobs FOR EACH ROW.
--       No WHEN clause (a WHEN error could not be caught; the no-change test is inside the
--       function's exception block). Fires for every role, so app RPCs, PostgREST writes,
--       0035 admin RPCs and the SQL editor all signal.
--   (c) Policy jobs_signal_read_own_topic ON realtime.messages FOR SELECT TO authenticated:
--         extension = 'broadcast'
--         and topic = 'jobs:user:' || auth.uid()::text
--         and realtime.topic() = topic
--       so a signed-in user can join ONLY their own private topic, and only for Broadcast
--       (not Presence). No INSERT / UPDATE / DELETE policy: clients cannot send on any topic
--       (Realtime write authorization fails). Nothing for anon or PUBLIC.
--
-- Does not change: any table, column, existing policy, grant, function or trigger; the
--   supabase_realtime publication (stays empty); job_status_events (every status change is a
--   jobs UPDATE, which already signals); the Pro board (Pros refetch it on focus / poll; see the
--   contract). Read-only towards every existing row.
--
-- Prerequisites (section 0 refuses and changes nothing otherwise):
--   public.jobs with id / customer_id / pro_id uuid and status; the Supabase Realtime schema:
--   realtime.messages (RLS on; topic, extension, payload, event, private), realtime.send(jsonb,
--   text, text, boolean) and realtime.topic(); the running role (postgres; it becomes the
--   function owner) has TRIGGER on public.jobs, bypasses RLS, and can USE realtime, EXECUTE
--   realtime.send and INSERT into realtime.messages; authenticated can EXECUTE realtime.topic(); realtime.messages has NO
--   policy other than this file's (a broader one would be OR-ed with it and leak topics);
--   on re-run, the existing function body equals this file's (normalised md5
--   md5(replace(prosrc, E'\r', ''))  = 93780698b9417349ca18262d29abd8ab — see 0036b).

begin;

-- ── 0. Prerequisites (fail fast, nothing changed yet) ─────────────────────
do $$
declare
  v_cols text;
  v_md5 text;
  v_other text;
begin
  if to_regclass('public.jobs') is null then
    raise exception '0036: public.jobs missing. Nothing was changed.';
  end if;
  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname) into v_cols
    from pg_attribute a
   where a.attrelid = 'public.jobs'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname in ('id', 'customer_id', 'pro_id', 'status');
  if v_cols is distinct from 'customer_id:uuid,id:uuid,pro_id:uuid,status:job_status' then
    raise exception '0036: public.jobs id / customer_id / pro_id / status are not as expected (%). Nothing was changed.', coalesce(v_cols, 'missing');
  end if;
  if to_regnamespace('realtime') is null
     or to_regclass('realtime.messages') is null
     or to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null
     or to_regprocedure('realtime.topic()') is null then
    raise exception '0036: Supabase Realtime schema missing (realtime.messages / realtime.send(jsonb,text,text,boolean) / realtime.topic()). Nothing was changed.';
  end if;
  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attname) into v_cols
    from pg_attribute a
   where a.attrelid = 'realtime.messages'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname in ('topic', 'extension', 'payload', 'event', 'private');
  if v_cols is distinct from 'event:text,extension:text,payload:jsonb,private:boolean,topic:text' then
    raise exception '0036: realtime.messages columns are not as expected (%). Nothing was changed.', coalesce(v_cols, 'missing');
  end if;
  if not (select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass) then
    raise exception '0036: RLS is OFF on realtime.messages (every topic would be readable). Nothing was changed.';
  end if;
  if not has_table_privilege(current_user, 'public.jobs', 'trigger') then
    raise exception '0036: run as the database owner (postgres); % has no TRIGGER privilege on public.jobs. Nothing was changed.', current_user;
  end if;
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
     or not has_schema_privilege(current_user, 'realtime', 'usage')
     or not has_function_privilege(current_user, 'realtime.send(jsonb, text, text, boolean)', 'execute')
     or not has_table_privilege(current_user, 'realtime.messages', 'insert') then
    raise exception '0036: % cannot broadcast (needs BYPASSRLS, USAGE on realtime, EXECUTE on realtime.send, INSERT on realtime.messages). Nothing was changed.', current_user;
  end if;
  if not has_function_privilege('authenticated', 'realtime.topic()', 'execute') then
    raise exception '0036: authenticated cannot EXECUTE realtime.topic(). Nothing was changed.';
  end if;
  select string_agg(policyname, ', ' order by policyname) into v_other
    from pg_policies
   where schemaname = 'realtime' and tablename = 'messages' and policyname <> 'jobs_signal_read_own_topic';
  if v_other is not null then
    raise exception '0036: realtime.messages already has other policies (%); they would be OR-ed with this file''s and could expose jobs:user:* topics. Stop and send this to Codey. Nothing was changed.', v_other;
  end if;
  if to_regprocedure('public.jobs_signal_parties()') is not null then
    select md5(replace(prosrc, E'\r', '')) into v_md5 from pg_proc where oid = to_regprocedure('public.jobs_signal_parties()');
    if v_md5 is distinct from '93780698b9417349ca18262d29abd8ab' then
      raise exception '0036: public.jobs_signal_parties() exists with a different body (md5 % without CR). Nothing was changed.', v_md5;
    end if;
  end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_signal_parties'
               and not t.tgisinternal and t.tgfoid is distinct from to_regprocedure('public.jobs_signal_parties()')) then
    raise exception '0036: a trigger jobs_signal_parties on public.jobs calls another function. Nothing was changed.';
  end if;
end $$;

-- ── (a) Trigger function: one minimal private signal per distinct party ───
create or replace function public.jobs_signal_parties()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '1s'
as $$
declare
  v_job uuid;
  v_status text;
  v_at text;
  v_before uuid[] := '{}';
  v_after uuid[] := '{}';
  v_uid uuid;
  v_reason text;
begin
  begin
    if tg_op = 'UPDATE' then
      if to_jsonb(old) = to_jsonb(new) then
        return null;
      end if;
    end if;
    if tg_op in ('UPDATE', 'DELETE') then
      v_before := array_remove(array[old.customer_id, old.pro_id], null);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      v_after := array_remove(array[new.customer_id, new.pro_id], null);
      v_job := new.id;
      v_status := new.status::text;
    else
      v_job := old.id;
      v_status := null;
    end if;
    v_at := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    for v_uid in
      select distinct u from unnest(v_before || v_after) as x(u) order by u
    loop
      if v_uid = any (v_after) and v_uid = any (v_before) then
        v_reason := 'updated';
      elsif v_uid = any (v_after) then
        v_reason := case when tg_op = 'INSERT' then 'created' else 'added' end;
      else
        v_reason := 'removed';
      end if;
      perform realtime.send(
        jsonb_build_object('v', 1, 'job_id', v_job, 'status', v_status, 'reason', v_reason, 'at', v_at),
        'job_changed',
        'jobs:user:' || v_uid::text,
        true);
    end loop;
  exception when others then
    raise warning '0036 jobs_signal_parties: job signal skipped (SQLSTATE %)', sqlstate;
  end;
  return null;
end;
$$;

revoke all on function public.jobs_signal_parties() from public;
revoke all on function public.jobs_signal_parties() from anon;
revoke all on function public.jobs_signal_parties() from authenticated;
revoke all on function public.jobs_signal_parties() from service_role;

-- ── (b) Trigger: every insert / real update / delete of a job ─────────────
drop trigger if exists jobs_signal_parties on public.jobs;
create trigger jobs_signal_parties
  after insert or update or delete on public.jobs
  for each row
  execute function public.jobs_signal_parties();

-- ── (c) Realtime authorization: own private topic only, read only ─────────
drop policy if exists jobs_signal_read_own_topic on realtime.messages;
create policy jobs_signal_read_own_topic
  on realtime.messages
  as permissive
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.messages.topic = 'jobs:user:' || (select auth.uid())::text
    and (select realtime.topic()) = realtime.messages.topic
  );

-- ── Post-checks (any failure aborts the whole transaction) ────────────────
do $$
declare
  v_fn oid := to_regprocedure('public.jobs_signal_parties()');
begin
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = v_fn) is distinct from '93780698b9417349ca18262d29abd8ab' then
    raise exception '0036: jobs_signal_parties() body is not this file''s. Nothing was changed.';
  end if;
  if not (select prosecdef from pg_proc where oid = v_fn)
     or (select proconfig from pg_proc where oid = v_fn) is distinct from array['search_path=pg_catalog, public, pg_temp', 'lock_timeout=1s'] then
    raise exception '0036: jobs_signal_parties() must be SECURITY DEFINER with the pinned search_path. Nothing was changed.';
  end if;
  if has_function_privilege('public', v_fn, 'execute')
     or has_function_privilege('anon', v_fn, 'execute')
     or has_function_privilege('authenticated', v_fn, 'execute')
     or has_function_privilege('service_role', v_fn, 'execute') then
    raise exception '0036: a client role still has EXECUTE on jobs_signal_parties(). Nothing was changed.';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_signal_parties' and not t.tgisinternal
                    and t.tgfoid = v_fn and t.tgenabled = 'O' and t.tgtype = 29 and t.tgqual is null and t.tgattr = '') then
    raise exception '0036: trigger jobs_signal_parties is not AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW (enabled, no WHEN, no column list). Nothing was changed.';
  end if;
  if (select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages') <> 1
     or not exists (select 1 from pg_policies
                     where schemaname = 'realtime' and tablename = 'messages' and policyname = 'jobs_signal_read_own_topic'
                       and cmd = 'SELECT' and permissive = 'PERMISSIVE' and roles = array['authenticated']::name[] and with_check is null) then
    raise exception '0036: realtime.messages must have exactly one policy, jobs_signal_read_own_topic (SELECT, authenticated, permissive). Nothing was changed.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass) then
    raise exception '0036: RLS is OFF on realtime.messages. Nothing was changed.';
  end if;
  if exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'jobs' and pubname = 'supabase_realtime') then
    raise exception '0036: public.jobs is in the supabase_realtime publication (Postgres Changes would stream whole rows). Nothing was changed.';
  end if;
end $$;

commit;

-- ── Rollback (only if this file must be undone) ───────────────────────────
-- Drops the trigger FIRST (so a job write never calls a missing function), then the function,
-- then the policy. Touches nothing else. Clients simply stop receiving signals and keep
-- working on focus / reconnect refetch.
-- begin;
-- drop trigger if exists jobs_signal_parties on public.jobs;
-- drop function if exists public.jobs_signal_parties();
-- drop policy if exists jobs_signal_read_own_topic on realtime.messages;
-- commit;
