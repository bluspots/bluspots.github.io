# Pro → Canonical Mapping

Source: `_pro/home_services_pro_app.jsx` (Pro) · Target: `HAVEN_SHARED_BACKEND_CONTRACT.md`

Legend: ✅ direct map · 🔁 transform/denormalize · ❌ not present today · 🧭 backend‑generated/owned

Job identity
- Pro `id` (short string like `j1`) → 🧭 Canonical `job.id` (uuid)

Parties
- Pro account (signed‑in pro) → 🧭 `pro_id` (uuid from auth)
- Customer `customerName` (display only) → stays display; not a foreign key; use `customer_id` for linkage, keep `customerName` in receipts/messages UI only

Service
- `category` → `category` (✅)
- `title` → `title` (✅)
- `requiresDiagnosis` (present in historical dataset; live feed uses lookup) → `requires_diagnosis` (🔁 set at job creation)

Location
- `city` → `city_label` (✅)
- `lat`/`lng` → `lat`/`lng` (✅; optional)
- Full address ❌ → `address_snapshot` (post‑accept; backend supplies)

Pricing snapshot (labor)
- `payout` (fixed pro labor payout, shown pre‑accept) → `fixed_pro_labor_payout_cents` (🔁 cents)
- Customer labor price ❌ → `fixed_customer_labor_price_cents` (🧭 computed from margin or copied from Customer at create)
- `inspectionFee` → `inspection_fee_cents` (🔁 cents)
- `emergency` → `emergency` (✅)

Lifecycle and timestamps
- Active job transitions (en_route…complete/inspection_completed) → `status` (✅) + `job_status_events` (append each step)
- Only `completedAt` survives in history today → backend keeps full timeline; map available timestamps if present
- `actualDurationMin` → derive in backend at completion (🔁 from timestamps); Pro field remains a display

Materials
- `pendingMaterialsRequest {items,totalCost}` → `materials_requests` (pending/approved)
- `materialsReimbursed` (credited on receipt) → roll up to job on completion
- `materialsReceiptPhoto` → `job_media(kind=materials_receipt)`

Messaging
- Pro per‑job chat (local) → `job_messages` (backend)

Photos/notes
- `beforePhoto`/`afterPhoto` → `job_media(kind=pro_before|pro_after)`
- `jobNotes` → `job_notes`

Tips
- `tipAmount`,`tipStatus` on completion (simulated) → `tips` ledger (backend)

Earnings
- Job Earnings Statement UI → `earnings_statements` (immutable backend record) with `financial_snapshot {gross,materials,tip,net,status}`

Constraints
- “One active job at a time” (UI gate) → backend partial unique index on active statuses per `pro_id`

