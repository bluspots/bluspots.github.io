# HAVEN — SHARED BACKEND CONTRACT

Status: draft for foundation · Scope: Customer ↔ Pro ↔ Backend (Supabase/Postgres shaped)

Purpose: Canonical, backend‑owned data model and enforcement for jobs and closely related records (pricing, materials, inspection, tips, messaging, completion, receipts, earnings). Keeps clients simple; avoids unused‑field sprawl.

Boundary with product rules

- Product/job rules (WHAT) live in `HAVEN_JOB_CONTRACT.md` and are authoritative for lifecycle, permissions, economics, materials/declines, one‑active, category naming, and insurance policy.
- This backend contract (HOW) must mirror those rules exactly in enums/columns/RLS/APIs. If a discrepancy is found, update this file to match the product contract — never reinterpret product behavior here.

Do not wire any live clients in this PR. This is the source of truth for future client changes.

---

## 0) Locked product rules (authoritative)

- Fixed labor price; no hourly/bidding/negotiation.
- Haven margin 20% of labor (current working value, adjustable later).
- Pro payout is 80% of labor, shown before accept; the exact amount paid.
- Haven takes 0% of materials, 0% of tips, 0% of inspection visits, and 0% of the $30 convenience fee.
- Materials are additive (reimbursed), not carved from the labor price.
- Diagnosis materials‑decline: terminal is “Inspection Completed” with a $45 inspection fee to the Pro.
- Standard (non‑diagnosis) materials‑decline: terminal is “Materials declined — job could not be completed” with a $30 convenience fee to the Pro.
- One active job per pro.
- Messaging in‑app only; no phone‑call feature.
- Insurance out of scope; credentials are not “trust badges.”
- Backend is authoritative for cross‑app rules.

Category naming

- Pro‑side category names must exactly match Customer‑side category names. Backend stores category strings verbatim; no alternate naming exists server‑side.

Security: No raw card/CVV/SSN/bank login or raw sensitive ID docs in app schema. Use provider references only (Stripe Connect, Persona, Checkr, etc.).

---

## 1) Identity and ownership

- `job.id`: UUID (backend‑generated).
- `customer.id`: UUID (auth‑owned).
- `pro.id`: UUID (auth‑owned).
- `assignment`: `pro_id` nullable until accept, `accepted_at` timestamp when assigned.

Clients may display short friendly IDs; the backend remains the issuer of canonical IDs.

---

## 2) Canonical Job (compact, no sprawl)

Field groups and intent:

- Identity
  - `id` (uuid), `schema_version` (int)
- Parties
  - `customer_id` (uuid), `pro_id` (uuid nullable), `accepted_at` (timestamptz nullable)
- Service
  - `category` (text), `title` (text), `requires_diagnosis` (bool default false)
- Location
  - `city_label` (text), `address_snapshot` (text nullable, post‑accept only), `lat`/`lng` (numeric(9,6) nullable)
- Pricing snapshot (labor)
  - `fixed_customer_labor_price_cents` (int), `fixed_pro_labor_payout_cents` (int),
  - `margin_rate_bps` (int default 2000) — informational, for audit/debug; margin = price − payout
- Additive fees
  - `emergency` (bool), `emergency_fee_cents` (int default 0),
  - `inspection_fee_cents` (int default 0) — diagnosis categories only
  - `convenience_fee_cents` (int default 0) — applied on standard materials‑decline terminal only
- Lifecycle
  - `status` (enum; see §3), `posted_at` (timestamptz, default now()), `completed_at` (timestamptz nullable), `cancelled_at` (timestamptz nullable)
- Customer‑side snapshots
  - `customer_preferences_snapshot` (jsonb), `payment_snapshot` (jsonb with `{brand,last4}`), `booking_photos` (jsonb[] urls; storage‑owned)
- Communication
  - not embedded; see `job_messages`
- Materials
  - not embedded; see `materials_requests` + `materials_receipts` and `materials_reimbursed_cents` rollup on completion
- Tips
  - not embedded; see `tips` ledger and `tip_amount_cents` rollup on completion
- Diagnostics/notes/media
  - not embedded; see `job_media` (typed attachments) and `job_notes`

Notes:
- The job row stays compact: single record for “current state,” with related tables for time‑series and heavy/optional data.
- Receipts are rendered views from these facts; earnings statements are immutable records (separate table).

---

