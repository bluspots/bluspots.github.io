-- Haven shared backend — jobs read lockdown + RLS on unused tables (Phase 1B)
-- Number: 0027 (next after 0026_customer_only_materials_approval.sql).
-- Pro has no migrations folder. This is the one paste for both apps.
--
-- PASTE THIS WHOLE FILE AS ONE SINGLE RUN (select all, run once) in the
-- Supabase SQL editor as the database owner. Do not run it in pieces;
-- it is wrapped in BEGIN/COMMIT so it applies fully or not at all.
-- PASTE ORDER: 0025 body, then 0027 (this file), then 0026, then 0028,
-- each pasted as its own run. 0027 does not depend on 0026.
-- Do not apply it from the app, from CI, or from an agent.
-- Safe to re-run. It runs in one transaction and stops before changing
-- anything if a prerequisite is missing (section 0).
-- Run the founder query at the bottom (section 4) BEFORE and AFTER pasting
-- and keep both outputs.
--
-- Why
--   0007 added jobs_select_assigned_or_active FOR SELECT TO anon,
--   authenticated USING (pro_id is not null or status in (en_route ...
--   cancelled)). It does not check who is asking. Since 0020 anon has no
--   SELECT grant on jobs, but every signed-in user (any customer, any Pro)
--   can read every job that has a Pro or is past posted: other customers'
--   addresses (after accept), prices, payouts, materials and tips, by
--   calling /rest/v1/jobs without the customer_id / pro_id filter the apps
--   send. Cancelled jobs that never had a Pro were readable the same way.
--   Separately, eight 0001 tables never had RLS. Supabase's default
--   privileges give anon and authenticated full table rights on new public
--   tables, so those tables are open through the REST API. No app uses them.
--
-- What changes
--   1. public.jobs SELECT (signed in only; anon still has no grant):
--        drops   jobs_select_assigned_or_active (0007)
--        adds    jobs_select_own_customer  TO authenticated
--                  USING (customer_id = auth.uid())
--                A customer reads their own jobs in every status: Bookings,
--                tracking, receipts, the cross-device "my jobs" read, a
--                cancelled job, and INSERT/UPDATE ... RETURNING on their row.
--        adds    jobs_select_assigned_pro  TO authenticated
--                  USING (pro_id = auth.uid())
--                A Pro reads only jobs assigned to them (pro_id is the
--                assignment column, set by pro_claim_job): active jobs,
--                history, and PATCH ... return=representation on their jobs.
--        keeps   jobs_select_own_posted (0023), now a subset of
--                jobs_select_own_customer. Left in place so this file stays a
--                pure addition for 0023.
--      Open (posted, unassigned) jobs are still read by Pros only through
--      public.jobs_posted_within_radius() (0023, SECURITY DEFINER, radius
--      filtered). There is no direct Pro SELECT on posted jobs before or
--      after this file. The Pro board already uses the RPC (haven-pro
--      backend_adapter.js fetchPostedJobsFromSupabase).
--   2. RLS enabled, NO policies, and anon / authenticated table and sequence
--      rights revoked, on the tables no app reads or writes:
--        job_status_events, materials_requests, materials_receipts, tips,
--        job_messages, job_media, job_notes, earnings_statements.
--      Checked: neither app (Customer master, haven-pro main 1310b059) calls
--      /rest/v1/<table> or an rpc for these, and no trigger or function
--      writes them. No row is changed or deleted; the Verify section counts
--      their rows. The database owner (SQL editor) and service_role keep full
--      access (owner and BYPASSRLS; RLS is enabled, not forced).
--
-- Must keep working (checked by supabase/tests/rls_0027_policy_matrix.py)
--   Pro board (jobs_posted_within_radius), claim (pro_claim_job, SECURITY
--   DEFINER, so it reads and updates the posted row as the owner; the claimed
--   row then has pro_id = the Pro, so jobs_select_assigned_pro shows it on
--   the Pro's next read, with no gap), jobs_enforce_claim_radius, the Pro's
--   active jobs / history / status PATCHes with return=representation, the
--   Customer's own jobs, receipts and my-jobs read, the customer posting a
--   job (INSERT ... RETURNING), the customer cancelling a posted job
--   (UPDATE ... RETURNING on a cancelled row; 0007 was the only policy that
--   showed it before), the customer's materials approve / decline, and the
--   0022 receipt Pro name (job_assigned_pro_labels, SECURITY DEFINER).
--   The 0015 / 0017 restrictive UPDATE checks read the existing row through
--   RLS. Every row they look at for a legitimate write is the caller's own
--   (customer_id = auth.uid() or pro_id = auth.uid()), so they still pass.
--
-- Does not change: INSERT / UPDATE / DELETE policies, any grant on
--   public.jobs or public.profiles, profiles RLS, triggers (0023 radius,
--   0025 / 0026 materials lock), functions (jobs_posted_within_radius,
--   haven_caller_within_radius, pro_claim_job, jobs_enforce_claim_radius,
--   job_assigned_pro_labels, 0024 QA gate), the job status ladder,
--   lifecycle, pricing, fees, location rules, or any row. Does not depend on
--   0025 or 0026.
--
-- Known and unchanged: the Pro app's fallback direct claim (PATCH
--   status=eq.posted&pro_id=is.null, used only when the RPC fails) cannot
--   see another customer's posted row since 0023, so it never claims. Same
--   after this file. The RPC is the claim path.

