# Haven — Backend Current-State Comparison (Customer vs Pro)

Status: reference notes for shared-backend groundwork · Source: verified against `bluspots.github.io` (Customer) and `haven-pro` (Pro)

Scope: What each app currently stores/assumes about jobs, customers, pros, pricing, materials, inspections, tips, addresses, messaging, diagnosis, photos, completion, receipts, and earnings — where they agree, disagree, or are one‑sided. Ends with what should move to a backend.

---

## Summary view (plain English)

- Customer has a complete customer-side booking → tracking → rating/receipt loop with fixed labor price, emergency fee, tipping, cancellation, saved addresses/cards, and a receipts/document foundation — all local to the browser (persisted to localStorage).
- Pro has a real accept → complete lifecycle, eligibility filters, a two-tier price card (payout + inspection fee for diagnosis categories), materials request/approval with receipt-verified reimbursement, optional notes/photos, Earnings with a per‑job statement, verification/readiness gating, and “one active job at a time” — also local state (no backend).
- The two apps already diverge on several concrete fields (diagnosis, inspection fee, materials, timestamps granularity, address precision, job IDs). Both are explicitly fixed‑price; there is no hourly/bidding anywhere.
- Economics are locked: labor payout is fixed and shown up front; Haven’s margin lives inside the customer’s listed labor price (current working 20%/80%) and does not touch materials/tips/inspection.

---

## Jobs

- Customer stores:
  - Identity: `id` (timestamp number), `taskId` or `custom` (title/category/budget), `status` (`posted|en_route|arrived|in_progress|complete|cancelled`)
  - Pricing: catalog price or `custom.price`, `emergency` + `$35` fee, `lockedPrice` (labor at booking time), no explicit pro payout field
  - Location: `addressText` (full snapshot string), `addressLabel` (e.g. “Home”), no coordinates
  - Lifecycle timestamps: `acceptedAt`, `completedAt`, `cancellationRequestedAt`, `tippedAt`
  - Messaging: `msgs[]` (local, in‑job chat thread)
  - Preferences snapshot: `jobPreferences[]`
  - Payment snapshot: `paymentBrand`, `paymentLast4`
  - Completion artifacts: auto‑generated receipt from job data
  - Materials/diagnosis: `requiresDiagnosis` is computed at creation for diagnosis categories; materials approval UI exists; approved `job.materials[]` render additively on receipt (no carve‑out from labor)

- Pro stores:
  - Identity: `id` (short string like `j1`), `category`, `title`, `customerName` (display only)
  - Pricing: `payout` (fixed pro labor payout, shown pre‑accept), `inspectionFee` (diagnosis categories), `requiresDiagnosis` (in historical data; live feed still uses a category lookup)
  - Location: `city` (coarse pre‑accept), `lat/lng` (simulated; used for arrival geofence and map links), no full address
  - Lifecycle: full live state machine in `activeJobs` with `en_route → arrived → diagnosing → materials_requested → materials_approved → in_progress → complete|inspection_completed`
  - Timestamps: step timestamps exist while active; only `completedAt` is kept in history today
  - Materials: `pendingMaterialsRequest {items,totalCost}` while pending/approved; `materialsReimbursed` credited only when receipt submitted; `materialsReceiptPhoto` required at receipt step
  - Messaging: per‑job chat (Pro‑app‑local, ephemeral)
  - Photos/notes: optional before/after photos + notes captured during work; included on Earnings Statement
  - Earnings: `SIM_COMPLETED_JOBS` seed + real completions; `jobAmount()` = payout or inspection fee + materials + tip; no platform fee modeled in Pro App

Agreement:
- Fixed‑price labor; customer sees one number; pro sees fixed payout before accepting.
- Status family overlaps on core stages (`posted,en_route,arrived,in_progress,complete,cancelled`).
- Tipping exists and is 100% to the pro.

Conflicts / mismatches:
- IDs differ (timestamp number vs short string). Neither is backend‑safe.
- Address precision: Customer stores full address snapshot; Pro stores city + lat/lng; no “post‑accept full address” field on Pro yet.
- Diagnosis/inspection fee and materials workflow now exist on both sides: Customer models `requiresDiagnosis`, supports materials approval, and recognizes `inspection_completed`/`materials_declined` terminals. Inspection fee appears in backend payloads for diagnosis categories; Customer UI does not surface it pre‑booking.
- Customer follows the locked rule: materials are additive; labor remains the full service price.
- Timestamps: Customer persists several status timestamps; Pro drops most timestamps when finalizing.

One‑sided data:
- Customer‑only today: preferences snapshot, payment snapshot, receipts UI, ratings/reviews, cancellation request state.
- Pro‑only today: payout/inspection fee fields, requiresDiagnosis flag (historical), materials request/approval/receipt, job notes/photos, job earnings statements, verification/readiness, “one active job at a time”.

Duplicated or drifting rules:
- Status vocabulary is close but not identical (Pro adds `diagnosing`, `materials_requested`, `materials_approved`, `inspection_completed`).
- Pricing vocabulary is duplicated with different field names (`lockedPrice` vs `payout`, no explicit `fixedCustomerLaborPrice` on Customer).

