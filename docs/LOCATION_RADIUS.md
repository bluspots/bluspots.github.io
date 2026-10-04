# Marketplace radius

Mapbox is the only geocoder, behind `havenGeocodeAddress` in `geocode.js`.

Customer: Mapbox runs only inside `postJob`, when a job is created. The service address is not edited on the job after that. The result is stored on the existing `jobs.lat` and `jobs.lng` columns. `address_snapshot` stays null until accept, as before. Marketplace load, job list, and claim do not call Mapbox.

Pro operating coordinates and the radius check live in the same database. See migration `supabase/migrations/0023_marketplace_radius.sql`.

## SQL the founder pastes

Paste the whole file in the Supabase SQL editor as the database owner, after 0021 and 0022. Do not apply it from the app.

What it does:

- Adds `profiles.operating_lat` and `profiles.operating_lng`. `home_city` stays a label.
- Radius stays `pro_workspace.travelRadius` (5, 10, 15, 25, 50 only).
- `jobs_posted_within_radius()` returns posted, unclaimed jobs inside that radius for `auth.uid()`. Missing coordinates or radius return no rows.
- `pro_claim_job` refuses an out-of-radius claim. Trigger `jobs_enforce_claim_radius` applies the same check to a direct update from posted to en_route.
- Drops the all-posted `jobs_select_posted` policy and replaces it with `jobs_select_own_posted` so a customer still sees their own posted job. Anon SELECT is not granted. No public view.

This file was not applied.

The Mapbox public token is not in git. GitHub push protection rejects the pk value. On each device set localStorage `haven_mapbox_public_token` to that pk token, next to the Supabase anon key. If it is missing, or does not start with `pk.`, geocoding fails closed and the job is not created.
