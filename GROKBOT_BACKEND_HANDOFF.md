# Grokbot Backend Handoff

Maintained by Claude (frontend). Owner of every fix below: **Grokbot** (backend: Supabase, RLS/security, auth, job lifecycle, pricing, payments, persistence, Mapbox/geocoding, integrations). Claude identifies, verifies where practical, documents and hands off; Claude does not change backend-owned code.

**Founder rule (Oct 11, 2026):** if information is presented as real to a user, it must come from legitimate data or be clearly identified as an estimate supported by real inputs. No fake addresses, payment methods, arrival times, simulated replies presented as real, imaginary earnings, invented notifications or unsupported promises. Use an honest empty state instead.

Last updated: 2026-10-11 (evening) · Line numbers refer to `master` (Customer) / `main` (Pro) on that date.

**Status values:** Reported · Confirmed · Blocked · In progress · Resolved. **Confirmed** = reproduced in code and/or the running app. **Suspected** = seen in code but not proven against the live backend.

**Note on visibility:** this repo is public and served by GitHub Pages. Security findings here stay at "what to verify" level; specifics are shared with the founder privately.

## Launch-critical (founder priority, Oct 11)

Fix before launch. No fabricated operational data may be shown as real in either app; where the backend has no real value, the apps show an empty state or a truthful limitation.

