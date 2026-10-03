# Slice 5 — Fail-closed job mutations

Founder note. This slice stops the local screen from treating a failed server job write as success. It does **not** change job lifecycle statuses, pricing, materials, tips, inspection fees, or the 20/80 labor split. It does **not** revoke anon grants, lock down anonymous SQL, or scope reads. Existing rows stay as they are.

A signed-in Customer or Pro still sends that user's auth id and the user access token as `Authorization`. `apikey` stays the anon key. A session still never falls back to a demo id. Slice 4 signed-out stops stay in place.

## What to paste

Nothing. No migration in this slice.

`0016`–`0018` are unchanged. Fail-closed is enforced in the Customer and Pro clients: a mutation waits for a landed write before saving success or leaving the screen.

## What fail-closed means

When Supabase is configured:

- A job create or update must land on the server before the app saves a success state or navigates away.
- Landed means a 2xx response that returns the written row (create returns an id; updates use `Prefer: return=representation` and require a matching row). Network errors, non-2xx, missing id, and empty / 0-row updates are failures.
- On failure the screen stays where it was and shows the existing failed-sync notice pattern (for example "Couldn't post the job — try again" or "Couldn't sync approval — try again").
- Signed-out writes still stop and do not send demo ids or the anon key as Bearer.

When Supabase is **not** configured, the local preview path may still advance and must not call the jobs API. That path is unchanged.

## How to tell a landed write from a stopped one

Leave `0016`–`0018` applied. Customer and Pro apps still have `haven_supabase_url` and `haven_supabase_anon_key` (anon key only, in `apikey`).

Signed-in Customer, post a job:

- A new `public.jobs` row appears with `customer_id` = that Auth user id.
- The app opens Posted only after that create returns an id.
- If the create is refused, times out, or returns no id, Posted does not open and the draft stays on screen with the failed-sync notice.

Signed-in Customer, cancel or materials approve/decline:

- The jobs row's `status` changes on the server.
- The local job status changes only after the PATCH returns a matching row.
- A 2xx with zero rows, or any failed PATCH, leaves the screen on the prior status and shows the failed-sync notice.

Signed-in Pro, claim / arrive / diagnosing / `in_progress` / materials request / complete / decline terminals:

- The jobs row changes on the server first.
- Local active-job status, history, and earnings move only after that write lands.
- A failed or empty write keeps the prior screen and shows the existing toast ("Couldn't … Try again.").

Signed-out Customer or Pro:

- No jobs write is sent.
- The screen does not advance for a configured backend.

Unconfigured local preview (no Supabase keys):

- The jobs API is not called.
- Local SIM screens may still move.

## Explicitly not in this slice

- No SQL and no change to `0018`
- No anon grant revoke and no anonymous write lockdown
- No read or poll scoping
- No change to who may set which status
- No rewrite of existing rows
- No removal of the unconfigured local preview path