Should move to backend:
- Canonical job identity (UUID), current status, full status event log, and role‑owned transitions enforcement.
- Canonical pricing snapshot: `fixed_customer_labor_price`, `fixed_pro_labor_payout`, optional `margin_rate` (for audit), `emergency_fee`, `inspection_fee`.
- Materials workflow and reimbursement records with required receipt photo.
- Tips ledger and payout integration artefacts (status, timestamps).
- Messaging threads per job (Pro/Customer), stored and access‑controlled.
- Post‑accept full address snapshot; pre‑accept coarse location.
- Complete timestamp history per job; computed actual duration when available.
- Earnings statement generation (immutable snapshots) and delivery state.

---

## Customers

- Customer App: profile basics, saved addresses, saved cards, notification prefs; no auth backend; localStorage persistence.
- Pro App: no customer entity — jobs only carry a display `customerName`.

Move to backend:
- A real `customer` record, owned by auth, separate from job snapshots; job keeps a stable `customer_id` plus display snapshots where needed (receipt).

---

## Pros

- Customer App: `PROS[]` is a simulated customer‑facing card (trust metrics, badges) used for display.
- Pro App: full pro profile + verification (identity, background, payout/tax via provider references), credentials, work categories, travel radius; “marketplaceReady” gate; “one active job at a time.”

Agree:
- Pro object is not the same as the customer‑facing pro card; the latter should be a read projection.

Move to backend:
- Canonical `pro` record with provider references only (no raw sensitive data), readiness flags, and public profile fields; derive the customer‑facing projection from it.

---

## Pricing and economics

- Locked rules (both repos’ docs):
  - Fixed labor price; no hourly/bidding.
  - Haven margin: current working 20% of labor (adjustable).
  - Pro payout: 80% of labor; shown pre‑accept; exact amount paid.
  - Haven takes 0% of materials, tips, inspection.
  - Materials are additive, not carved out of labor.
- Customer code currently carves materials from labor at receipt generation time (prototype helper) — explicitly non‑canonical.
- Pro code and docs follow the locked rules (no platform fee; materials reimbursed on receipt).

Backend responsibilities:
- Persist the labor price and pro payout as two explicit fields per job.
- Keep margin representation as metadata (rate/amount) for audit, not as a deduction from pro payout.
- Separate ledgers for materials reimbursement and tips; both 100% to pro.

---

## Materials, diagnosis, inspection

- Customer: no first‑class fields for diagnosis/materials/inspection today.
- Pro: full simulated flow with required receipt photo, `inspectionFee`, `inspection_completed` terminal status, and `materials_approved` intermediate status.

Backend:
- `materials_requests` table + receipt attachment record; approval (customer‑owned) vs receipt submission (pro‑owned) separation; reimbursement ledger.
- Diagnosis flag (`requires_diagnosis`) set at job creation; inspection fee stored on diagnosis categories; standard‑category materials‑decline outcome remains a founder decision.

---

## Addresses and coordinates

- Customer: full `addressText` snapshot + label.
- Pro: `city` + `lat/lng` (simulated), no post‑accept full address field.

Backend:
- Pre‑accept coarse location (city/approx); post‑accept full address snapshot and optional coordinates; access controlled by role and assignment.

---

## Messaging

- Both: in‑app messaging exists, local only; threads are not shared/persisted.

Backend:
- `job_messages` table keyed to `job_id`, `sender_role`, timestamps; no phone‑call feature per locked rules.

---

## Photos/media

- Customer: booking photos (optional), rendered on receipt; not stored in a backend.
- Pro: optional before/after photos; materials receipt photo required; included on earnings statement.

Backend:
- Storage‑backed media with signed URLs; `job_media` table with typed attachments. No raw sensitive ID docs allowed per security rule.

---

## Completion, receipts, earnings

- Customer: Receipts are generated views from job data; not stored separately.
- Pro: Job Earnings Statement generated per finalized job; delivery status simulated.

Backend:
- Immutable earnings statements created at completion; optional receipt view composed from canonical job data; email delivery state tracked. Receipts remain generated views (no duplication), statements are stored records.

---

## What the backend should authoritatively own vs app‑local

- Backend‑owned:
  - IDs; status transitions and audit trail; assignment; all pricing/tips/materials/inspection economics; timestamps; messaging; media metadata; pro readiness flags; “one active job per pro” gate; cancellation policies.
- Client‑local (presentation only):
  - Feed sort/filter, local UI state; trust‑badges view; read‑only projections (e.g., customer‑facing pro card); progress animations between accepted and `en_route` that do not alter canonical status; ephemeral typing indicators.

--- 

References:
- Customer: `home_services_app.jsx`, `HAVEN_MASTER_SPEC.md`, `HAVEN_JOB_CONTRACT.md`
- Pro: `_pro/home_services_pro_app.jsx`, `_pro/HAVEN_JOB_CONTRACT.md`, `_pro/HAVEN_PRO_ACCOUNT_CONTRACT.md`, `_pro/HAVEN_PRO_CURRENT_STATE.md`