| ID | Problem | Why it blocks launch |
|---|---|---|
| HB-01 | Requested appointment time never reaches the backend; no real confirmation | Customers choose a window no Pro sees (Customer shows it as "Requested" with a visible "not shared yet" note since #62) |
| HB-02 | Pro app invents tips | Fake earnings in Earnings and statements |
| HB-03 | Customer app invents work performed, materials and Pro notes | Fake job records on receipts |
| HB-04 | Canned "customer" chat replies; messages not stored | Pros read messages customers never wrote |
| HB-05 | Customer categories missing from Pro discovery | Six job types never reach any Pro |
| HB-06 | Customer tips shown as paid without payment | False payment status |
| HB-07 | Sample payment cards on real accounts and jobs | Fake payment methods stored on jobs |
| HB-08 | Sample addresses on real accounts | Fake properties shown as the user's |
| HB-10 | Unsupported emergency timing promises | Guarantees nothing enforces |
| HB-11 | Mapbox and location enforcement | Matching uses city centres; no real distances or routes (see the Mapbox plan) |
| HB-21 | Secure developer/QA accounts | Needed to test mature accounts without Demo Mode (milestone after Mapbox) |

## Summary

| ID | Title | App | Priority | Status |
|---|---|---|---|---|
| HB-01 | Booking time never reaches the backend | Both | P0 (launch-critical) | Confirmed |
| HB-02 | Pro app invents tips on completed jobs | Pro | P0 | Confirmed |
| HB-03 | Customer app invents "work performed", materials and Pro notes on completion | Customer | P0 | Confirmed |
| HB-04 | Pro chat shows canned "customer" replies; messages are not stored | Both | P0 | Confirmed |
| HB-05 | Service categories don't match between apps | Both | P0 | Confirmed |
| HB-06 | Customer tip marked "paid" with no payment | Customer | P0 | Confirmed |
| HB-07 | Sample payment cards on new devices (and sent to the backend) | Customer | P0 | Confirmed |
| HB-08 | Sample addresses on new devices | Customer | P0 | Confirmed |
| HB-09 | Materials approval can show invented items and prices | Customer | P1 | Confirmed |
| HB-10 | Emergency and speed promises nothing enforces | Customer | P1 | Confirmed |
| HB-11 | Real location, distance and arrival time (Mapbox) | Both | P1 (next milestone) | Confirmed (partly resolved) |
| HB-12 | Support chat and support contacts are simulated | Both | P2 | Confirmed (Grokbot PRs #47, #49 open) |
| HB-13 | Pro verification and payout steps show "pending" with no provider | Pro | P2 | Confirmed |
| HB-14 | Statement email delivery is simulated | Pro | P3 | Confirmed (UI removed) |
| HB-15 | Profile edits are device-only; email and phone can't be changed | Both | P2 | Confirmed |
| HB-16 | Security review of tables the apps don't use yet | Backend | P1 | Suspected |
| HB-17 | Job lifecycle authorization and one-active-job rule: verify live | Backend | P2 | Reported |
| HB-18 | Jobs link to a property by address text | Customer | P3 | Confirmed |
| HB-19 | Customer-facing Pro trust metrics come from demo profiles | Customer | P3 | Suspected |
| HB-20 | Face ID / passkey sign-in | Both | P3 | Reported (feature) |
| HB-21 | Secure developer/QA accounts with realistic history | Both | Milestone | Planned (after Mapbox) |

---

## HB-01 · Booking time never reaches the backend
- **App / feature:** Customer booking → Pro job board / My Jobs.
- **Problem:** The customer picks a time (today: ASAP / This morning / …), but the job insert has no time field. `postCanonicalJob` payload in `home_services_app.jsx` (~L1817–1845) sends category, price, location, emergency, preferences and payment snapshot only. Pros can't see when the customer wants the work. Accepting a job confirms nothing about time.
- **Why it matters:** Customers believe they booked a time that no Pro ever sees. The approved design (specific 2-hour windows, Requested → Confirmed) can't be honest without it.
- **Expected:** Job stores the requested window (date + start/end, or ASAP flag; emergency separately). Pro feed and job detail show it. Accepting the job (or an explicit Pro action) records confirmation as a status event; the Customer app shows **Confirmed** only from that event.
- **Dependencies:** `jobs` columns, `job_status_events`, Pro feed query, RLS for the new fields.
- **PRs:** Customer #62 (live Oct 11): the window picker shows the pick as "Requested", says it is a preferred window and not a guaranteed arrival time, and that Pros can't see it yet. When this is built: set `HAVEN_REQUESTED_TIME_SHARED_WITH_PROS` to true, send `reqWindow` in the job insert, and map the backend confirmation to `confirmedWindow` (the only thing that makes the app show "Confirmed").
- **Verify:** Book with a window → row has the window → Pro sees it → accept → Customer shows Confirmed with the same window.

## HB-02 · Pro app invents tips on completed jobs
- **App:** Pro (Earnings, statements).
- **Problem:** `finalizeJob` in `home_services_pro_app.jsx` (~L1738) gives a completed job a random tip 70% of the time (5–20% of payout) and sets `tipStatus: "paid"`. This runs for real backend jobs.
- **Why:** Fabricated earnings in Earnings totals, charts and the Job Earnings Statement.
- **Expected:** Tip amount and status come only from the backend tips record / `jobs.tip_amount_cents` and real payment state; no tip shown until one exists.
- **Dependencies:** tips ledger, payment provider status, Pro job history read.
- **Verify:** Complete a real job with no tip → Earnings and statement show no tip.

## HB-03 · Customer app invents "work performed", materials and Pro notes on completion
- **App:** Customer (job details, receipt PDF).
- **Problem:** When polling sees a backend job become `complete`, the app fills `workPerformed`, `materials` and `proNotes` from random templates (`home_services_app.jsx` ~L1155–1160, `getCompletionDetails` in `pure_helpers.js` / `catalog_seeds.js`). The PDF receipt prints "work performed" (~L3302).
- **Why:** Customers see work descriptions and materials no Pro reported.
- **Expected:** Show only what the Pro submitted (job notes, materials receipts) from the backend; otherwise show nothing.
- **Dependencies:** `job_notes`, `materials_receipts` reads for the customer.
- **Verify:** Complete a real job with no notes → no "work performed" section anywhere.

## HB-04 · Pro chat shows canned "customer" replies; messages are not stored
- **Apps:** Pro and Customer messaging.
- **Problem:** Pro `sendCustomerMessage` (~L1652) adds a random reply attributed to the customer 1.8 s after the Pro sends anything, on real jobs. Neither app stores messages: Customer `msgs[]` and Pro `jobMessages` are device-local; the `job_messages` table (migration 0001) is unused.
- **Why:** Pros read messages the customer never wrote; real messages never arrive.
- **Expected:** Both apps read/write `job_messages` with access limited to the job's customer and assigned Pro. No auto-replies.
- **Verify:** Pro sends a message → no reply appears unless the customer sends one → customer sees the Pro's message on another device.

## HB-05 · Service categories don't match between apps
- **Apps:** Customer catalog / custom jobs → Pro job board.
- **Problem:** Customer categories (`catalog_seeds.js`): Appliance, Assembly, Cleaning, Electrical, Flooring, Installation, Landscaping, Maintenance, Moving, Painting, Pest Control, Plumbing, Repair, Smart Home. Pro work categories (`CATEGORY_GROUPS`): Appliance, Cleaning, Electrical, Furniture Assembly, HVAC, Handyman, Landscaping, Moving, Painting, Plumbing, Smart Home, TV Mounting. The Pro board matches by exact name (`workCategories.has(j.category)`, ~L1313).
- **Why:** Jobs posted as Assembly, Installation, Repair, Flooring, Maintenance or Pest Control can never appear for any Pro.
- **Expected:** One canonical category list (server-owned), used by the Customer catalog and Pro preferences, with a mapping for existing jobs.
- **Verify:** Post one job per Customer category → each appears for a Pro who selected the matching category.

## HB-06 · Customer tip marked "paid" with no payment
- **App:** Customer (Tip screen, job, receipt).
- **Problem:** `addTipToJob` (~L1964) sets `tipStatus: "paid"` after 900 ms with no payment.
- **Expected:** Tip status from the payment provider; show "processing" / failure truthfully.
- **Dependencies:** payments integration. **Verify:** tip without a payment record never shows as sent/paid.

## HB-07 · Sample payment cards on new devices (and sent to the backend)
- **App:** Customer (Payment methods, booking).
- **Problem:** `DEFAULT_CARDS` (`home_services_app.jsx` ~L180): Visa 4242, Mastercard 8821 appear as saved cards on a new device, are pre-selected at booking, and their brand/last4 go into `payment_snapshot` on the job insert (~L1841).
- **Expected:** Payment methods come from the payment provider; none → empty state ("Add a payment method"). Never store a sample card on a job.
- **Verify:** Fresh device, real account → no cards listed; booking requires adding one.

## HB-08 · Sample addresses on new devices
- **App:** Customer (Saved addresses, My Home, booking, Home header city).
- **Problem:** `DEFAULT_ADDRESSES` (~L184): "123 Market Street, Apt 4B, San Francisco" (with home details) and "500 Folsom Street" appear for a new device; the Home header shows "San Francisco, CA" from it.
- **Expected:** Empty state until the user adds a real, validated address; addresses stored per customer on the server (see Mapbox plan).
- **Verify:** Fresh device → no addresses, My Home empty state, booking asks for an address.

## HB-09 · Materials approval can show invented items and prices
- **App:** Customer (materials approval card on Tracking).
- **Problem:** If a job is `materials_requested` without an attached request, the card builds a list from random templates with prices (`computeFallback`, ~L4360).
- **Expected:** Show only the Pro's submitted request (`materials_items`, `materials_estimate_cents`); if missing, say the details haven't arrived.
- **Verify:** Force `materials_requested` with no items → no invented items.

## HB-10 · Emergency and speed promises nothing enforces
- **App:** Customer booking.
- **Problem:** Copy promises timing the system can't guarantee: "Urgent issues, handled within 6 hours." (~L4156, L4217), emergency options "Within 1–2 hours / 4 hours / 6 hours" (`EMERGENCY_TIME_PREFS` L90–93), ASAP "Within 2 hours" (L82), Home "✓ Same-day" (~L2060).
- **Expected:** Grokbot defines real emergency acceptance/scheduling behavior; until then the frontend uses truthful wording (Claude can prepare the copy change on approval).
- **Verify:** No time guarantee appears that the backend doesn't enforce.

## HB-11 · Real location, distance and arrival time
- **Apps:** Both.
- **Status:** Simulated ETA/distance removed from Customer tracking (Customer #63, live). The tracking map is a decorative illustration, not a location. Pro watches its own location only during en-route to gate "I've Arrived" (`home_services_pro_app.jsx` ~L1245); nothing is shared with the customer. Pro job distances depend on radius matching (migration 0023).
- **Expected:** Per the Mapbox plan: validated addresses with coordinates, server-side distance/radius matching, routing distance/time from Mapbox, and later opt-in live Pro location shared only during an active job.

## HB-12 · Support chat and support contacts are simulated
- **Apps:** Both. Customer: Grokbot's open PRs #47 (removes fake phone/Transaction ID/contacts) and #49 (simulated support). Pro: "Demo — replies are simulated" in support chat (~L4108) and a `mailto:pro-support@havenpro.example` link (~L4096) to a non-existent address.
- **Expected:** A real, monitored support channel, or no support contact shown.

## HB-13 · Pro verification and payout steps show "pending" with no provider
- **App:** Pro (Identity, Background check, Payout, Tax).
- **Problem:** Submitting sets status "pending" with made-up provider ids (`persona_demo_…`, `checkr_demo_…`, `acct_demo_…`, `tax_demo_…`, ~L1831–1956); no provider session exists. Only QA dev controls (server-gated) can change the status.
- **Expected:** Real provider sessions and webhooks; until then, say the step isn't available yet.

## HB-14 · Statement email delivery is simulated
- **App:** Pro. The app still generates a local "statement" record with simulated email delivery (~L1775). The "Emailed to you" UI is removed (Pro #55, live). **Expected:** server-created `earnings_statements` and real delivery state, or no email claim.

## HB-15 · Profile edits are device-only; email and phone can't be changed
- **Apps:** Customer name/bio/photo are saved on the device only (account name now shown from Auth, Customer #59). Email change needs an Auth flow; the phone field is unused. Pro profile workspace syncs for QA testers only (`profiles.pro_workspace`).
- **Expected:** Profile fields stored server-side per user; email change via Auth with confirmation.

## HB-16 · Security review of tables the apps don't use yet
- **Status:** Suspected. Migrations in this repo enable row-level security on `jobs` and `profiles`. Before the apps start using the messaging, media, notes, tips, materials and statement tables, confirm their access rules and grants on the live database. Details shared with the founder privately.

## HB-17 · Job lifecycle authorization and one-active-job rule: verify live
- **Status:** Reported. Migrations define per-transition rules (0004–0015, 0017–0019, 0025) and the `one_active_job_per_pro` unique index (0001). Claude can't verify the live database. **Verify:** a Pro can't move another Pro's job; a customer can't advance status; a second active claim returns 409.

## HB-18 · Jobs link to a property by address text
- **App:** Customer My Home (Customer #60). Service history matches jobs by the address string saved on the job; editing a property's address detaches its history. **Expected:** a property id on the job.

## HB-19 · Customer-facing Pro trust metrics come from demo profiles
- **Status:** Suspected. `PROS[]` demo profiles carry trust score, on-time rate and "would hire again" (~L62–75, L2489). Backend job cards say they never use the demo pro (L16). Verify no real user sees demo metrics; real metrics need a backend source.

## HB-20 · Face ID / passkey sign-in
- Feature request; authentication infrastructure.

## HB-21 · Secure developer/QA accounts with realistic history (milestone, after Mapbox)
- **Goal:** Let the founder use the real apps as an established Pro (and customer) with months of history, without bringing back public Demo Mode.
- **Data to seed:** 10–20 completed jobs across categories and several weeks/months; varied labor, tips and materials reimbursements; ratings; plus empty accounts for comparison.
- **Must have:** dedicated restricted QA identities; explicit test-data markers; no real charges or payouts; never visible to ordinary users; no effect on real financial reporting; no public keys or bypass controls; a safe reset/remove; real UI and data paths.
- **Owners:** Grokbot (seeding, authorization, isolation, financial safeguards). Claude (frontend experience, visual checks, regression tests).
