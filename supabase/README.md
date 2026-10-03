# Supabase/Postgres groundwork

This folder defines a minimal, production‑shaped schema for the Haven shared backend using Postgres/Supabase conventions. It is intentionally safe:

- No environment variables or client SDK wiring added.
- No runtime behavior in the apps changes.
- SQL only; apply in a separate Supabase project when ready.

Usage (reference):
- Review `migrations/0001_init.sql` for the proposed schema.
- Create a fresh Supabase project and run the migration there.
- CHUNK 2 adds:
  - `migrations/0002_chunk2_rls.sql` — enables RLS on `public.jobs` and adds prototype INSERT/SELECT policies for `status='posted'`
  - `migrations/0003_chunk2_grants.sql` — grants SELECT, INSERT on `public.jobs` to `anon`, `authenticated` (privilege fix)
  - A thin client dual‑write from the Customer app using raw `fetch` to Supabase REST (`/rest/v1/jobs`) gated by browser `localStorage` config keys:
    - `haven_supabase_url`
    - `haven_supabase_anon_key`
  - See `docs/CHUNK2_SETUP.md` for setup/verification steps
-
- CHUNK 3 adds:
  - `migrations/0004_chunk3_accept_and_decline.sql` — adds `materials_declined` status and `convenience_fee_cents`
  - `migrations/0005_chunk3_grants.sql` — grants `UPDATE` on `public.jobs` (and optional `INSERT` on `public.job_status_events`) to `anon`, `authenticated`
  - `migrations/0006_chunk3_rls_policies.sql` — prototype UPDATE RLS policies for claim + terminals
  - `migrations/0007_chunk3_select_assigned.sql` — permissive SELECT policy for assigned/active/terminal rows so NEW rows after UPDATE are visible
  - Customer dual‑write now sets `requires_diagnosis` and `inspection_fee_cents=4500` for diagnosis categories
  - See `docs/CHUNK3_SETUP.md` for setup/verification steps

Notes:
- UUIDs use `gen_random_uuid()` (requires `pgcrypto`).
- Statuses are an enum (`job_status`).
- “One active job per pro” is enforced via a partial unique index on `jobs(pro_id)` for active statuses.
- Earnings Statements are immutable snapshots; Receipts are rendered from canonical job data.

Applying migrations
- Recommended order for greenfield projects: `0001_init.sql`, `0002_chunk2_rls.sql`, `0003_chunk2_grants.sql`, then `0004_chunk3_accept_and_decline.sql`, `0005_chunk3_grants.sql`, `0006_chunk3_rls_policies.sql`, and `0007_chunk3_select_assigned.sql`, then later lifecycle migrations through `0015`, then `0016_auth_profiles.sql`.
- If prior chunks were already applied, run `0004`, then `0005`, then `0006`, then `0007` to add CHUNK 3 without editing migration history.
- Slice 1 (`0016_auth_profiles.sql`) adds `public.profiles` and an `auth.users` insert trigger. It does not change `public.jobs` RLS. See `docs/SLICE1_AUTH_PROFILES.md`.
- Slice 2 does not add a migration. Job policies in `0002`–`0015` are already `to anon, authenticated`, with the same status rules. Signed-in Customer writes use the Auth user id and access token. Slice 4 stops the no-session demo customer write. See `docs/SLICE2_SESSION_JOB_WRITES.md`.
- Slice 3 (`0017_auth_job_ownership.sql`) adds restrictive `authenticated` ownership policies on `public.jobs`. Anon demo writes stay on the 0002–0015 permissive policies. See `docs/SLICE3_OWNERSHIP.md`.
- Slice 4 (`0018_retire_demo_pro_claim.sql`) makes `pro_claim_job` fail when `auth.uid()` is null instead of assigning the demo pro. Signed-out Customer and Pro job writes stop in the clients. See `docs/SLICE4_DEMO_RETIREMENT.md`.
- Slice 5 does not add a migration. Configured job mutations wait for a landed server write before the local screen advances. See `docs/SLICE5_FAIL_CLOSED.md`.

