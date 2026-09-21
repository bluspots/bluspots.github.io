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

Warning:
- Use this PR branch’s latest files (Files tab → raw URL), not any older paste or copy.
- If running manually in the SQL Editor, run `0004` and finish/commit that execution BEFORE running `0006`. Never combine an `ALTER TYPE … ADD VALUE 'materials_declined'` and policies that reference `'materials_declined'` in the same run — Postgres requires the new enum value to be committed first (error 55P04 otherwise).

Notes:
- `0004` adds:
  - enum value `materials_declined`
  - column `convenience_fee_cents int not null default 0 check (>=0)`
- `0005` grants `UPDATE` on `public.jobs` to `anon`, `authenticated` (and `INSERT` on `public.job_status_events` optionally)
- `0006` defines the prototype RLS UPDATE policies for claim and demo terminals

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

