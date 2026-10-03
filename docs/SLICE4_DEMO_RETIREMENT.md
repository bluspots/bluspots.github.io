# Slice 4 — Demo write retirement

Founder note. This slice stops signed-out job writes from using the demo ids. It does **not** change job lifecycle statuses, pricing, materials, tips, inspection fees, or the 20/80 labor split. It does **not** revoke anon grants, lock down anonymous SQL, scope reads, or fail-closed every mutation. Existing rows stay as they are.

A signed-in Customer or Pro still sends that user's auth id and the user access token as `Authorization`. `apikey` stays the anon key. A session still never falls back to a demo id.

## What to paste

In the Supabase dashboard → SQL Editor, paste and run **after** `0017`:

`supabase/migrations/0018_retire_demo_pro_claim.sql`

Do not run it from the app or from CI. Re-running the file is safe (`CREATE OR REPLACE`). It does not edit `0002`–`0017`.

What it changes: `public.pro_claim_job` no longer uses `coalesce(auth.uid(), <demo pro>)`. If `auth.uid()` is null, the function raises `claim requires auth.uid()` (`28000`) and does not update the row. A claim that has `auth.uid()` still sets `pro_id` to that user, `status` to `en_route`, and `accepted_at` to now, and only when the stored row is `posted` with `pro_id` null. Execute stays granted to `anon` and `authenticated`. The function rejects the missing uid; this file does not revoke the anon grant.

## How to tell a signed-in write from a stopped signed-out write

Leave `0016` and `0017` applied, then paste `0018`. Customer and Pro apps still have `haven_supabase_url` and `haven_supabase_anon_key` (anon key only, in `apikey`).

Signed-in Customer, post a job:

- `public.jobs.customer_id` equals that Auth user id, not `11111111-1111-4111-8111-111111111111`.
- `Authorization` bearer is the user access token. `apikey` is still the anon key.
- Cancel and materials updates on that job still go out on the user bearer. They do not stamp the demo customer id.

Signed-out Customer, post or update a job:

- The shared write does not happen. No `POST` or `PATCH` to `/rest/v1/jobs`.
- The request does not send `customer_id` `11111111-1111-4111-8111-111111111111`.
- The request does not send `Authorization: Bearer <anon key>` as the user identity.
- While Supabase is configured, create, cancel, and materials decline stay on the current screen and show that the write did not land. With no Supabase config, the local prototype can still move and does not call the jobs API.

Signed-in Pro, claim a posted unassigned job:

- The claim sets `pro_id` to that Auth user id, not `22222222-2222-4222-8222-222222222222`, and `status` to `en_route`.
- `Authorization` bearer is the user access token. `apikey` is still the anon key.
- Later Pro updates (arrived, and the existing later statuses) still use that same auth uid and user bearer.

Signed-out Pro, claim or later job write:

- The write does not happen, and the screen does not advance. The client does not call `pro_claim_job` and does not `PATCH` the job. Materials request and decline terminals are included.
- The request does not send `pro_id` `22222222-2222-4222-8222-222222222222`.
- Calling `pro_claim_job` directly with no `auth.uid()` (anon key as Bearer) fails and leaves `pro_id` null. It does not assign the demo pro.

The posted-job board read still uses the anon key. That read is not a job write and does not send a demo id.

Optional read-only check. The function body should mention `auth.uid()` and should not contain the demo pro uuid:

```sql
select position('22222222-2222-4222-8222-222222222222' in pg_get_functiondef('public.pro_claim_job(uuid)'::regprocedure)) as demo_pro_at,
       position('auth.uid()' in pg_get_functiondef('public.pro_claim_job(uuid)'::regprocedure)) as auth_uid_at;
```

`demo_pro_at` should be `0`. `auth_uid_at` should be greater than `0`.

## Explicitly not in this slice

- No anon grant revoke and no anonymous write lockdown
- No read or poll scoping
- No fail-closed rule on every mutation
- No change to who may set which status
- No rewrite of existing rows
- No deletion of Slice 1–3 profile, auth, or ownership code
- No Repair-category work
