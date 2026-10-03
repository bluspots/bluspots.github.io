-- Haven shared backend — Slice 3 signed-in job ownership
-- Purpose: an authenticated session may write only its own jobs.
--          The signed-out demo path is unchanged.
--
-- Permissive policies in 0002–0015 are granted to anon and authenticated
-- together. Postgres ORs permissive policies, so another permissive policy
-- cannot tighten authenticated. These policies are RESTRICTIVE and apply
-- to role authenticated only. They are AND-ed with the existing permissive
-- policies. Anon is not a subject of these policies, so DEMO_CUSTOMER /
-- DEMO_PRO writes that already pass 0002–0015 still pass.
--
-- Claim edge: pro_id is null on the current row, so the rule cannot require
-- the current pro_id to equal auth.uid(). The new row must assign
-- pro_id = auth.uid() and use the existing claim transition
-- (posted + unassigned → en_route). Later pro updates require the stored
-- row to already be assigned to auth.uid(). Status rules stay on the
-- permissive policies (including the 0015 restrictive predecessor check).
--
-- Does not change SELECT (no read scoping), grants, economics, the
-- pro_claim_job function, or anon policies. Does not lock down anon.
--
-- Apply in the Supabase SQL editor as the database owner, after 0016.
-- Do not apply from the app. Safe to re-run: policies are dropped and recreated.

alter table public.jobs enable row level security;

-- Authenticated INSERT: the new row's customer is this user.
-- Posted + unassigned still comes from jobs_insert_posted_only.
drop policy if exists jobs_restrict_auth_insert_own_customer on public.jobs;
create policy jobs_restrict_auth_insert_own_customer
  on public.jobs
  as restrictive
  for insert
  to authenticated
  with check (
    customer_id = auth.uid()
  );

-- Authenticated UPDATE: customer owns the row, or this user is claiming a
-- posted unassigned job as themselves, or the job is already assigned to them.
-- WITH CHECK sees the new row. EXISTS reads the stored row (not yet updated),
-- same pattern as 0015. No USING clause: a failed ownership check is an error,
-- not a silent 0-row update.
drop policy if exists jobs_restrict_auth_update_owner on public.jobs;
create policy jobs_restrict_auth_update_owner
  on public.jobs
  as restrictive
  for update
  to authenticated
  with check (
    (
      customer_id = auth.uid()
      and exists (
        select 1
        from public.jobs as existing
        where existing.id = jobs.id
          and existing.customer_id = auth.uid()
          and existing.pro_id is not distinct from jobs.pro_id
      )
    )
    or
    (
      status = 'en_route'
      and pro_id = auth.uid()
      and exists (
        select 1
        from public.jobs as existing
        where existing.id = jobs.id
          and existing.status = 'posted'
          and existing.pro_id is null
          and existing.customer_id = jobs.customer_id
      )
    )
    or
    (
      pro_id = auth.uid()
      and exists (
        select 1
        from public.jobs as existing
        where existing.id = jobs.id
          and existing.pro_id = auth.uid()
          and existing.customer_id = jobs.customer_id
      )
    )
  );
