# Slice 2 — Signed-in Customer job writes

Slice 4 is the current write rule. With no access token, Customer job creates and updates stop. They do not send `DEMO_CUSTOMER_ID` and do not send the anon key as Bearer. While Supabase is configured, create, cancel, and materials decline do not advance the screen. `DEMO_CUSTOMER_ID` remains only so a signed-in write can refuse it. The rest of this page is what Slice 2 shipped.


Founder note. This slice binds Customer job writes to the Supabase Auth session from Slice 1. It does **not** change job lifecycle, pricing, materials, tips, inspection fees, or the 20/80 labor split. It does **not** add ownership RLS, retire `DEMO_CUSTOMER_ID`, lock down anonymous writes, or require Auth for every mutation.

## What changed

When `haven_auth_access_token` is present:

- Job create sets `customer_id` to that user's id (`haven_auth_user_id`, or the access token `sub` if the stored id is missing).
- Every Customer job request this app already sends (`POST` create, `PATCH` cancel / materials approve / materials decline, and the existing job read) sends `Authorization: Bearer <access token>`.
- `apikey` stays `haven_supabase_anon_key`. Supabase rejects a user JWT in `apikey`.

When there was **no** access token, Slice 2 left the demo path in place (no longer current):

- `customer_id` was `11111111-1111-4111-8111-111111111111` (`DEMO_CUSTOMER_ID`).
- `Authorization` was `Bearer <anon key>`.

Slice 4 stops that path. A missing session does not send either of those.

A real session never falls back to `DEMO_CUSTOMER_ID`. If a token is present but no user id can be resolved, the canonical create is skipped and the demo id is not written. Status updates that do not send `customer_id` still go out on the user bearer. `haven_prototype_anon_mode` does not choose this identity. The switch still only records later intent.

`DEMO_CUSTOMER_ID` stays in the Customer app only so a signed-in write can refuse it. Signed-out job writes do not send it.

## SQL

No migration in this slice. Nothing to paste into the SQL editor.

Checked `supabase/migrations/0002` through `0015`. Every `public.jobs` policy is `to anon, authenticated`. Grants are the same pair:

- `0002` / `0003`: `select`, `insert` on `public.jobs`
- `0005`: `update` on `public.jobs`
- `0006`–`0010`, `0012`–`0015`: update and select policies for the same status transitions anon already has

None of those policies check `auth.uid()` or restrict the role to `anon` only. A signed-in JWT (`role: authenticated`) can do the same Customer job writes anon can, including insert `posted` and the customer status patches this app sends. Ownership checks stay a later slice. `0016` is unchanged.

Optional live check (read-only). You should see `{anon,authenticated}` on the jobs policies:

```sql
select policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename = 'jobs'
order by policyname;
```

If a live policy is anon-only, stop and say so. Do not invent a tighter policy in this slice.

## How to check

1. Leave Slice 1 applied (`0016`). Do not run new SQL.
2. Customer app still has `haven_supabase_url` and `haven_supabase_anon_key` (anon key only).
3. Sign in. Post a job.
   - `public.jobs.customer_id` equals that Auth user id, not `11111111-1111-4111-8111-111111111111`.
   - The request `Authorization` bearer is the user access token.
   - `apikey` is still the anon key.
   - `status` is `posted`. Labor cents, `margin_rate_bps = 2000`, tips, materials, and inspection fee match the same booking as before.
4. Sign out. Post another job. This is the Slice 4 check, not the Slice 2 demo write.
   - No jobs row is created.
   - The app does not send `DEMO_CUSTOMER_ID` and does not send the anon key as Bearer.
   - The screen does not open Posted.
5. Cancel, materials approve, and materials decline still send the same status values. While signed in, those PATCH calls use the user bearer.

## Explicitly not in this slice

- No ownership RLS (`auth.uid() = customer_id`)
- No deletion of `DEMO_CUSTOMER_ID`
- No anon write lockdown
- No fail-closed rule on every mutation
- No change to who may set which status
- No Pro app changes
