# Slice 7 — Anonymous job-write lockdown

Founder note. This slice revokes anonymous **write** privileges on job tables and the claim RPC so a signed-out or crafted anon request cannot insert, update, delete, or claim a job. It does **not** change job lifecycle statuses, pricing, materials, tips, inspection fees, or the 20/80 labor split. It does **not** revoke anonymous SELECT. It does **not** change authenticated policies, role profiles, or signup. Existing rows stay as they are.

Signed-in Customer and Pro writes still use that user's auth id and the user access token as `Authorization`. `apikey` stays the anon key. A session still never falls back to a demo id. Slice 5 fail-closed and Slice 6 scoped reads stay in place.

The Customer and Pro apps already stop signed-out job writes in the client (Slices 4–5). This migration locks the database so a crafted REST call with only the anon key also cannot write.

## What to paste

In the Supabase dashboard → SQL Editor, paste and run **after** `0018`:

`supabase/migrations/0019_anon_write_lockdown.sql`

Do not run it from the app or from CI. Re-running the file is safe (`REVOKE` is idempotent). It does not edit `0002`–`0018`.

Exact statements:

```sql
revoke insert on public.jobs from anon;
revoke update on public.jobs from anon;
revoke insert on public.job_status_events from anon;
revoke execute on function public.pro_claim_job(uuid) from anon;
```

### Grants these undo

| REVOKE | Original GRANT | Migration |
|---|---|---|
| `REVOKE INSERT ON public.jobs FROM anon` | `grant select, insert on public.jobs to anon, authenticated;` | `0002_chunk2_rls.sql:39` and `0003_chunk2_grants.sql:4` (INSERT only; SELECT left) |
| `REVOKE UPDATE ON public.jobs FROM anon` | `grant update on public.jobs to anon, authenticated;` | `0005_chunk3_grants.sql:6` |
| `REVOKE INSERT ON public.job_status_events FROM anon` | `grant insert on public.job_status_events to anon, authenticated;` | `0005_chunk3_grants.sql:10` |
| `REVOKE EXECUTE ON FUNCTION public.pro_claim_job(uuid) FROM anon` | `grant execute on function public.pro_claim_job(uuid) to anon, authenticated;` | `0011_pro_claim_job.sql:40` and `0018_retire_demo_pro_claim.sql:50` |

No `DELETE` grant on `public.jobs` (or `job_status_events`) to `anon` appears in migrations, so none is revoked.

No grant to role `public` for these job writes was found after `0011`/`0018` already ran `revoke all on function public.pro_claim_job(uuid) from public`.

## Anon SELECT left in place

Keep these (do not revoke or drop):

- Table grant: `SELECT` on `public.jobs` to `anon` from `0002` / `0003` (`grant select, insert on public.jobs to anon, authenticated;` — only INSERT is revoked above).
- RLS policy `jobs_select_posted` (`0002_chunk2_rls.sql`) — `for select to anon, authenticated` where `status = 'posted'`.
- RLS policy `jobs_select_assigned_or_active` (`0007_chunk3_select_assigned.sql`) — `for select to anon, authenticated`.

Signed-out Pro posted board still reads `status=posted` and `pro_id is null` with the anon key (Slice 6).

## How to tell lockdown landed

Leave `0016`–`0018` applied, then paste `0019`. Customer and Pro apps still have `haven_supabase_url` and `haven_supabase_anon_key` (anon key only, in `apikey`).

Crafted anon write (anon key as both `apikey` and `Authorization` Bearer, no user JWT):

- `POST /rest/v1/jobs` fails (privilege / 401/403), no new row.
- `PATCH /rest/v1/jobs?...` fails, row unchanged.
- `POST /rest/v1/rpc/pro_claim_job` fails, `pro_id` stays null.
- Optional audit `POST /rest/v1/job_status_events` fails.

Signed-in Customer create / cancel / materials, and signed-in Pro claim / lifecycle patches, still succeed with the user access token.

Signed-out Pro posted board GET still works with the anon key.

## Explicitly not in this slice

- No revoke of anon SELECT on `public.jobs`
- No change to authenticated grants or RLS policies (including policies that still list `anon`)
- No new SELECT policy
- No change to profiles / signup (`0016`)
- No change to ownership restrictive policies (`0017`)
- No change to `pro_claim_job` body (`0018` already requires `auth.uid()`)
- No app JS change (clients already fail closed for signed-out writes)
- No rewrite of existing rows, including job `8661d035`
- No lifecycle, pricing, materials, tips, inspection, or 20/80 changes
