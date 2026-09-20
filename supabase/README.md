# Supabase/Postgres groundwork

This folder defines a minimal, production‑shaped schema for the Haven shared backend using Postgres/Supabase conventions. It is intentionally safe:

- No environment variables or client SDK wiring added.
- No runtime behavior in the apps changes.
- SQL only; apply in a separate Supabase project when ready.

Usage (reference):
- Review `migrations/0001_init.sql` for the proposed schema.
- Create a fresh Supabase project and run the migration there.
- CHUNK 2 (this PR) adds:
  - `migrations/0002_chunk2_rls.sql` — enables RLS on `public.jobs` and adds prototype INSERT/SELECT policies for `status='posted'`
  - A thin client dual‑write from the Customer app using raw `fetch` to Supabase REST (`/rest/v1/jobs`) gated by browser `localStorage` config keys:
    - `haven_supabase_url`
    - `haven_supabase_anon_key`
  - See `docs/CHUNK2_SETUP.md` for setup/verification steps

Notes:
- UUIDs use `gen_random_uuid()` (requires `pgcrypto`).
- Statuses are an enum (`job_status`).
- “One active job per pro” is enforced via a partial unique index on `jobs(pro_id)` for active statuses.
- Earnings Statements are immutable snapshots; Receipts are rendered from canonical job data.

