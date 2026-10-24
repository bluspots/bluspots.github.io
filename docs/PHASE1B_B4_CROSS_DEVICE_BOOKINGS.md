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

- `haven_jobs_owner` = the account the cache belongs to. With Supabase configured, a cache owned by another account, or with no owner, is never rendered. An owned cache is moved to that account's per-account store (below) on sign-out, on an account switch, and at load when a different account (or nobody) is signed in.
- Backend row + cached entry with the same backend id: merged. The backend status wins over a stale local status (unless the local status changed while the read was in flight). Local-only details (messages, photos, rating, description) stay; the local id stays so notifications still resolve.
- Backend row with no cached entry: built from backend columns (title/category, labor, emergency fee, preferences, accepted/completed time, materials request). Catalog titles map back to the catalog task. No demo pro, no demo completion details, no local card.
- Cached backend-linked job that the account read does not return: dropped, unless it was posted in this tab after the read began.
- One label everywhere (QA #87 v6): anything kept only on this phone (the customer's own unsent messages, a phone-only booking, a restored or locally added rating, photos and description) is labelled exactly "Saved on this phone only · not synced". Nothing local-only is shown as delivered or synced. With Supabase configured, ratings, photos and descriptions are never sent to the backend, so they always carry the label.
- Per-account device data (QA #87 v6, founder decision on F2): `haven_account_device_data` = `{__v:1, data:{<account id, lower case>:{jobs:[...], notifications:[...]}}}`.
  - On sign-out, an account switch, or a load by another account, the owner's stored cache and job notifications are moved (not copied) into that account's bucket and the visible UI and in-memory state are cleared at once. Nothing is shown to another account.
  - Per job (backend-linked entries only), only these fields are stored: `backendJobId`, the local `id`, `addressText`/`addressLabel` (only a real street address, at least three comma-separated parts; never the city fallback such as "San Francisco, CA"), the customer's own messages (`f:"cu"` only), `photos`, `desc`, `rated`/`stars`/`reviewTxt`/`hireAgain`, `tpId`/`reqWindow`, `cancelStatus`/`cancellationRequestedAt`.
  - Notifications: the job notifications (those with a `jobId`) as they were, tagged `accountBackendJobId` or `accountLocalJobId`. Device notices with no job stay in `haven_notifications` and are not per account.
  - No card or payment details, tip fields, auth tokens or secrets are stored per account (asserted by a test).
  - When the same account signs back in, its entries are restored onto the matching backend rows of its own read (same claim-by-backend-id rules as the master set-aside, empty fields only) and its notifications return pointing at those jobs. They are released from the bucket only after the account's own store has been saved with them.
  - Never expired or auto-deleted. Only Reset Prototype Data clears it (in `PERSISTED_KEYS`).
  - Low storage: the move is all or nothing. If a write is refused, every key is put back exactly as it was, nothing jobs-related is saved that session, the account still sees its data from memory, and the next load retries.
- Phone-only booking (no backend id): never deleted. With Supabase configured, Slice 5 already saves a job only after its backend create lands, so these come only from older builds or the unconfigured preview. At app load each one is copied into `haven_jobs_local_only`:
  - from an owned cache, under that account (`owners[<account id>]`), minus any field matching `/payment|card|token|secret|password|auth|^tip/i`. It is shown to that account only, after its read lands, labelled "Saved on this phone only · not synced", with nothing a Pro or Haven would have done (no pro, no progress, no completion, no rating of a pro, no tip, no scripted replies, no cancel button).
  - Never shown as live (QA #87 v7 (b), founder decision): phone-only bookings are not counted in All / Active / Done and sit in their own section under the list, "On this phone (n)" (dashed cards, "Not scheduled · $price", the label chip). Their screen has the header "Not sent" (never "Pending"), a still 📱 icon (no pulse), "When: Not scheduled" and no recomputed time window, and keeps the line "This booking never reached Haven or a Pro…".
  - At sign-out the booking itself is kept; its payment and tip fields are wiped (QA #87 v7 (c), pinned by a test).
  - Its notifications survive any number of sign-out / sign-in cycles (QA #87 v7 (1)): a restored notification keeps the booking's stored id (`localSourceJobId`), and the account's phone-only bucket counts as a link when it is stashed again, so it returns to its owner every time and never reaches another account. The shown copy never takes the id of a job the account read builds (that id is the posting time), so the notification always points at the phone-only booking.
  - from an ownerless (master) store, under `ownerless`. Phone-only bookings in the old master cache with no recorded owner are kept set aside, hidden from every account and never deleted. They can't be shown until ownership can be proven.
  - An identical entry is not added twice. Only Reset Prototype Data clears the key (it is in `PERSISTED_KEYS`).
  - If the write is refused, nothing jobs-related is saved that session (the stored cache stays byte-identical) and the next load tries again.
- Full storage, same session (QA #87 v7 (3)): when the move is refused, the cache stays in storage untouched and marked with its owner. If that same account signs back in during the session, its details, notifications and phone-only bookings are read (read only, nothing written) from that cache. Another account never gets this view.
- Sign-out / switch also clears the previous account's last read from memory (`legacyReadRef`, QA #87 v7 (2)).
- Alerts left by 16b3257 / 91ed12d (QA #87 v7 (5)): at load, a job notification in `haven_notifications` whose job is in neither the cache nor the owner's phone-only bucket (another account's alert, or one whose job is gone) is moved to `haven_notifications_unowned_legacy` (tagged with the backend id when the master set-aside entry with that local id proves it), never deleted, and shown only to an account whose own read returns that job. If the move is refused, those alerts stay in storage untouched and are hidden for the session.
- Saved addresses / My Home per account (QA #87 v7 (a), founder decision):
  - `haven_addresses` + `haven_addresses_owner` = the signed-in account's list; `haven_account_addresses` = `{__v:1, data:{<account id, lower case>:[...]}}` keeps every other account's list while it is signed out. Keys are the account id only (no email, no token).
  - On sign-out or a switch the previous list moves to its bucket and leaves the screen and memory at once; the next account's own list comes back.
  - The shared copy saved by earlier builds has no provable owner. It is set aside unchanged in `haven_addresses_unowned_legacy`, hidden from every account and never deleted (only Reset clears it). **Single-user phones re-enter their addresses once after the upgrade.** No attribution is attempted.
  - Writes go copy first, removal last, so a refused write never loses a list: the session then keeps addresses in memory only and saves nothing, and the next load retries.
  - All three keys are in `PERSISTED_KEYS`. The booking draft (`haven_draft`) is unchanged and still device-wide.
- Owner key refused by storage (QA #87 v5 F3): the owner is kept in memory for that session, so Bookings shows this account's backend read (no false "No bookings yet"). Nothing jobs-related is saved that session; the next load writes the owner again.
- Scripted Pro replies: replies scripted into the chat by builds before Phase 1B A2 (`f:"pro"`) were never from a real Pro. While customer messaging is not connected (`CUSTOMER_MESSAGING_CONNECTED=false`), the chat shows only the customer's own messages; scripted replies stay in storage, hidden.
- Strict source of truth: cached jobs are shown (Bookings, status, history, receipts) only after this account's read has landed. Until then Bookings says "Loading your bookings…"; after a failed read it shows ONLY "Couldn't load your bookings. Retry", with no cached or local entries, and Retry re-reads. The cache stays in storage (it is not deleted by a failed read). A job whose backend create landed in this tab is shown even before the read.
- The account-switch / sign-out check runs only after the auth session has finished loading.
- Upgrade from master (QA #87 v3/v4): master stores have no `haven_jobs_owner`. On the first load of this build (Supabase configured, no owner), the store is set aside before anything reads it, and nothing in the set-aside keys is ever displayed by itself.
  - Jobs go to `haven_jobs_unowned_legacy`: backend-linked entries only, device-only fields only. Those fields are the street address (the link to a saved address; the backend stores only `city_label`), messages, photos, description, rating/review, time window, a pending cancel request, and the local job id.
  - Notifications go to `haven_notifications_unowned_legacy`, each tagged with its job's backend id when the cache knew it.
  - The ownerless keys are removed first, so the copies never need more storage than they used. **Nothing is dropped to fit.** If a set-aside write still fails, every key is put back exactly as it was. The old store then stays in storage untouched and hidden: jobs and notifications are not shown or saved this session, and the owner is kept in memory only. The next load tries again.
  - A job entry is restored only onto the backend row with the same id in a signed-in account's own read (`customer_id = auth.uid()`). It fills only fields that are still empty. The street address is restored only while the row's `address_snapshot` is empty and the job shows only the city. Backend values (status, pricing, pro, timestamps, preferences, materials) always come from the backend.
  - **Messages:** only the customer's own (`f:"cu"`) are restored. Replies scripted into the chat by builds before Phase 1B A2 (`f:"pro"`, `PRO_REPLIES`) were never from a real Pro. They stay in the set-aside key untouched and are never shown.
  - A restored rating, photos and description are labelled "Saved on this phone only · not synced".
  - A set-aside notification is restored only when its job (by backend id, or by the restored local id) is in this account's read and cache, pointing at that job. A notification with no job link stays set aside and is never shown.
  - Entries are released only after that account's owned store has been saved with them. Unclaimed entries and notifications (e.g. another person's on a shared device) stay, are never shown, and are not cleared on sign-out or by any time limit. Reset Prototype Data clears them.
  - A store owned by another account is never put in the master set-aside; it goes to that account's per-account store.
  - The MAP-03 sample cleanup also counts set-aside jobs, so a sample address with a master job at it is kept until that job is claimed.
- No Supabase config (local preview / test harness): unchanged.

Receipts and the Booking Summary keep using the backend totals (#45 / #50 / #51); the account read fills the same receipt map.

## Not changed

RLS, grants, auth, job lifecycle, pricing, location rules, payment records, tips, receipt fee display, support wording, the Bookings card total, Messages / Posted header totals, visual polish, seeds (Jane Doe).
