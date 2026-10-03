# Slice 3 — Signed-in job ownership

Founder note. This slice stops a signed-in session from writing someone else's job. It does **not** change job lifecycle statuses, pricing, materials, tips, inspection fees, or the 20/80 labor split. It does **not** retire the demo ids, lock down anonymous writes, scope reads, or fail-closed every mutation.

Customer and Pro clients already send the session user id and the user access token when a session exists (Slice 2). As shipped in Slice 3, no session still used the anon key and the demo ids. Slice 4 stops those signed-out writes. A session still never falls back to those demo ids.

## What to paste

In the Supabase dashboard → SQL Editor, paste and run **after** `0016`:

`supabase/migrations/0017_auth_job_ownership.sql`

Do not run it from the app or from CI. Re-running the file is safe (the two policies are dropped and recreated). It does not edit `0002`–`0016`.

What it adds, for role `authenticated` only:

- **Insert:** `customer_id` must be `auth.uid()`. The existing permissive rule still requires `status = posted` and `pro_id` null.
- **Update, customer:** the stored row's `customer_id` is `auth.uid()`, and the update does not change `pro_id`.
- **Update, claim:** the stored row is `posted` and `pro_id` is null (it cannot already equal the signer). The new row sets `pro_id` to `auth.uid()` and `status` to `en_route`. `customer_id` stays the same.
- **Update, already assigned:** the stored row's `pro_id` is `auth.uid()`, the new `pro_id` stays that user, and `customer_id` stays the same.

Status transitions stay on the existing permissive policies (`0006`–`0015`), including the `0015` restrictive predecessor check for `diagnosing` / `in_progress`. Those policies are `to anon, authenticated` and are OR'd with each other, so they cannot by themselves limit a signed-in user to their own rows. `0017` is restrictive and is AND-ed on top, for `authenticated` only.

Anon is not covered by `0017`. As of Slice 3, signed-out demo writes still passed the old policies. Slice 4 stops the clients from sending them. These policies are unchanged.

## How to tell a signed-in write from a signed-out demo write

Leave `0016` applied, then paste `0017`. Customer and Pro apps still have `haven_supabase_url` and `haven_supabase_anon_key` (anon key only, in `apikey`).

Signed-in Customer, post a job:

- `public.jobs.customer_id` equals that Auth user id, not `11111111-1111-4111-8111-111111111111`.
- `Authorization` bearer is the user access token. `apikey` is still the anon key.
- The same user can cancel or approve/decline materials on that job.
- A second signed-in user, using their own access token, cannot insert a row with the first user's `customer_id`, and cannot PATCH the first user's job. Postgres rejects that write (typically `42501`). It is not a silent empty update.

Signed-out Customer, post a job (Slice 3 behavior, retired by Slice 4):

- Slice 3 sent `customer_id` `11111111-1111-4111-8111-111111111111` with the anon key as Bearer, and `0017` did not apply to `anon`.
- Slice 4 does not send that write, and the screen does not advance.

Signed-in Pro, claim a posted unassigned job:

- The claim sets `pro_id` to that Auth user id, not `22222222-2222-4222-8222-222222222222`, and `status` to `en_route`.
- `Authorization` bearer is the user access token.
- A claim body that sets `pro_id` to anyone else is rejected.
- Later Pro updates (arrived, and the existing later statuses) succeed only when the stored `pro_id` is already that same user.
- A signed-in Pro cannot update a job assigned to someone else.

Signed-out Pro (Slice 3 behavior, retired by Slice 4):

- Slice 3 claimed with `pro_id` `22222222-2222-4222-8222-222222222222` and `Authorization: Bearer <anon key>`.
- Slice 4 does not send that claim, and the screen does not advance.

Optional read-only check. The two new policies should be `restrictive`, command `INSERT` or `UPDATE`, roles `{authenticated}`:

```sql
select policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'jobs'
  and policyname in (
    'jobs_restrict_auth_insert_own_customer',
    'jobs_restrict_auth_update_owner'
  )
order by policyname;
```

## Explicitly not in this slice

- No Slice 4
- No deletion of `DEMO_CUSTOMER_ID` or `DEMO_PRO_ID`
- No anon write lockdown
- No fail-closed rule on every mutation
- No read scoping (SELECT policies are unchanged)
- No change to who may set which status, beyond requiring the signed-in writer to be the customer or the assigned (or claiming) pro
- No Repair-category work
- No Pro app change (Slice 2 already sends the auth uid and the user bearer)