begin;

-- ── 0. Prerequisites (fail fast, nothing changed yet) ─────────────────────
do $$
declare
  missing text[] := '{}';
  t text;
  fn text;
  jobs_owner oid;
  fn_owner oid;
begin
  if to_regclass('public.jobs') is null then
    raise exception '0027: public.jobs is missing. Paste 0001 ... 0026 first.';
  end if;
  if to_regclass('public.profiles') is null then missing := array_append(missing, 'public.profiles (0016)'::text); end if;
  foreach fn in array array[
    'public.jobs_posted_within_radius()',
    'public.haven_caller_within_radius(numeric,numeric)',
    'public.pro_claim_job(uuid)',
    'public.jobs_enforce_claim_radius()',
    'public.job_assigned_pro_labels(uuid[])'
  ] loop
    if to_regprocedure(fn) is null then missing := array_append(missing, fn::text); end if;
  end loop;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.jobs'::regclass and tgname = 'jobs_enforce_claim_radius' and not tgisinternal) then
    missing := array_append(missing, 'trigger jobs_enforce_claim_radius (0023)'::text);
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_select_own_posted') then
    missing := array_append(missing, 'policy jobs_select_own_posted (0023)'::text);
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'jobs' and column_name = 'pro_id')
     or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'jobs' and column_name = 'customer_id') then
    missing := array_append(missing, 'jobs.customer_id / jobs.pro_id'::text);
  end if;
  foreach t in array array['job_status_events','materials_requests','materials_receipts','tips',
                           'job_messages','job_media','job_notes','earnings_statements'] loop
    if to_regclass('public.' || t) is null then missing := array_append(missing, ('public.' || t)::text); end if;
  end loop;
  if array_length(missing, 1) > 0 then
    raise exception '0027: prerequisites missing: %', array_to_string(missing, ', ')
      using hint = 'Paste 0001 ... 0026 (0021 is in the Pro repo docs) first. Nothing was changed.';
  end if;

  -- jobs must already be under RLS, and not FORCED: the SECURITY DEFINER
  -- functions below read jobs as their owner and rely on the owner bypass.
  if not (select relrowsecurity from pg_class where oid = 'public.jobs'::regclass) then
    raise exception '0027: RLS is not enabled on public.jobs. Stop and check 0002.';
  end if;
  if (select relforcerowsecurity from pg_class where oid = 'public.jobs'::regclass) then
    raise exception '0027: RLS is FORCED on public.jobs. The radius / claim / label RPCs would lose their reads. Stop.';
  end if;

  -- The board, claim and receipt-label RPCs must stay SECURITY DEFINER and
  -- owned by a role that bypasses jobs RLS (the table owner, a superuser or
  -- BYPASSRLS). Otherwise dropping 0007 would hide rows from them.
  select relowner into jobs_owner from pg_class where oid = 'public.jobs'::regclass;
  foreach fn in array array[
    'public.jobs_posted_within_radius()',
    'public.pro_claim_job(uuid)',
    'public.job_assigned_pro_labels(uuid[])',
    'public.haven_caller_within_radius(numeric,numeric)'
  ] loop
    if not (select prosecdef from pg_proc where oid = to_regprocedure(fn)) then
      raise exception '0027: % is not SECURITY DEFINER (0022 / 0023). Stop.', fn;
    end if;
    select proowner into fn_owner from pg_proc where oid = to_regprocedure(fn);
    if fn_owner <> jobs_owner
       and not exists (select 1 from pg_roles where oid = fn_owner and (rolsuper or rolbypassrls)) then
      raise exception '0027: % is owned by %, which does not own public.jobs or bypass RLS. Stop.',
        fn, pg_get_userbyid(fn_owner);
    end if;
  end loop;
