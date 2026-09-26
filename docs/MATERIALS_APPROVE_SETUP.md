# Materials Approve — Customer PATCH enablement (Chunk 4)

This note describes the minimal SQL to allow a demo customer to approve materials by PATCHing a job from `materials_requested` → `materials_approved` in Supabase/Postgres. Applies cleanly on top of existing Chunk 3.

## Files and apply order

1. `supabase/migrations/0008_chunk4_materials_approve.sql`

If you have not yet applied earlier chunks, follow the existing order through `0007` first (see `docs/CHUNK3_SETUP.md`), then apply `0008`.

## What `0008` does

- Adds optional lightweight columns to `public.jobs` (idempotent):
  - `materials_items jsonb not null default '[]'`
  - `materials_estimate_cents int not null default 0 check (>=0)`
  - `materials_requested_at timestamptz null`
- Enables RLS (safe repeat), then defines a narrow UPDATE policy:
  - Allow transition only when the CURRENT row is `status='materials_requested'` and `pro_id is not null`
  - WITH CHECK the NEW row must be `status='materials_approved'` and `pro_id is not null`
- No new GRANTs are required (Chunk 3 `0005` already grants UPDATE on `public.jobs`).
- SELECT for `materials_approved` is already covered by `0007_chunk3_select_assigned.sql`.

Policy created:
```sql
drop policy if exists jobs_update_materials_requested_to_approved on public.jobs;
create policy jobs_update_materials_requested_to_approved
  on public.jobs
  for update
  to anon, authenticated
  using (status = 'materials_requested' and pro_id is not null)
  with check (status = 'materials_approved' and pro_id is not null);
```

## Client behavior

Customer app dual-writes approval when configured (same localStorage keys as prior chunks):
- Keys: `haven_supabase_url`, `haven_supabase_anon_key`
- Endpoint: `PATCH /rest/v1/jobs?id=eq.<backendJobId>`
- Headers: `apikey`, `Authorization: Bearer <anon_key>`, `Prefer: return=minimal`
- Body: `{ "status": "materials_approved" }`

Soft-fails: if the PATCH cannot be performed (e.g., missing `backendJobId` or RLS mismatch), the app proceeds locally and surfaces a non-blocking toast. Decline terminals remain unchanged from Chunk 3 (`inspection_completed` at $45 for diagnosis; `materials_declined` at $30 for standard; Haven $0 on materials and fees).

Note: Pro-side (#11) already polls `materials_approved`; no Pro edits are included here. If Pro needs a tiny fix during testing, coordinate separately. 

