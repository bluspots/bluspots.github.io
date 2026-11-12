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

### Inspection fee: when it blocks a cancel (definition, OPEN for the founder)

A cancel is refused for the inspection only when there is evidence of an obligation the Customer already
knew about. The proposed definition is either of these:

1. an explicit, recorded fee acceptance (a server-set timestamp or event), or
2. the inspection actually started.

The schema has **no** acceptance column or event, so only (2) can be implemented today. Status
`diagnosing` is refused (`work_started`) and `inspection_completed` is refused (`inspection_fee_due`). A
`requires_diagnosis` job with `inspection_fee_cents` set (for example 4500) that is `en_route` or `arrived`
**is cancellable**: a fee value alone is not an acceptance. If the founder wants "accepted at posting" to
count, a later migration must first add a server-set acceptance record. `job_status_events` is not usable
as evidence: the Pro's direct status PATCHes write no event (audit finding F6).

## Effects of a successful cancel (one transaction)

- `status = cancelled` and `cancelled_at` are set. `pro_id` and `accepted_at` are cleared (the same row
  update as the Founder Control Center cancel), so the Pro loses access to the job and its
  one-active-job slot is free at once.
- The live point is wiped. 0037, if applied, also ends the live session.
- One `job_status_events` row is written: `actor_role:"customer"`, `actor_id` = the Customer,
  `from_status` → `cancelled`.
- If a Pro was released, one row in `job_pro_releases` (`event_id` of that event, `job_id`,
  `released_pro_id`, `at`). This table is owner-only: RLS on, no policies, no grants to `anon`,
  `authenticated` or `service_role`, not in any publication. No app can read it; the founder reads it in
  the SQL editor (a later admin RPC could show it). Today `job_status_events` itself is also unreadable by
  the apps (0027: RLS on, no policies, no client grants), but it has no Pro column and may be opened to the
  Customer later for a job timeline, so the Pro's id is kept apart. The rollback keeps this table.
- 0036 signal: the Customer gets `job_changed` `{reason:"updated", status:"cancelled"}`. The released
  Pro gets `{reason:"removed", status:"cancelled"}`. The Pro app should stop sharing, take the job off
  "my active job" and show "This job was cancelled." (0036 contract §5).

## Unchanged

The direct posted-job PATCH (0010) still works. No client UPDATE path is added. Every other job
transition is unchanged.

## OPEN for the founder (none decided here)

1. Should a cancel after accept require a reason (free text or a fixed list)? Today it takes none.
2. Fee-obligation definition above: confirm (2), "the inspection started", for now, and say whether you
   want an explicit fee acceptance recorded at posting, which would need a new migration. Today `arrived`
   is allowed even when an inspection fee is set.
3. After accept, should the job end `cancelled` (what this does) or go back to `posted` for another Pro?
4. Should repeated cancels by a Customer be rate-limited or flagged, for example for no-show abuse
   against Pros?
5. Released Pro id: now kept in the owner-only `job_pro_releases` table (see Effects). Should the
   released Pro be able to read their own rows? Should the Founder Control Center show them?
6. Should the Customer app move posted cancels from the direct PATCH to this RPC, and should a later
   migration retire the PATCH policy?
7. Should the Pro be told why (Customer-cancelled vs founder-cancelled)? The signal carries no actor.
8. Should a cancel be allowed while the Pro is `en_route` but has already driven a long way? There is
   no distance or time rule.