end
$$;

-- ── 1. public.jobs SELECT ─────────────────────────────────────────────────
drop policy if exists jobs_select_assigned_or_active on public.jobs;

drop policy if exists jobs_select_own_customer on public.jobs;
create policy jobs_select_own_customer
  on public.jobs
  for select
  to authenticated
  using (customer_id = auth.uid());

drop policy if exists jobs_select_assigned_pro on public.jobs;
create policy jobs_select_assigned_pro
  on public.jobs
  for select
  to authenticated
  using (pro_id = auth.uid());

-- ── 2. Unused tables: RLS on, no policies, no anon / authenticated rights ─
do $$
declare
  t text;
  seq text;
begin
  foreach t in array array['job_status_events','materials_requests','materials_receipts','tips',
                           'job_messages','job_media','job_notes','earnings_statements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    seq := pg_get_serial_sequence('public.' || t, 'id');
    if seq is not null then
      execute format('revoke all on sequence %s from public, anon, authenticated', seq);
    end if;
  end loop;
end
$$;

-- ── 3. Report any other public table still without RLS (no change) ───────
do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
     order by 1
  loop
    raise notice '0027: public.% still has RLS disabled. Not in the migrations; review before relying on it.', r.relname;
  end loop;
end
$$;

commit;

-- ── 4. Founder query (read-only). Run BEFORE and AFTER pasting. ──────────
-- One row per public table or view: RLS enabled / forced, every policy
-- (command, roles, restrictive), and the exact anon / authenticated table
-- grants. Expected after: every table rls_enabled = true, rls_forced =
-- false; the eight 0001 tables have no policies and no anon / authenticated
-- grants; jobs shows jobs_select_own_customer and jobs_select_assigned_pro
-- and no jobs_select_assigned_or_active. Column-level grants (profiles) are
-- not listed here; 0024 has its own check for those.
-- select c.relname                                   as table_name,
--        c.relkind                                   as kind,
--        c.relrowsecurity                            as rls_enabled,
--        c.relforcerowsecurity                       as rls_forced,
--        coalesce((select string_agg(p.policyname || ' [' || p.cmd || ' to ' || array_to_string(p.roles, ',')
--                                    || case when p.permissive = 'RESTRICTIVE' then ', restrictive' else '' end || ']',
--                                    '; ' order by p.policyname)
--                    from pg_policies p
--                   where p.schemaname = 'public' and p.tablename = c.relname), '(none)') as policies,
--        coalesce((select string_agg(distinct a.privilege_type, ',')
--                    from aclexplode(c.relacl) a
--                   where a.grantee = 'anon'::regrole), '(none)')          as anon_grants,
--        coalesce((select string_agg(distinct a.privilege_type, ',')
--                    from aclexplode(c.relacl) a
--                   where a.grantee = 'authenticated'::regrole), '(none)') as authenticated_grants
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
--  order by c.relname;

-- ── Verify ────────────────────────────────────────────────────────────────
-- jobs SELECT policies: expect jobs_select_assigned_pro, jobs_select_own_customer
-- (both to {authenticated}) and jobs_select_own_posted. No jobs_select_assigned_or_active.
-- select policyname, roles, qual from pg_policies
--  where schemaname = 'public' and tablename = 'jobs' and cmd = 'SELECT' order by policyname;
--
-- Write policies unchanged (same list as before pasting).
-- select policyname, cmd, permissive from pg_policies
--  where schemaname = 'public' and tablename = 'jobs' and cmd <> 'SELECT' order by policyname;
--
-- The eight tables: RLS on, not forced, no policies, anon / authenticated false.
-- select c.relname, c.relrowsecurity, c.relforcerowsecurity,
--        (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
--        has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
--        has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
--        has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public'
--    and c.relname in ('job_status_events','materials_requests','materials_receipts','tips',
--                      'job_messages','job_media','job_notes','earnings_statements')
--  order by 1;
--
-- Row counts in the eight tables (read-only; expected 0, nothing is removed either way).
-- select 'job_status_events' t, count(*) from public.job_status_events
-- union all select 'materials_requests', count(*) from public.materials_requests
-- union all select 'materials_receipts', count(*) from public.materials_receipts
-- union all select 'tips', count(*) from public.tips
-- union all select 'job_messages', count(*) from public.job_messages
-- union all select 'job_media', count(*) from public.job_media
-- union all select 'job_notes', count(*) from public.job_notes
-- union all select 'earnings_statements', count(*) from public.earnings_statements;
--
-- Customer isolation, rolled back (replace with a real customer and a job
-- of a DIFFERENT customer that has a Pro or is past posted). Expect the
-- first count to be the customer's own job count and the second to be 0.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<customer uuid>","role":"authenticated"}', true);
--   select count(*) from public.jobs;
--   select count(*) from public.jobs where id = '<other customer''s job uuid>';
-- rollback;
--
-- Pro isolation, rolled back (replace with a Pro and a job assigned to a
-- DIFFERENT Pro). Expect only that Pro's assigned jobs, then 0.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<pro uuid>","role":"authenticated"}', true);
--   select id, status from public.jobs order by accepted_at desc nulls last;
--   select count(*) from public.jobs where id = '<other Pro''s job uuid>';
-- rollback;
--
-- Board still works for a Pro with an operating point and radius (expect
-- the same rows the Pro app's Job Board shows).
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<pro uuid>","role":"authenticated"}', true);
--   select id, title, distance_mi from public.jobs_posted_within_radius();
-- rollback;

-- ── Rollback (only if this file must be undone) ───────────────────────────
-- Restores 0007's policy exactly as it was, drops the two new policies and
-- turns RLS off again on the eight tables. The grants revoked in section 2
-- were Supabase defaults (ALL to anon and authenticated) plus 0005's
-- INSERT on job_status_events to authenticated; the GRANT lines below put
-- them back. Compare with the BEFORE output of the founder query and skip
-- any grant it did not show. Run the lines between begin and commit.
-- begin;
-- drop policy if exists jobs_select_own_customer on public.jobs;
-- drop policy if exists jobs_select_assigned_pro on public.jobs;
-- drop policy if exists jobs_select_assigned_or_active on public.jobs;
-- create policy jobs_select_assigned_or_active
--   on public.jobs
--   for select
--   to anon, authenticated
--   using (
--     pro_id is not null
--     or status in (
--       'en_route','arrived','diagnosing',
--       'materials_requested','materials_approved','in_progress',
--       'inspection_completed','materials_declined','complete','cancelled'
--     )
--   );
-- alter table public.job_status_events   disable row level security;
-- alter table public.materials_requests  disable row level security;
-- alter table public.materials_receipts  disable row level security;
-- alter table public.tips                disable row level security;
-- alter table public.job_messages        disable row level security;
-- alter table public.job_media           disable row level security;
-- alter table public.job_notes           disable row level security;
-- alter table public.earnings_statements disable row level security;
-- grant all on table public.job_status_events, public.materials_requests, public.materials_receipts,
--   public.tips, public.job_messages, public.job_media, public.job_notes, public.earnings_statements
--   to anon, authenticated;
-- revoke insert on public.job_status_events from anon;
-- grant all on sequence public.job_status_events_id_seq, public.materials_requests_id_seq,
--   public.materials_receipts_id_seq, public.tips_id_seq, public.job_messages_id_seq,
--   public.job_media_id_seq, public.job_notes_id_seq
--   to anon, authenticated;
-- commit;
