# customer_cancel_job: client contract (MIG-0038)

Status: **DRAFT, not applied.** Backend: `supabase/migrations/0038_customer_cancel_job.sql`.
Consumers: the Customer app (caller) and the Pro app (sees the result), built by Claude.
Starting point: Hub PR #3 `customer-cancel-job-PROPOSED-2026-11-10.md`, option 1 (cancel allowed after
accept). The policy questions below are **OPEN for the founder**. Copy, fees and refunds are out of scope:
this RPC charges, refunds and promises nothing.

## Call (Customer app)

`POST /rpc/customer_cancel_job` with body `{p_job_id}` and the Customer's JWT. The response never
contains coordinates, names or prices.

| Result | Body | Customer app does |
|---|---|---|
| cancelled | `{ok:true, status:"cancelled", from_status, pro_released}` | show Cancelled; refetch |
| `already_cancelled` | `{ok:false, error, status:"cancelled"}` | treat as success (no-op); refetch |
| `work_started` | status `diagnosing` / `in_progress` | don't cancel; show the job as in progress |
| `materials_pending` | a materials request is open (status, request row, 0026 undecided request) | don't cancel; show the request |
| `materials_approved` | materials were approved | don't cancel |
| `inspection_fee_due` | status `inspection_completed` | don't cancel |
| `job_finished` | `complete` / `materials_declined` | don't cancel |
| `money_involved` | reimbursed materials, a tip, a receipt or an earnings statement exists | don't cancel |
| `not_allowed_status` | any other state (for example an inconsistent assignment) | don't cancel; refetch |
| `not_found` | not your job, missing id or null id (same body for each) | refetch; remove the job if it's gone |
| `not_authenticated` | no session | sign in again |

Refusals return the current `status`, never change the row, write no event and send no signal.
Allowed from `posted` (no Pro), `en_route` and `arrived` (with a Pro).

## Effects of a successful cancel (one transaction)

- `status = cancelled` and `cancelled_at` are set. `pro_id` and `accepted_at` are cleared (the same row
  update as the Founder Control Center cancel), so the Pro loses access to the job and its
  one-active-job slot is free at once.
- The live point is wiped. 0037, if applied, also ends the live session.
- One `job_status_events` row is written: `actor_role:"customer"`, `actor_id` = the Customer,
  `from_status` → `cancelled`.
- 0036 signal: the Customer gets `job_changed` `{reason:"updated", status:"cancelled"}`. The released
  Pro gets `{reason:"removed", status:"cancelled"}`. The Pro app should stop sharing, take the job off
  "my active job" and show "This job was cancelled." (0036 contract §5).

## Unchanged

The direct posted-job PATCH (0010) still works. No client UPDATE path is added. Every other job
transition is unchanged.

## OPEN for the founder (none decided here)

1. Should a cancel after accept require a reason (free text or a fixed list)? Today it takes none.
2. Should `arrived` count as an inspection fee being due on a `requires_diagnosis` job with
   `inspection_fee_cents > 0`? Today `arrived` is allowed.
3. After accept, should the job end `cancelled` (what this does) or go back to `posted` for another Pro?
4. Should repeated cancels by a Customer be rate-limited or flagged, for example for no-show abuse
   against Pros?
5. Should the released Pro's id be kept anywhere? `job_status_events` has no Pro column, and
   `pro_id` / `accepted_at` are cleared.
6. Should the Customer app move posted cancels from the direct PATCH to this RPC, and should a later
   migration retire the PATCH policy?
7. Should the Pro be told why (Customer-cancelled vs founder-cancelled)? The signal carries no actor.
8. Should a cancel be allowed while the Pro is `en_route` but has already driven a long way? There is
   no distance or time rule.
