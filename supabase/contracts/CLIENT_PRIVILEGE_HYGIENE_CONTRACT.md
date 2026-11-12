# Client table-privilege hygiene (MIG-0040): OPTIONAL, for the founder to consider

Status: **DRAFT, optional, not applied, do not merge.** Backend: `supabase/migrations/0040_client_table_privilege_hygiene.sql`. Owner: Codey.

## What and why
- Supabase's default privileges give anon, authenticated and service_role every table privilege. Haven's migrations narrowed SELECT/INSERT/UPDATE/DELETE, but never **TRUNCATE**, **REFERENCES** or **TRIGGER**.
- CoS's read-only production probe (2026-11-12 4:31 PM ET) shows these on `public.jobs`:

  | Role | Live grants on jobs |
  |---|---|
  | anon | REFERENCES, TRIGGER, TRUNCATE |
  | authenticated | INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
  | service_role | REFERENCES, TRIGGER, TRUNCATE |

- **TRUNCATE ignores RLS.** PostgREST can't issue TRUNCATE, CREATE TRIGGER or a foreign key, so none of this is reachable through the app API today. This is hygiene and defence in depth.
- 0040 revokes exactly TRUNCATE, REFERENCES and TRIGGER on `public.jobs` and `public.profiles` from anon and authenticated.

## Scope (why only these two tables)
These tables already revoke ALL from anon and authenticated:
- 0027: `materials_requests`, `materials_receipts`, `tips`, `earnings_statements`, `job_status_events`;
- 0032: `job_live_locations`;
- 0037: `job_live_sessions`, `job_live_session_stops`;
- 0038: `job_pro_releases`.

`jobs` and `profiles` are the only app tables that keep client grants, so they are the only ones that still carry these three privileges.

## Server guarantees
- After 0040, anon and authenticated have no TRUNCATE, REFERENCES or TRIGGER on `jobs` or `profiles`. A TRUNCATE gets `permission denied`.
- Every other privilege is byte-identical: SELECT/INSERT/UPDATE/DELETE, every column grant, service_role, owner and grantors. RLS, policies and functions are untouched.
- **Rollback:** the paste snapshots the two ACLs into the owner-only `public.privilege_hygiene_0040_snapshot` (RLS on, no policies, no grants to any API role). The rollback re-grants exactly the revoked privileges, with the same grant option, and drops the snapshot. In tests it restores the ACL byte for byte. The grantor becomes the role running the rollback (postgres), which matches the original when postgres granted them.

## Client duties
None. No app or Edge Function uses these privileges.

## OPEN for the founder
1. Apply 0040 at all? It's optional hygiene with no app-visible effect.
2. **Default privileges (not done):** new tables created later get Supabase's default grants again, TRUNCATE included. An `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated` (and the `supabase_admin` equivalent) would stop that. Founder's call; it changes platform defaults.
3. **service_role** keeps TRUNCATE, REFERENCES and TRIGGER on `jobs`. It's the server key, so this isn't client-reachable; out of scope here.

## Tests (local Postgres 17 only)
`tests/mig_0040_privilege_hygiene_matrix.py`: 56 checks (56/56 PASS), on two stacks (the production jobs grants and the Supabase-default harness grants). It covers:
- the baseline holding the privileges;
- 0040a/0040b before and after;
- a client-role paste refused;
- CRLF;
- the exact ACL diff;
- TRUNCATE and FK attempts refused;
- the app paths (Customer read and profile update, Pro status move, `pro_claim_job`);
- the owner-only snapshot;
- re-run;
- an exact rollback and a refused second rollback;
- re-apply;
- a foreign snapshot table refused;
- one read-only SELECT per check file.
