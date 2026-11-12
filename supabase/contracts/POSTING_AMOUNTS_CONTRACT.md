# Posting amounts: client contract (MIG-0031, refreshed 2026-11-12)

Status: **DRAFT, not applied, do not merge.** Backend: `supabase/migrations/0031_posting_amounts_validation.sql`.
Owner: Codey. Consumer: the Customer app's post-a-job insert (`postCanonicalJob`). Closes CoS audit
finding F2 (a Customer could choose the money columns when posting). It needs 0029 (#90), which closes
F1 (rewriting those columns after posting), and therefore 0025, 0026 and 0028 first.

## What the server enforces at INSERT (app and API callers: `anon`, `authenticated`)

| Column | Must be | Source |
|---|---|---|
| `margin_rate_bps` | `2000` | founder margin (item 9: future jobs only; a new rate is a new migration) |
| `fixed_pro_labor_payout_cents` | `floor(price × 8000 / 10000)` | the app's `Math.floor(price*80/100)` |
| `inspection_fee_cents` | `4500` if `requires_diagnosis`, else `0` | the hard-locked $45 Inspection Visit |
| `emergency_fee_cents` | `0` when `emergency` is false | — |
| `convenience_fee_cents`, `tip_amount_cents`, `materials_reimbursed_cents`, `materials_estimate_cents` | `0` | nothing is charged at posting |
| `materials_approved_cents` | null (0026 already forces it) | — |

Anything else is refused with SQLSTATE `42501` (PostgREST HTTP 403) and nothing is written. The message
names the rule, for example "The Pro payout must be 80% of the labor price". The Customer app's current
payload (`home_services_app.jsx` postJob) already sends exactly these values, so it needs no change. On a
403, show "Couldn't post the job — try again" (as today) and don't retry automatically.

Nothing is rewritten: the server checks the values the client sent. The SQL editor / database owner skips
the checks, for admin repair and imports. There is **no** `service_role` path: on production `service_role`
has no INSERT on `public.jobs` (CoS read-only probe 2026-11-12 4:31 PM ET), so a service-key insert is
refused with `permission denied for table jobs` (HTTP 403) before 0031 runs.

## Not enforced (OPEN for the founder; no amount is invented here)

1. **Labor price** (decision 5b, pending): no floor, ceiling or catalog-price check. A Customer can still
   post a catalog task at any price, including 0. Needs a server-side price table (catalog task id →
   price) and a documented custom-price path before the server can check it.
2. **Emergency fee amount** (decision 5a, pending): the app sends $35 when `emergency`, which is not
   approved. 0031 only refuses a fee on a non-emergency job.
3. **`requires_diagnosis`** (decision 5c, pending the category taxonomy): the client chooses it, so a
   Customer can still post a Plumbing job as "no diagnosis" and skip the $45. The app's rule today
   (Plumbing, Electrical, Appliance, HVAC, or Repair titled AC/heating/HVAC or task 53) could become a
   server rule once the taxonomy is fixed.
4. **Server-set instead of server-checked:** an alternative design lets the server compute payout,
   margin and fees from the price and ignore what the client sent. That would also stop a stale app build
   from being refused. 0031 keeps "check and refuse" so the Customer never sees amounts different from
   what the server stores. Founder choice.
5. Legacy diagnosis jobs posted with a $0 inspection fee are not changed (item 8: count them read-only
   first; the query is at the end of the migration).

## Tests (local Postgres 17 + local PostgREST only)

- `tests/mig_0031_posting_amounts_matrix.py`: 49 checks (49/49 PASS, t676). Covers:
  - app-shaped posts are accepted;
  - every off-contract amount is refused with 42501 and nothing is written;
  - the owner (SQL editor) bypass, and `service_role` refused under the production grants;
  - 0029 still locks amounts after posting;
  - the board and claim still work;
  - catalog, guards, CRLF, rollback and re-apply.
- `tests/mig_0031_mutants.py`: 13/13 mutants killed (t676).
- `tests/mig_0031_postgrest_smoke.py`: 10/10 PASS (t676) over HTTP POST /jobs.
