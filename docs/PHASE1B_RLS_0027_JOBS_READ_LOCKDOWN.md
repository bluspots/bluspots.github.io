# Phase 1B: 0027 jobs read lockdown + RLS on unused tables

File: `supabase/migrations/0027_jobs_read_rls_and_unused_tables.sql`
(paste after 0026, as the database owner, in the Supabase SQL editor; safe to re-run).

## What it does

- `public.jobs` SELECT: drops 0007 `jobs_select_assigned_or_active` (any signed-in
  user could read every job with a Pro or past posted). Adds two policies, both
  `to authenticated`:
  - `jobs_select_own_customer`: `customer_id = auth.uid()`
  - `jobs_select_assigned_pro`: `pro_id = auth.uid()`

  `jobs_select_own_posted` (0023) stays. Posted jobs still reach Pros only through
  `jobs_posted_within_radius()` (SECURITY DEFINER, radius filtered).
  Write policies, grants, triggers and functions are unchanged.
- Turns RLS on for `job_status_events`, `materials_requests`, `materials_receipts`,
  `tips`, `job_messages`, `job_media`, `job_notes` and `earnings_statements`, with no
  policies. It also revokes anon/authenticated table and sequence rights on them.
  No app uses them. The owner and service_role are unaffected.
- A commented founder query (section 4). Run it before and after.

## Who sees what

| | before (0007) | after (0027) |
|---|---|---|
| Customer: own jobs, every status | yes | yes |
| Customer: another customer's job with a Pro or past posted | **yes** | no |
| Pro: jobs assigned to them | yes | yes |
| Pro: another Pro's jobs, other customers' cancelled jobs | **yes** | no |
| Pro: posted jobs in radius (board RPC) | yes | yes |
| anon | no (0020) | no |

Customers and Pros see no change in either app, because every read the apps make
is already filtered to the signed-in account's `customer_id` or `pro_id`, or goes
through an RPC.

## Test

`python3 supabase/tests/rls_0027_policy_matrix.py`

This runs against a **local throwaway Postgres only** (default
`-h /tmp -p 54331 -U postgres`; override it with `HAVEN_PG`). It emulates Supabase
roles and `auth.uid()` via `request.jwt.claims`, builds BEFORE and AFTER databases
from the migrations, and prints the read matrix and the scenario results (board,
claim, claim race, status PATCH with RETURNING, customer INSERT/cancel/approve with
RETURNING, the 0022 label RPC, and the unused tables). It also checks four things:

- re-running is a no-op
- the rollback restores the BEFORE catalog exactly
- the fail-fast check stops on a database without 0023
- only jobs SELECT policies and the eight tables change

Optional env:

- `HAVEN_PRO_0021`: the Pro repo's docs/0021 SQL
- `HAVEN_0025` and `HAVEN_0026`: until those land in this folder

`npm run verify` includes a static check of the migration text
(`RLS-0027` in audit.test.js).