## 3) Status model (backend‑authoritative)

Enum (lowercase snake_case):
- `posted` → `en_route` → `arrived` → `diagnosing?` → (`materials_requested` → `materials_approved` →) `in_progress` → `complete`
                                                     ↘ `inspection_completed` (diagnosis decline)
                                                     ↘ `materials_declined`   (standard decline)
Any pre‑complete → `cancelled`

Ownership of transitions (enforced by backend):
- Customer: `(none)→posted`, `materials_requested→materials_approved` (approve), `materials_requested→inspection_completed` (decline), ratings/tips (post‑complete), cancellation request rules (pre/post accept).
- Pro: `posted→en_route` (accept), `en_route→arrived`, `arrived→diagnosing`, `diagnosing→in_progress`, `diagnosing→materials_requested`, `materials_approved→in_progress` (requires receipt), `in_progress→complete`, and setting terminal `materials_declined` when a standard‑category job cannot proceed due to declined materials. One active job per pro gate applies across all active statuses.

Every transition appends a row to `job_status_events(job_id, from_status, to_status, at, actor_role, actor_id)`. Clients read current status from `jobs.status`; history comes from `job_status_events`.

---

## 4) Materials workflow

- `materials_requests(job_id, requested_at, items_jsonb, estimated_total_cents, status: pending|approved|declined, responded_at, responded_by)`
- `materials_receipts(job_id, submitted_at, actual_total_cents, receipt_photo_url, submitted_by)`
- Backend credits `materials_reimbursed_cents` only on a receipt, never on approval.
- Materials‑decline terminals:
  - Diagnosis categories: `inspection_completed` with `inspection_fee_cents=4500`
  - Standard categories: `materials_declined` with `convenience_fee_cents=3000`

---

## 5) Tips

- `tips(job_id, amount_cents, status: not_added|processing|paid|failed, created_at, updated_at)`
- Roll up `tip_amount_cents` onto the job record at completion for quick reads.
- 100% to pro; backend never withholds from tips.

---

## 6) Messaging

- `job_messages(job_id, sender_role: customer|pro|support, sender_id, body, created_at)`
- In‑app only. No phone‑call feature.

---

## 7) Media & notes

- `job_media(job_id, kind: customer_booking|pro_before|pro_after|materials_receipt, url, created_at, created_by)`
- `job_notes(job_id, body, created_at, created_by)` (optional, pro‑side)
- Storage provider owns the binary; DB stores URLs/metadata.

---

## 8) Earnings & receipts

- Earnings Statement (immutable, created at financially final state):
  - `earnings_statements(id, job_id, pro_id, created_at, financial_snapshot_jsonb {gross_cents, materials_cents, tip_cents, net_cents, status}, pdf_url nullable, email_status, emailed_at nullable)`
- Customer Receipt is a rendered view from job + rollups (not a separate stored record).

Net for a job:
- If `status=inspection_completed`: `gross = inspection_fee_cents`
- Else if `status=materials_declined`: `gross = convenience_fee_cents`
- Else `gross = fixed_pro_labor_payout_cents`
- `net = gross + materials_reimbursed_cents + tip_amount_cents`

---

## 9) Pro readiness and “one active job”

- Readiness (auth/provider‑backed) lives on the `pros` profile (provider references only).
- One active job: backend enforces via a partial unique index on `jobs(pro_id)` where `status IN (en_route,arrived,diagnosing,materials_requested,materials_approved,in_progress)`.

---

## 10) Backend vs client responsibilities

Backend owns: IDs, status transitions and history, assignment, pricing/tips/materials/inspection math, timestamps, messaging storage, media metadata, pro readiness gating, the “one active job” constraint, and cancellation policies.

Clients own: local UI state (filters/sorting), projections (customer‑facing pro card), ephemeral affordances that don’t change canonical status (e.g., an “accepted” animation before `en_route`).

---

## 11) Founder decisions needed (blocks or shape schema)

See `docs/FOUNDER_DECISIONS_NEEDED.md` for the tracked list and proposed defaults; backend columns are designed to support either outcome where possible.

---

## 12) Security & privacy

- Provider references only for identity/background/payout/tax. No raw documents/numbers in app tables.
- Post‑accept full address snapshot is access‑controlled; pre‑accept coarse `city_label` is feed‑safe.
- Media stored via provider; DB stores signed URL + minimal metadata.

