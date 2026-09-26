# Haven Phase 3 — Modularization ORDER (FOUNDER-APPROVED)

**Status:** Founder-approved 2026-09-26 via Chief of Staff. Implementation follows this document.  
**Author:** Codey (senior eng)  
**Baseline:** Post Phase 2 — Customer `master`, Pro `main`  
**Scope ceiling:** Steps **0–8** only. **Step 9** (screen slicing) and **Step 10** (bundler / shared package) are deferred to a later checkpoint (Phase 3b+).

---

## Founder constraints (binding)

- **Delivery vehicle:** Option **A** — extend `build.sh` / `build-pro.sh` to concatenate an ordered list of source files into one Babel-inlined ship artifact. Keep CDN React + Babel Standalone + GitHub Pages behavior.
- **Steps 1–8 only** in this phase. Do **not** start Step 9 or Step 10 without a new founder decision.
- **Parked bugs stay parked** (do not fix inside modularization PRs):
  - `pro_claim_job` RPC 404
  - Pro `activeJobs` persistence
  - Stale marketplace jobs
- **Same extraction strategy** on Customer and Pro, but **do not force exact lockstep** (Customer-only steps like intent/NLP need not wait on Pro).
- **Duplicated locked constants are OK temporarily.** Explicit later plan: after Steps 1–8 checkpoint (or when a bundler exists), consolidate Customer + Pro locked fee/status/category constants into one shared source of truth — tracked as post–Phase-3 follow-up, not in-scope cleanup during extraction PRs.
- **HARD RULE for every extraction PR:**
  - Identical behavior before and after the move
  - **NO** cleanup, bug fixes, product changes, renaming, or logic changes in the same PR unless separately founder-approved
  - Quagon + founder merge gate each step (same as Phase 2)
- **LOCKED economics / contracts:** labor 20/80; Haven $0 on materials / tips / inspection / $30 convenience; additive materials; insurance OUT; Job Contract SoT = Customer `HAVEN_JOB_CONTRACT.md` only; Pro keeps pointer stub; Shared Backend Contract for tech/enforcement.

---

## 1) Current shape (what is monolithic today)

### Shared delivery model (both apps)
Both apps are **single-file React PWAs**:
- Editable source: one `.jsx` file
- Ship path: `build.sh` / `build-pro.sh` strips the React `import`/`export` lines and inlines the body into `prototype*.html` + `index.html` inside a `<script type="text/babel">` tag
- Runtime: React + Babel Standalone + (Customer) jsPDF from CDN — **no module bundler, no ES module loader in the browser**
- Consequence: multi-file layout uses **Option A** — concatenate sources at build time in a fixed order.

Docs of record stay outside the monolith:
- Job rules SoT: Customer `HAVEN_JOB_CONTRACT.md` (Pro file is a **pointer stub only**)
- Tech/enforcement: Customer `HAVEN_SHARED_BACKEND_CONTRACT.md`
- Spec / state docs: `HAVEN_MASTER_SPEC.md`, Pro `HAVEN_PRO_CURRENT_STATE.md`, account contract, chunk setup notes
- Backend SQL: Customer `supabase/migrations/` (0001–0009) — already modular; out of JSX scope

### Customer — `bluspots/bluspots.github.io`
| Piece | Size / note |
|---|---|
| `home_services_app.jsx` | **~5,380 lines / ~363 KB** — essentially the whole product UI + logic |
| `index.html` / `prototype.html` | Regenerated copies; do not hand-edit |
| `audit.test.js` + `boot_check.js` | Local verify suite; depends on single-file App symbols |
| Already “extracted” | Almost nothing in app code — only build shells, docs, migrations, icons |

**Inside the monolith (high level):**
1. **Catalog & pricing data** (~lines 1–900): tasks, pros, categories (`CATS`), completion templates, cleaning price math, intent library / NLP matching, diagnosis keywords, emergency fees, FAQ topics, home-profile enums
2. **Job lifecycle constants** (~918–1110): status flow `SF`/`SI`, screen registries, `makeJob` / `makeNotification`, `ErrorBoundary`, `usePersistedState`
3. **`App()` god component** (~1156–end): all React state, Supabase config/fetch/patch/poll, materials approve/decline, booking/post, demo advance, navigation, ~25 screen renderers, PDF receipt, payments UI stub, tip/rating/messages

**Highest-coupling clusters:** job polling + terminal statuses; materials approve/decline + dual-write; receipt/PDF totals (additive materials); booking → `backendJobId` preserve.

### Pro — `bluspots/haven-pro`
| Piece | Size / note |
|---|---|
| `home_services_pro_app.jsx` | **~3,860 lines / ~235 KB** — same single-file pattern |
| `index.html` / `prototype-pro.html` | Regenerated; do not hand-edit |
| `tools/` | Icon generators only — not app modules |
| Already “extracted” | Docs + pointer stub for job contract; no app module split |

**Inside the monolith:**
1. **Theme, categories, locked fees** (~1–280): `CATEGORY_GROUPS` / Customer-aligned names, `INSPECTION_VISIT_FEE = 45`, `CONVENIENCE_FEE = 30`, status labels, one-active-job helpers, SIM marketplace + completed-job seeds, `jobAmount` net math
2. **`HavenProApp()`** (~281–end): all state; Supabase map/claim/patch/poll; accept → active lifecycle; materials request + receipt draft; earnings stacks; onboarding/identity/tax/payout UI stubs; five tab screens

**Highest-coupling clusters:** accept/claim + one-active-job; materials request ↔ Customer poll; terminal finalize fee fields; SIM vs live backend branching.

---

## 2) Approved extraction ORDER

Principle: **move pure data and pure functions first; leave App state + screens last.** Same strategy both apps; lockstep not required.

