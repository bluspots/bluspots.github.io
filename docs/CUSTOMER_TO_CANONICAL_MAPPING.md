# Customer → Canonical Mapping

Source: `home_services_app.jsx` (Customer) · Target: `HAVEN_SHARED_BACKEND_CONTRACT.md`

Legend: ✅ direct map · 🔁 transform/denormalize · ❌ not present today · 🧭 backend‑generated/owned

Job identity
- Customer `id` (timestamp number) → 🧭 Canonical `job.id` (uuid). Keep Customer’s local id only as a client‑side handle until backend issues UUID.

Parties
- Customer (implicit, signed‑in user — no auth backend) → 🧭 `customer_id` (uuid from auth)
- Pro `pro` (local object assigned when simulating accept) → Canonical `pro_id` (uuid) — 🔁 map by backend assignment; Customer doesn’t own this field

Service
- `taskId` or `custom {title,category,budget}` → Canonical `category`, `title`; 🔁 for catalog jobs, denormalize the task name into `title`
- `requiresDiagnosis` ✅ → Canonical `requires_diagnosis` (computed at create from catalog rules)

Location
- `addressText` → Canonical `address_snapshot` (post‑accept only)
- `addressLabel` → Canonical `property_label` (fits within snapshot or a future `property_id`)
- Coordinates ❌ → Canonical `lat`/`lng` (optional; backend may geocode)
- `city_label` 🔁 derive from address or customer’s saved city

Pricing snapshot (labor)
- Catalog price or `custom.price` → `fixed_customer_labor_price_cents` (🔁 cents)
- Pro payout ❌ → `fixed_pro_labor_payout_cents` (🧭 computed from margin rule at create time)
- `lockedPrice` → aligns with `fixed_customer_labor_price_cents` (use if present)
- `emergency` + `$35` → `emergency` + `emergency_fee_cents=3500`
- Inspection fee ❌ → `inspection_fee_cents` (0 unless diagnosis path)

Lifecycle
- `status` (posted/en_route/arrived/diagnosing/materials_requested/materials_approved/in_progress/complete/inspection_completed/materials_declined/cancelled) → `status` (enum)
- `acceptedAt`,`completedAt`,`cancellationRequestedAt` → `job_status_events` + rollups `accepted_at`,`completed_at`

Customer snapshots
- `jobPreferences` → `customer_preferences_snapshot` (jsonb)
- `paymentBrand`,`paymentLast4` → `payment_snapshot` `{brand,last4}`
- `photos[]` at booking → `job_media(kind=customer_booking, url)`

Messaging
- `msgs[]` (local only) → `job_messages` (backend)

Materials/diagnosis
- Present: `job.materials[]` additively rendered on receipt; Customer triggers approve/decline transitions → `materials_requests` / `materials_receipts` tables (backend); reimbursement occurs on receipt submission

Tips
- `tipAmount`,`tipStatus`,`tippedAt` → `tips` rows; roll up to job at completion

Receipts
- Generated from job → stays generated; backend renders from canonical job + rollups

