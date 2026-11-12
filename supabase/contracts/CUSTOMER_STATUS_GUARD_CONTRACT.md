# Customer status guard and no self-claim: client contract (MIG-0039 v2)

Status: **DRAFT, not applied, do not merge.** Backend: `supabase/migrations/0039_customer_status_guard.sql`.
Owner: Codey.

Closes CoS audit finding F5: a Customer could PATCH their own job into a Pro status (for example `complete`) through the existing RLS policies.

v2 (t676) also closes Quagon's #101 review findings:
- **HIGH-1:** a Customer could set their own operating point, claim their own posted job through `pro_claim_job`, and then drive it to `complete` as its "Pro". This is reachable on production today, because CoS confirmed read-only that `profiles_update_own` gives authenticated users column UPDATE on `operating_lat`, `operating_lng`, `pro_workspace` and `work_categories`.
- **MED-1:** the Customer's four own targets had no source-state limit.
- **LOW-1:** the Pro could complete from any active status.

0029 (#90) contains the same rules (IV.1, IV.2, IV.3), but it waits behind 0025 → 0026 → 0028 and the fee decisions. 0039 carries them on its own, so it can ship first. With both installed, a move is refused by whichever trigger fires first, with the same SQLSTATE and the same messages. Tested in both paste orders.

## Rules (server-enforced)
1. **The job's own Customer** (anon/authenticated caller whose `auth.uid()` is the job's `customer_id`, **even if they are also its assigned Pro**) may change `status` only like this:

   | Move | Allowed from |
   |---|---|
   | → `cancelled` | `posted` with no Pro (a cancel after assignment goes through `customer_cancel_job`, 0038) |
   | → `materials_approved` / `materials_declined` | `materials_requested` |
   | → `inspection_completed` | `diagnosing` or `materials_requested` |

   Every other Customer move is refused: SQLSTATE `42501`, "The customer cannot set this job status" (PostgREST HTTP 403). Nothing is written.
2. **Everyone else** (in practice, the assigned Pro) can set `complete` only from `in_progress`. Otherwise: `42501`, "A job can only be completed from in_progress" (HTTP 403). The Pro app already sends `PATCH … &status=eq.in_progress {status: complete}` only.
3. **Nobody**, privileged callers included, can make `pro_id = customer_id`: not by claim, update, reassignment, a `customer_id` change or an insert. The error is `42501`, "A job cannot be claimed by or assigned to the account that posted it" (0029 IV.2, the founder rule since 2026-10-23).
4. **`pro_claim_job(job_id)`:** a claim of a job the caller posted gets the same `P0002` "job not claimable" as a job that is already taken.
   - This is decided in the claimable-job lookup, before the busy-Pro (C1) and radius checks. It reveals nothing new, and the C1 error order is unchanged.
   - Everything else is the LIVE 0030 body, byte for byte (two added conditions).

## Client duties
- None new. The Customer app sends only the moves in rule 1, and the Pro app completes only from `in_progress`.
- Treat `42501` on these writes as final. Show the server message and refetch.
- Treat `P0002` from `pro_claim_job` as "no longer available".

## Unchanged
- Every Pro move other than rule 2.
- A write that keeps the same status is not a move.
- Every privileged path for rules 1–2: `customer_cancel_job` (0038), the Founder Control Center RPCs and the SQL editor. `service_role` has no SELECT/INSERT/UPDATE/DELETE on `jobs` in production (CoS probe 2026-11-12 4:31 PM ET), so it can't write jobs at all.
- The job board (`jobs_posted_within_radius`): a Customer who has set an operating point may still **see** their own posted job there, but they can't claim it.

## Known effect on the Founder Control Center fingerprint
- `haven_admin.baseline_mismatches()` (0035) pins `pg_get_functiondef` of the 0030 `pro_claim_job`. After 0039 it reports `public.pro_claim_job(uuid) (changed)`. This is expected.
- It is read only when 0035 is pasted (already done) and by the read-only FCC verify probe.
- The rollback restores the exact 0030 body, and the fingerprint is clean again (tested).

## OPEN for the founder
1. Ship 0039 now, ahead of 0029? Recommended, because it closes F5 and the self-claim path without waiting for the fee decisions.
2. Should a Customer ever be able to send a job back to `posted` (for example "find another Pro")? 0039 refuses it, like 0029. Today only the Founder Control Center releases a job.
3. Hide a Customer's own posted job from their board view as well? That means recreating `jobs_posted_within_radius`, which is pinned by the 0030 version guard and the FCC fingerprint. 0029 has no equivalent. Not done; the claim is refused either way.
4. The `profiles` column grants that made HIGH-1 reachable (`operating_lat/lng`, `pro_workspace`, `work_categories` writable by any authenticated user, Customers included) are unchanged. A role check on Pro-only profile fields is a separate decision.

## Tests (local Postgres 17 + local PostgREST only)
- `tests/mig_0039_customer_status_guard_matrix.py`: 405/405 on the base stacks; 405/405 production-equivalent (no 0025); 404/404 production-equivalent + 0025–0029, and 404/404 again under the production jobs grants (t676).
  - **Moves:** every Customer move between all 11 statuses from 10 sources, baseline vs after; the Pro moves, including complete from every active status; the HIGH-1 self-claim (and a busy Customer still getting P0002); IV.2 for the owner, a `customer_id` change and an insert; `service_role` under the production grants; a legacy Customer = Pro row.
  - **Three stacks:** the live set; the live set + 0026/0028/0029, then 0039; and 0039 first, then 0026/0028/0029.
  - **Catalog, guards and checks:** catalog (including "pro_claim_job = live 0030 + two conditions"); guards; CRLF; re-run; another `pro_claim_job` body refused by 0039, 0039a and the rollback; rollback restoring the 0030 body and a clean FCC fingerprint; re-apply.
- `tests/mig_0039_mutants.py`: 15/15 killed (M01, M03–M16); 2 equivalent mutants documented in the file (M02 cancel source, the redundant tg_op term).
- `tests/mig_0039_postgrest_smoke.py`: 15/15 over HTTP: PATCH /jobs, PATCH /profiles, then POST /rpc/pro_claim_job.
