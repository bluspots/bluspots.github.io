# Phase 1B B4 — Customer bookings from the account (cross-device)

Founder decision (2026-10-08 4:53 PM ET): Customer bookings load from the signed-in account's backend records on any device.

## What to paste

Nothing. No SQL, no migration, no policy change.

## The read

`fetchMyCanonicalJobs` (backend_adapter.js): `GET /rest/v1/jobs?order=posted_at.desc&limit=500&customer_id=eq.<auth user id>&select=…`

- `Authorization: Bearer <user access token>`, `apikey` = the public anon key. Signed out, or a session whose id is the demo customer: no request.
- Rows whose `customer_id` is not the signed-in user are dropped client-side as well.
- Selected columns: id, status, customer_id, pro_id, materials_items, materials_estimate_cents, fixed_customer_labor_price_cents, emergency_fee_cents, tip_amount_cents, materials_approved_cents (0025; same missing-column retry as #50), category, title, requires_diagnosis, city_label, address_snapshot, emergency, posted_at, accepted_at, completed_at, cancelled_at, customer_preferences_snapshot. Not payment_snapshot.
- Existing RLS already covers it: `jobs_select_own_posted` (0023, authenticated, `status = 'posted' and customer_id = auth.uid()`) and `jobs_select_assigned_or_active` (0007, `pro_id is not null or status in (en_route … cancelled)`). Every status of the customer's own jobs is readable. 0017 restrictive policies are insert/update only.

It runs on app load, on sign-in / account switch, and when Bookings opens (the first tick of the existing active-job poll). Later poll ticks are unchanged: active, backend-linked jobs by id, forward-only.

## Cache rules (haven_jobs)

- `haven_jobs_owner` = the account the cache belongs to. With Supabase configured, a cache owned by another account, or with no owner, is never rendered and is cleared. Sign-out clears it.
- Backend row + cached entry with the same backend id: merged. The backend status wins over a stale local status (unless the local status changed while the read was in flight). Local-only details (messages, photos, rating, description) stay; the local id stays so notifications still resolve.
- Backend row with no cached entry: built from backend columns (title/category, labor, emergency fee, preferences, accepted/completed time, materials request). Catalog titles map back to the catalog task. No demo pro, no demo completion details, no local card.
- Cached backend-linked job that the account read does not return: dropped, unless it was posted in this tab after the read began.
- Local-only entry (no backend id): not a booking. Dropped once the account read lands. With Supabase configured, Slice 5 already saves a job only after its backend create lands, so these come only from older builds or the unconfigured preview.
- Strict source of truth: cached jobs are shown (Bookings, status, history, receipts) only after this account's read has landed. Until then Bookings says "Loading your bookings…"; after a failed read it shows ONLY "Couldn't load your bookings. Retry", with no cached or local entries, and Retry re-reads. The cache stays in storage (it is not deleted by a failed read). A job whose backend create landed in this tab is shown even before the read.
- The account-switch / sign-out check runs only after the auth session has finished loading.
- No Supabase config (local preview / test harness): unchanged.

Receipts and the Booking Summary keep using the backend totals (#45 / #50 / #51); the account read fills the same receipt map.

## Not changed

RLS, grants, auth, job lifecycle, pricing, location rules, payment records, tips, receipt fee display, support wording, the Bookings card total, Messages / Posted header totals, visual polish, seeds (Jane Doe).
