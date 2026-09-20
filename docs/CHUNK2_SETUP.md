## Haven CHUNK 2 — Customer → Canonical (Supabase) setup

Purpose: allow the Customer app to dual-write a canonical `jobs` row to a shared Supabase/Postgres backend when a customer posts a job. This is a prototype: no real auth yet; RLS policies are intentionally narrow and will be tightened later.

What this adds in this repo:
- SQL migration enabling RLS and prototype policies: `supabase/migrations/0002_chunk2_rls.sql`
- Thin client dual-write from the Customer app (raw `fetch` to Supabase REST)
- Minimal docs and setup notes (this file)

Prereqs:
- A fresh Supabase project (no secrets committed to git)

Steps:
1) Apply schema migrations
   - In Supabase dashboard → SQL Editor:
     - Run the contents of `supabase/migrations/0001_init.sql`
     - Then run the contents of `supabase/migrations/0002_chunk2_rls.sql`
     - Finally run `supabase/migrations/0003_chunk2_grants.sql` (privilege fix)
       - Grants: `grant select, insert on public.jobs to anon, authenticated;`
   - Confirm tables and RLS:
     - `public.jobs` exists with RLS enabled
     - Policies allow INSERT only when `status='posted'` and `pro_id is null`, and SELECT of rows where `status='posted'`

2) Configure the Customer app (in your browser only)
   - Open the app (served as a static page), then set two localStorage keys:

```js
// In the browser console, replace the example URL/key with your project's
// values from Supabase settings. Do NOT paste service role keys here.
localStorage.setItem('haven_supabase_url', 'https://YOUR-PROJECT-REF.supabase.co');
localStorage.setItem('haven_supabase_anon_key', 'eyJhbGciOi...<anon-key>...');
```

   - Keys:
     - `haven_supabase_url`: your Supabase project URL root (no trailing slash)
     - `haven_supabase_anon_key`: your project's public anon key
   - Safety: if either key is missing, the dual-write is a no-op and the app behaves exactly as today.

3) Post a job and verify the row
   - From the Customer app, post any job
   - Open Supabase → Table Editor → `public.jobs`
   - You should see a new row with:
     - `status = posted`
     - `pro_id = null`
     - `fixed_customer_labor_price_cents` and `fixed_pro_labor_payout_cents` populated
     - `margin_rate_bps = 2000`
     - `city_label` set (derived from the selected address)
     - `address_snapshot = null` (by design at post time)
     - `customer_preferences_snapshot` and `payment_snapshot` populated
   - The Customer app stores the returned UUID on the local job as `backendJobId` (visible only in dev tools).

Demo customer
- Until auth exists, a fixed demo `customer_id` is used on insert:
  - `11111111-1111-4111-8111-111111111111`

Notes and guardrails
- No secrets are committed to this repo.
- Pricing economics are locked: Haven keeps 20% margin inside the listed labor price; Pro labor payout is 80% of the listed labor price (`margin_rate_bps=2000`). Materials, tips, and inspection are $0 for Haven in this slice (not used in create path).
- Updates that assign a pro or change status beyond `posted` are intentionally not allowed by policies in this chunk.
- Future slices will add authenticated ownership checks and additional read/write paths (materials, tips, assignment, status events).

Remediation for existing projects
- If you previously applied only `0001` and `0002` and see Postgres error `42501` (insufficient privilege) when calling Supabase REST, apply `supabase/migrations/0003_chunk2_grants.sql` to grant the required table privileges to `anon` and `authenticated`.

