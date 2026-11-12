# Customer status guard: client contract (MIG-0039)

Status: **DRAFT, not applied, do not merge.** Backend: `supabase/migrations/0039_customer_status_guard.sql`.
Owner: Codey. Closes CoS audit finding F5: a Customer could PATCH their own job into a Pro status (for
example `complete`) through the existing RLS policies. 0029 (#90, rule IV.3) contains the same rule, but
0029 waits behind 0025 → 0026 → 0028 and the fee decisions. 0039 is that one rule on its own, so it can ship
first. With both installed, the same move is refused once by each, with the same message.

## Rule

When the job's own Customer (who is not also its assigned Pro) changes `status` **into** `posted`,
`en_route`, `arrived`, `diagnosing`, `materials_requested`, `in_progress` or `complete`, the update is
refused: SQLSTATE `42501`, message "The customer cannot set this job status" (PostgREST HTTP 403). Nothing
is written.

## Unchanged

- The Customer's own moves: `cancelled` (posted job, 0010), `materials_approved`, `materials_declined`,
  `inspection_completed`, under the existing RLS and the 0026/0029 rules when installed. The Customer app
  sends only these today (`home_services_app.jsx`: cancel, approve materials, decline / end at inspection),
  so it needs no change.
- Every Pro move, and every privileged path: `pro_claim_job`, `customer_cancel_job` (0038), the Founder
  Control Center RPCs, `service_role`, and the SQL editor.
- A write that keeps the same status is not a move.

## OPEN for the founder

1. Ship 0039 now, ahead of 0029? Recommended, because it closes F5 without waiting for the fee decisions.
2. Should a Customer ever be able to send a job back to `posted` (for example "find another Pro")? 0039
   refuses it, like 0029. Today only the Founder Control Center releases a job.
3. Edge case: a job whose Customer is also its assigned Pro. 0039 exempts the assigned Pro, so their Pro
   moves keep working. 0029 IV.3 (when applied) has no such exemption and would refuse them. 0039 adds
   nothing there. Is that case real (a Pro booking work on their own home)?

## Tests (local Postgres 17 + local PostgREST only)

- `tests/mig_0039_customer_status_guard_matrix.py`: 186 checks. Every Customer move into a work/dispatch status
  from every source, baseline vs after, on three stacks: the live set; the live set + 0026/0028/0029 then 0039;
  0039 first, then 0026/0028/0029. Also catalog, guards, CRLF, rollback and re-apply.
- `tests/mig_0039_mutants.py`: 12 of 12 killed. Two mutants are retired as equivalent:
  - M06 (allow X -> posted): the existing stack already refuses that write, and 'posted' stays as defence in depth.
  - M12 (refuse every caller): jobs UPDATE RLS already admits only the Customer and the assigned Pro.
- `tests/mig_0039_postgrest_smoke.py`: 10 of 10 over HTTP PATCH /jobs.
