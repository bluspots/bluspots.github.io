# Phase 1B A1 — Customer connects to Supabase automatically

Founder decision (2026-10-08): the Customer and Pro apps connect to the
existing Supabase project on a fresh browser using public client config only.
No dev-facing connection controls. On failure, a clear error with Retry. Never
demo mode, never a local or replacement account or job. The account-required
gate stays.

## Where the config lives

`supabase_public_config.js` is the one place:

- `HAVEN_PUBLIC_SUPABASE_URL` — `https://tfykhsowsjffrrziefco.supabase.co`
- `HAVEN_PUBLIC_SUPABASE_ANON_KEY` — the project's public **anon** key (JWT
  role claim `anon`). Public by design, like the Mapbox `pk.` token in
  `geocode.js`. Auth and RLS enforce access.

`build.sh` concatenates it before `backend_adapter.js`. `getSupabaseConfig()`
returns it by default and refuses any key that is not an anon JWT or an
`sb_publishable_` key, so a `service_role` / `sb_secret_` key can never be used
from the client. Never put a secret key in this file.

The old `localStorage` keys `haven_supabase_url` / `haven_supabase_anon_key`
are no longer read. Setup steps in older docs (CHUNK2_SETUP, SLICE1_AUTH_PROFILES,
etc.) that set them are superseded. The `haven_prototype_anon_mode` flag and its
Settings switch are removed.

## Boot sequence (`havenConnectBackend` in `auth_session.js`)

1. Config and the Supabase Auth client (CDN `supabase-js`) must exist.
2. `GET {url}/auth/v1/health` with the anon key must answer 2xx.
3. `auth.getSession()` restores any stored session. A stored session is checked
   with the server (`auth.getUser()`). A session the server rejects (401/403) is
   signed out locally and the gate shows. A network failure is a connection error.

Until this finishes the app shows **Connecting to Haven…**. The marketplace,
bookings, receipts, and the bottom nav render only for a confirmed session.

## Error copy (matches the Pro app)

- Title: **Can't connect to Haven**
- Body: **We couldn't reach Haven. Check your internet connection, then tap Retry.**
- Button: **Retry** (shows **Retrying…**, disabled, while the attempt runs)
- Also offered: **Help & Support**
- Sign-in / create-account network failures show: *We couldn't reach Haven.
  Check your internet connection, then try again.*

## Removed fallback paths

- `getSupabaseConfig()` returning `null` on a fresh browser (localStorage-only).
- Post Job with no config saving a local-only job.
- Cancel, approve materials, decline materials advancing locally with no config
  or no backend job id.
- Trusting the localStorage session mirror on load before Auth confirms it.
- The edge-swipe back gesture revealing marketplace screens behind a
  signed-out screen.
- "Prototype anon mode" switch and `havenPrototypeAnonModeEnabled()`.

## Not changed

Auth ownership / RLS, job lifecycle, pricing, location / radius (Mapbox geocode
only on job create), DEMO PRO CONTROLS, and simulate-location panels. No SQL.
