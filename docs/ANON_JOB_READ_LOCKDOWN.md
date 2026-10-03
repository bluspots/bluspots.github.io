# Anonymous job-read lockdown (account required)

Release blocker. Draft only. Founder pastes SQL. Do not apply from the app.

## Goal

Haven Customer and Haven Pro both require an account. There is **no** signed-out browsing and **no** anonymous marketplace. A signed-out or crafted anonymous request must not `SELECT` `public.jobs` at all.

Signed-out users may only reach account creation, sign-in, and necessary legal/support links. They must not read jobs, browse a marketplace, create jobs, claim jobs, or open authenticated app screens.

## Paste after 0019

`supabase/migrations/0020_anon_job_read_lockdown.sql`

Exact statement:

```sql
revoke select on public.jobs from anon;
```

No public view. No RPC. No `posted_jobs_public`. Authenticated SELECT on `public.jobs` is unchanged. Slice 7 write revokes are unchanged.

## App

- **Customer**: signed-out UI is auth-only (create account / sign in / help). No home marketplace, bookings, or jobs API calls.
- **Pro**: signed-out UI stays on account creation / sign-in. Posted board does not call the jobs API when signed out. Signed-in board and Auth Slice 6 scoped reads stay on `public.jobs` with the user access token.
- Unconfigured local preview does not open a signed-out marketplace.

## Explicitly not changed

Authenticated ownership policies, lifecycle, pricing, 20/80, materials, tips, categories, jobs `8661d035` / `9ac5bda1`, Pro profile rows.
