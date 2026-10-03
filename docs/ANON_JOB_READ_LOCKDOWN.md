# Anonymous job-read lockdown

Release blocker. Draft only. Founder pastes SQL. Do not apply from the app.

## Goal

A signed-out or crafted anonymous request must not `SELECT` full `public.jobs` rows (customer_id, pro_id, tips, payment_snapshot brand/last4, lat/lng, private lifecycle). Anonymous callers may only browse eligible **posted + unclaimed** marketplace fields through `public.posted_jobs_public`.

## Paste after 0019

`supabase/migrations/0020_anon_job_read_lockdown.sql`

Exact statements:

```sql
create or replace view public.posted_jobs_public
with (security_invoker = false)
as
select
  id,
  category,
  title,
  requires_diagnosis,
  city_label,
  fixed_pro_labor_payout_cents,
  inspection_fee_cents,
  emergency,
  posted_at,
  status
from public.jobs
where status = 'posted'
  and pro_id is null;

revoke all on public.posted_jobs_public from public;
revoke all on public.posted_jobs_public from anon;
revoke all on public.posted_jobs_public from authenticated;
grant select on public.posted_jobs_public to anon;
grant select on public.posted_jobs_public to authenticated;

revoke select on public.jobs from anon;
```

## Public field list (why each is required)

| Column | Board UI need |
|---|---|
| `id` | Accept / claim target |
| `category` | Section grouping + eligibility |
| `title` | Card title |
| `requires_diagnosis` | Diagnosis badge + inspection line |
| `city_label` | State eligibility (`stateOf(city)`) |
| `fixed_pro_labor_payout_cents` | Labor payout shown on the card (`$job.payout`) — public marketplace figure, not tip/materials/payment metadata |
| `inspection_fee_cents` | “Inspection Visit: $X” on diagnosis cards |
| `emergency` | Emergency badge + filter |
| `posted_at` | “Posted … ago” age line |
| `status` | Defensive client filter (`posted` only) |

Eligible rows stay `status = posted` and `pro_id is null` (enforced in the view).

Not exposed: `customer_id`, `pro_id`, tips, `payment_snapshot`, lat/lng, customer price, materials, address_snapshot, private lifecycle statuses.

## App changes

- **Customer**: signed-out poll of linked jobs no longer calls `/rest/v1/jobs` (would fail after the revoke and must not pull private lifecycle). Signed-in scoped polls stay on `jobs` with the user token. Unconfigured local preview still does not call the jobs API.
- **Pro**: signed-out posted board must read `posted_jobs_public` (separate Pro draft). Signed-in board may keep reading `jobs` with the user token. **Paste this SQL before merging the Pro board client**, or the signed-out board view 404s.

## Explicitly not changed

Slice 7 write revokes, authenticated SELECT on `jobs`, authenticated policies, lifecycle, pricing, 20/80, materials, tips, inspection fee amounts, categories, jobs `8661d035` / `9ac5bda1`.
