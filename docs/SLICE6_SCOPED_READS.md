# Slice 6 — Scoped job reads

Founder note. This slice scopes Customer and Pro job polls to the signed-in user. It does **not** change job lifecycle statuses, pricing, materials, tips, inspection fees, or the 20/80 labor split. It does **not** revoke anon grants, lock down anonymous writes, or add SQL. Existing rows stay as they are.

A signed-in read sends that user's access token as `Authorization`. `apikey` stays the anon key. A session never falls back to a demo id. Slice 5 fail-closed writes stay in place.

## What to paste

Nothing. No migration in this slice.

`0002` already grants `select` on `public.jobs` to `anon` and `authenticated`. `jobs_select_posted` and `jobs_select_assigned_or_active` already allow both roles to read posted rows and assigned or later rows. `0017` restrictive policies are insert and update only. A signed-in Customer read filtered to `customer_id` = that user, and a signed-in Pro read of `status=posted` with `pro_id` null, are inside those policies. No new SELECT policy.

## What scoped reads mean

When Supabase is configured:

- Customer poll and rehydrate (`fetchCanonicalJobsByIds`) ask only for the locally linked job ids.
- Signed in, that read uses the user access token and `customer_id=eq.<that user>`. Rows for another customer are dropped. It does not read the whole jobs table.
- Signed out, that read of linked ids uses the anon key as Bearer and does not send `DEMO_CUSTOMER_ID`.
- Pro posted board (`fetchPostedJobsFromSupabase`) stays `status=eq.posted` and `pro_id=is.null`. Signed in, the bearer is the user access token. Signed out, the bearer stays the anon key. It does not query as `DEMO_PRO_ID`.
- Pro active rehydrate (`fetchActiveJobsFromSupabase`) stays `pro_id` = that pro and the user bearer. Signed out, it does not query.

When Supabase is **not** configured, the local preview path does not call the jobs API. That path is unchanged.

## How to tell a scoped read from an unscoped one

Leave `0016`–`0018` applied. Customer and Pro apps still have `haven_supabase_url` and `haven_supabase_anon_key` (anon key only, in `apikey`).

Signed-in Customer, Bookings / Posted / Tracking with a backend-linked job:

- The jobs GET includes `id=in.(<those ids>)` and `customer_id=eq.<auth user id>`.
- `Authorization` is `Bearer <access token>`. `apikey` is the anon key.
- The request does not omit `customer_id` and does not use `11111111-1111-4111-8111-111111111111`.

Signed-out Customer:

- A poll of a locally linked id, if sent, uses the anon bearer and does not include the demo customer id.
- Job writes still do not send.

Signed-in Pro, open jobs board:

- The jobs GET is still `status=eq.posted` and `pro_id=is.null`.
- `Authorization` is the user access token. `apikey` is the anon key.
- Active jobs still filter `pro_id` to that pro only.

Signed-out Pro:

- The posted board, if sent, uses the anon bearer and does not include `22222222-2222-4222-8222-222222222222`.
- Active rehydrate does not query.

## Explicitly not in this slice

- No SQL and no change to `0017` or `0018`
- No anon grant revoke and no anonymous write lockdown (Slice 7)
- No change to who may set which status
- No rewrite of existing rows
- No change to fail-closed writes
- No removal of the unconfigured local preview path
