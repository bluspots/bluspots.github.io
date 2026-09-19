# Supabase/Postgres groundwork (no wiring)

This folder defines a minimal, production‑shaped schema for the Haven shared backend using Postgres/Supabase conventions. It is intentionally safe:

- No environment variables or client SDK wiring added.
- No runtime behavior in the apps changes.
- SQL only; apply in a separate Supabase project when ready.

Usage (reference):
- Review `migrations/0001_init.sql` for the proposed schema.
- Create a fresh Supabase project and run the migration there.
- Do not connect the Customer or Pro apps yet — this PR is documentation + groundwork only.

Notes:
- UUIDs use `gen_random_uuid()` (requires `pgcrypto`).
- Statuses are an enum (`job_status`).
- “One active job per pro” is enforced via a partial unique index on `jobs(pro_id)` for active statuses.
- Earnings Statements are immutable snapshots; Receipts are rendered from canonical job data.