| Step | Name | Apps | Risk | Phase 3? |
|---|---|---|---|---|
| **0** | Extend build scripts for concat (behavior-identical ship) | Both | Low | **YES — do first after this docs PR** |
| **1** | Locked constants & status dictionaries | Both | Very low | YES |
| **2** | Pure money/job helpers (no React) | Both | Low | YES |
| **3** | Catalog / SIM seed data | Both | Low | YES |
| **4** | Tiny presentational atoms + theme tokens | Both | Low–med | YES |
| **5** | Persistence / small hooks | Customer first | Med | YES |
| **6** | Intent / diagnosis / matching | Customer | Med | YES |
| **7** | Backend adapter module (fetch/RPC/map only) | Both | Med–high | YES |
| **8** | Job factories + notification helpers | Customer (Pro as needed) | Med | YES |
| **9** | Screen/tab presentational slices | Both | High | **DEFERRED** |
| **10** | Bundler / shared package / constants consolidation | Both | High | **DEFERRED** (see later plan below) |

**Stop after Step 8 for founder/CoS checkpoint.** Do not start Step 9 until re-approved.

---

## 3) Per-step detail

### Step 0 — Concat build (implementation)
- Extend `build.sh` / `build-pro.sh` to concatenate an ordered list of source files into one temp body, then apply today’s strip rules.
- First landing may still concatenate a single file (today’s jsx) so ship is byte-stable; subsequent steps add files to the list.
- **Verify:** regenerated HTML behavior-identical (or documented equivalent); Customer `npm run verify` / boot-check; Pro build + smoke.

### Step 1 — Locked constants & status dictionaries
- **Moves:** Fee constants, status label maps, terminal/active status sets, category name lists, screen name registries (Customer).
- **Stays:** All behavior that uses them.
- **Verify:** Fee literals not reintroduced incorrectly; Quagon: diagnosis decline $45 / standard decline $30; category names match; insurance still out.

### Step 2 — Pure money / job helpers
- **Moves:** Customer `getCompletionDetails`, cleaning price helper; Pro `jobAmount`, `jobRequiresDiagnosis`, `hasBlockingActiveJob`, geo helpers if cleanly separable.
- **Verify:** Customer audit additive materials + receipt PDF; Pro earnings math on SIM completed jobs unchanged.

### Step 3 — Catalog / SIM seed data
- **Moves:** Customer `TASKS` / `PROS` / completion templates; Pro `SIM_JOBS` / `SIM_COMPLETED_JOBS` / demo defaults factories.
- **Verify:** Marketplace SIM loads; demo/reset paths seed correctly.

### Step 4 — Presentational atoms + theme tokens
- **Moves:** Customer `PersonIcon`, `Avatar`, theme color constants, shared CSS string if cleanly separable; Pro `LIGHT`/`DARK` tokens, small icon helpers.
- **Verify:** Visual smoke home + profile both themes.

### Step 5 — Persistence hook (Customer)
- **Moves:** `usePersistedState` + `PERSISTED_KEYS` (and migrate/validate helpers if any).
- **Verify:** Customer audit persistence / corrupt-storage; reload keeps jobs.

### Step 6 — Intent / diagnosis / matching (Customer only)
- **Moves:** `INTENT_LIBRARY`, tokenizer/stemmer, matchers, urgency helpers.
- **Verify:** Audit diagnosis + home-intent suites; manual diagnose → book path.

### Step 7 — Backend adapter (read/write mapping only)
- **Moves:** Thin adapters (`getSupabaseConfig`, row↔job mappers, fetch/update, Pro claim RPC wrapper, materials patch helpers) — **not** lifecycle policy.
- **Stays:** When to call them inside App.
- **Verify:** Quagon materials approve/decline dual-app; accept → `en_route`; poll while Bookings/Tracking open.
- **Note:** Wrap parked bugs; do not fix them in this step.

### Step 8 — Factories
- **Moves:** Customer `makeJob`, `makeNotification` (and related defaults).
- **Verify:** New booking creates full job shape; receipt/PDF still render.

### Step 9 / 10 — Deferred
Screen slicing and bundler / shared package — **out of Phase 3.** Revisit at checkpoint after Step 8.

---

## 4) Explicit NON-GOALS

- No full rewrite / greenfield apps
- No product or rule changes
- No payments / Stripe
- No inventing fees, statuses, or lifecycle paths
- No parked-bug fixes inside modularization PRs
- No cleanup/renames/logic changes bundled with a move PR
- Honor Job Contract SoT + Shared Backend Contract
- Locked economics unchanged (see founder constraints)

---

## 5) Soft parked (separate backlog)

- `pro_claim_job` RPC 404
- Pro `activeJobs` persistence
- Stale marketplace jobs
- Soft QA notes (on-screen receipt materials lines; browse taxonomy edges) — product calls, not structure

---

## 6) Later plan — constants consolidation (explicit)

Duplicating locked constants across Customer and Pro during Steps 1–8 is **allowed**.

**Later (post–Step-8 checkpoint or when Option B bundler is approved):**
1. Inventory duplicated fee/status/category constants in both apps.
2. Choose one shared source (published package, shared repo path, or codegen from Job Contract).
3. Separate founder-approved PR(s) to switch both apps to the shared source — still behavior-identical, Quagon + founder gate.

Until then: keep a short sync checklist when either side’s locked constants change.

---

## Implementation start order (assigned)

1. **This docs PR** — commit this file on Customer; Pro may add a short pointer in README or `docs/`.
2. **Step 0** — concat build scripts, behavior-identical.
3. **Steps 1–8** — one PR at a time; report tip + ready-for-Quagon to CoS; merge only with Quagon + founder.
4. **Stop** after Step 8 for checkpoint.

---

*End of approved Phase 3 order.*
