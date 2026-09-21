# FOUNDER DECISIONS NEEDED — Shared Backend Foundation

Only decisions that represent real cross‑app conflicts or gaps that would shape the backend schema/constraints. Each lists Customer does / Pro does / why conflict / recommendation / blocks backend?

1) Materials‑declined terminal outcome(s) and compensation — DECIDED (Chunk 3)
- Customer does: No materials‑decline UI/flow yet (Customer remains unchanged in Chunk 3).
- Pro does (live): If the Pro arrives, inspects/diagnoses, and the customer declines materials so the job cannot be completed, the job ends as `inspection_completed` and the Pro is paid the inspection fee ($45).
- Standard (non‑diagnosis) categories: When materials are discovered mid‑job and declined, the terminal is `materials_declined` with a $30 convenience fee to the Pro. Haven takes $0 of this fee.
- Outcome: Backend adopts both terminals:
  - Diagnosis path → `inspection_completed` with `inspection_fee_cents=4500`
  - Standard path → `materials_declined` with `convenience_fee_cents=3000`
- Blocks backend? No — schema and RLS shipped in Chunk 3.

2) Cross‑app status vocabulary (final set)
- Customer: `posted,en_route,arrived,in_progress,complete,cancelled`.
- Pro: Adds `diagnosing,materials_requested,materials_approved,inspection_completed` (live).
- Why conflict: Different enums cause drift and client‑side mapping.
- Recommendation: Adopt the extended set backend‑wide; keep clients free to show local micro‑moments between transitions.
- Blocks backend? No — enum chosen in this PR; clients can adopt over time.

3) Scheduled time representation
- Customer: `TIME_PREFS`/`tpId` category (“ASAP”, windows); no real timestamp.
- Pro: `requested` display string; no real timestamp.
- Why conflict: No machine‑usable schedule field; backend cannot enforce or plan.
- Recommendation: Add optional `scheduled_start_at` (timestamptz) and/or `scheduled_window` (text) now; clients may continue using display strings until wired.
- Blocks backend? No — optional fields added; enforcement can come later.

4) Address precision and exposure
- Customer: Full `address_snapshot`.
- Pro: `city` + `lat/lng` only; no post‑accept full address field.
- Why conflict: Pro needs full address after accept; privacy pre‑accept.
- Recommendation: Backend stores both `city_label` (always) and `address_snapshot` (only visible post‑accept). Confirm this visibility rule.
- Blocks backend? No — policy is embedded in access control; schema set here.

5) Lifecycle timestamps retention
- Customer: Persists several timestamps.
- Pro: Drops all but `completedAt` on history.
- Why conflict: Loses valuable audit/analytics data at completion.
- Recommendation: Backend keeps full `job_status_events`; add rollups if needed. Clients can keep their local simplifications.
- Blocks backend? No.

6) Job ID scheme and display ID
- Customer: timestamp number; Pro: short string.
- Why conflict: Not cross‑referencable or collision‑safe.
- Recommendation: Backend UUIDs. Optionally add a human display id (`HVN‑XXXXXX`) for receipts/statements.
- Blocks backend? No.

7) `requires_diagnosis` as a real field
- Customer: ❌; Pro: present in historical, lookup in live feed.
- Why conflict: Every consumer re‑derives it differently.
- Recommendation: Compute once at creation from the catalog rules and persist as a boolean on the job.
- Blocks backend? No.

8) Margin representation
- Customer: no explicit pro payout field; Pro: payout present, no customer labor price.
- Why conflict: Neither app carries both halves of the same number.
- Recommendation: Store both `fixed_customer_labor_price_cents` and `fixed_pro_labor_payout_cents`; keep `margin_rate_bps` metadata for audit. Do not store a “platform fee” line that deducts from payout.
- Blocks backend? No.

9) Messaging retention & privacy
- Customer/Pro: local ephemera today.
- Why conflict: Disappears on reload; cannot support support/escalations.
- Recommendation: Persist `job_messages` with role‑scoped access; prohibit sensitive PII (no card/SSN docs).
- Blocks backend? No.

10) Cancellation policy details (post‑accept)
- Customer: `cancelStatus:"requested"`; no fee model.
- Pro: No pro‑initiated abandonment behavior designed.
- Why conflict: Refunds/fees need backend rules to be consistent.
- Recommendation: Keep schema neutral (status + timestamps + reason codes). Decide fee windows in a later slice.
- Blocks backend? No.

11) Materials negotiation granularity
- Both: One whole‑request approval; no line‑item approvals.
- Why conflict: None functionally; just confirm intent.
- Recommendation: Keep v1 as whole‑request with required receipt; add itemization only if needed later.
- Blocks backend? No.

12) One active job per pro — exceptions
- Both: Treated as a locked rule.
- Why conflict: None; just confirm if any admin override exists.
- Recommendation: Enforce via partial unique index; add an admin “override once” path later if ever needed.
- Blocks backend? No.

13) Year‑end tax form
- Pro docs: explicitly TBD which 1099 and through which Stripe Connect workflow.
- Recommendation: Keep `tax_profile` provider reference only; defer exact form until legal/tax review.
- Blocks backend? No.

14) Trust Score linkage to reviews
- Customer: reviews exist; Trust Score simulated.
- Pro: Trust metrics derive from history in the Pro app now.
- Recommendation: Defer scoring rules; keep a simple `reviews` table stub later; do not block backend here.
- Blocks backend? No.

