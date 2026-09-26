# CHUNK 3 — Accept + Materials‑Decline Prototype

This slice extends the shared backend and Customer dual‑write to support:
- Pro accept (posted → en_route) and demo terminal writes
- Materials‑decline terminals with fees:
  - Diagnosis: `inspection_completed` with `inspection_fee_cents=4500`
  - Standard: `materials_declined` with `convenience_fee_cents=3000`

No auth added; prototype RLS policies are intentionally narrow and temporary.

## 1) Apply migrations

Recommended order for a fresh project:
1. `migrations/0001_init.sql`
2. `migrations/0002_chunk2_rls.sql`
3. `migrations/0003_chunk2_grants.sql`
4. `migrations/0004_chunk3_accept_and_decline.sql` (enum + column only)
5. `migrations/0005_chunk3_grants.sql` (privilege fix for UPDATE + optional status‑event inserts)
6. `migrations/0006_chunk3_rls_policies.sql` (prototype RLS policies for claim + terminals)
7. `migrations/0007_chunk3_select_assigned.sql` (SELECT policy so NEW rows after UPDATE are visible)

Warning:
- Use this PR branch’s latest files (Files tab → raw URL), not any older paste or copy.
- If running manually in the SQL Editor, run `0004` and finish/commit that execution BEFORE running `0006`. Never combine an `ALTER TYPE … ADD VALUE 'materials_declined'` and policies that reference `'materials_declined'` in the same run — Postgres requires the new enum value to be committed first (error 55P04 otherwise).

Notes:
- `0004` adds:
  - enum value `materials_declined`
  - column `convenience_fee_cents int not null default 0 check (>=0)`
- `0005` grants `UPDATE` on `public.jobs` to `anon`, `authenticated` (and `INSERT` on `public.job_status_events` optionally)
- `0006` defines the prototype RLS UPDATE policies for claim and demo terminals
- `0007` adds a permissive `SELECT` policy for assigned/active/terminal rows so that the NEW row produced by `UPDATE` (e.g. `posted → en_route`) passes RLS visibility. Without this, claim can fail with 42501 even if UPDATE policies are correct.

### RLS claim 42501 repair (existing projects)

Symptom:
- On claiming a job (`posted, pro_id null → en_route, pro_id set`), you see 42501 “new row violates row-level security policy”.

Root cause:
- In Postgres/Supabase, the NEW row after an `UPDATE` must also be visible under a `SELECT` policy. If only `status='posted'` rows are selectable, `en_route` (and other non‑posted) rows are not visible, causing the 42501 failure even when `UPDATE` policies allow the transition.

Fix:
- Apply `migrations/0007_chunk3_select_assigned.sql`, or paste the following in the SQL Editor:

```sql
-- Allow SELECT of assigned/active/terminal jobs so UPDATE posted→en_route passes RLS
-- (Postgres/Supabase requires the NEW row to pass a SELECT policy).
drop policy if exists jobs_select_assigned_or_active on public.jobs;
create policy jobs_select_assigned_or_active
  on public.jobs
  for select
  to anon, authenticated
  using (
    pro_id is not null
    or status in (
      'en_route','arrived','diagnosing',
      'materials_requested','materials_approved','in_progress',
      'inspection_completed','materials_declined','complete','cancelled'
    )
  );
```

Diagnostic query (optional):

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where tablename = 'jobs'
order by policyname;
```

## 2) Configure the Customer App dual‑write (unchanged keys)

In your browser’s localStorage (same as Chunk 2):
- `haven_supabase_url` — your Supabase REST URL (project API URL)
- `haven_supabase_anon_key` — the project’s anon key

The Customer app will POST to `/rest/v1/jobs` when a booking is created.
Chunk 3 updates ensure:
- `requires_diagnosis` is set when the category is in Plumbing, Electrical, Appliance, or (HVAC via the AC/Heating Repair Visit).
- `inspection_fee_cents` is `4500` when `requires_diagnosis=true`, else `0`.

## 3) Demo flow (accept + decline)

1. Post a job from the Customer app (any category).
2. From a Pro/test surface (or Supabase console), simulate accept by updating the row:
   - Preconditions: current `status='posted'` and `pro_id is null`.
   - Update: set `status='en_route'` and a non‑null `pro_id`.
   - Prototype RLS allows this transition.
3. Terminal (materials declined):
   - Diagnosis categories: set `status='inspection_completed'` (inspection fee applies).
   - Standard categories: set `status='materials_declined'` (convenience fee applies).

“One active job per pro” remains enforced — terminals are not active.

## 4) Verification

- Schema:
  - `select unnest(enum_range(null::job_status));` includes `materials_declined`
  - `select convenience_fee_cents from public.jobs limit 1;` column exists with default `0`
- RLS:
  - Claim succeeds only from `posted, pro_id null` → `en_route, pro_id not null`
  - Terminals succeed only to `inspection_completed` or `materials_declined` on assigned rows

