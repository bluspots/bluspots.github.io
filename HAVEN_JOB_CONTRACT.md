# HAVEN — CANONICAL JOB CONTRACT (Product Rules)
Status: Canonical · Scope: Product/job rules only (Customer + Pro)

Purpose and boundary

- This file is the single source of truth for WHAT the Haven job lifecycle and economics are.
- It defines product rules: lifecycle statuses, who may trigger which transition, economics (20/80 labor), materials and decline outcomes, “one active job per pro,” and category‑naming parity.
- It does not define HOW these rules are represented in tables/APIs/enums or how they are enforced technically. That contract lives in `HAVEN_SHARED_BACKEND_CONTRACT.md` and must mirror these rules exactly.

If any other document (including the Pro repo’s copy or the backend contract) disagrees with this one on a product rule, this document wins. The backend contract must be updated to reflect this file.

---

## 1) Canonical lifecycle (status vocabulary)

Statuses (lowercase snake_case):

```
posted → en_route → arrived → diagnosing? → (materials_requested → materials_approved →) in_progress → complete
                                                                                     ↘ inspection_completed (diagnosis decline)
                                                                                     ↘ materials_declined   (standard decline)
any pre‑complete → cancelled
```

Definitions:
- posted: Job created; waiting for a pro to accept.
- en_route: Pro accepted; traveling to the property.
- arrived: Pro is at the property.
- diagnosing: For categories where requires_diagnosis=true; pro is assessing scope.
- materials_requested: Pro requested customer approval to buy materials; waiting on customer.
- materials_approved: Customer approved; pro is authorized to purchase (no reimbursement yet).
- in_progress: Pro is actively doing the work.
- complete: Job finished with full repair.
- inspection_completed: Diagnosis performed; customer declined materials on a diagnosis category; job ends at the inspection fee.
- materials_declined: Standard category materials decline; job could not proceed; ends with a $30 convenience fee.
- cancelled: Cancelled from any pre‑complete status (role rules below).

Naming principles:
- Use shared, lowercase snake_case names everywhere.
- No separate “accepted” or “driving” statuses — those are Pro‑app‑local UI moments; the shared status remains `en_route`.

---

## 2) Transition ownership (permissions)

| Transition | May trigger | Notes |
|---|---|---|
| (none) → posted | Customer | Job creation |
| posted → en_route | Pro | Accepts job |
| en_route → arrived | Pro | Arrival confirmation |
| arrived → diagnosing | Pro | Diagnosis categories only |
| diagnosing → in_progress | Pro | Scope matched what was listed |
| diagnosing → materials_requested | Pro | Scope exceeded what was listed |
| materials_requested → materials_approved | Customer | Approves request; authorizes purchase only |
| materials_approved → in_progress | Pro | Submits receipt w/ actual materials cost + photo |
| materials_requested → inspection_completed | Customer | Declines on diagnosis categories |
| in_progress → complete | Pro | Mark job complete |
| any pre‑complete → cancelled | Either | Different sub‑rules by phase; Customer after accept is “request cancel” |
| Rating / tip | Customer | Post‑complete only |

Backend enforcement must reject out‑of‑turn and role‑unauthorized transitions.

---

## 3) Locked economics (authoritative)

- 20/80 labor split: The customer’s listed labor price is authoritative. Haven retains 20% inside that price; the pro’s fixed labor payout is 80%. The payout shown before accept is exactly what the pro receives.
- Haven takes 0% of materials, 0% of tips, 0% of Inspection Visits, and 0% of the $30 convenience fee.
- Materials are additive to labor — never carved out of the service/labor price.
- Diagnosis decline: `inspection_completed` with a hard‑locked $45 inspection fee (pro receives it).
- Standard (non‑diagnosis) decline: `materials_declined` with a $30 convenience fee (pro receives it).

---

## 4) Materials workflow (product rules)

- Customer approval authorizes purchase; it does not reimburse an estimate.
- Reimbursement occurs only on receipt submission with an actual amount and a receipt photo.
- Whole‑request approval (no line‑item negotiation) is acceptable for v1.
- Materials may be requested on any job category (not restricted to diagnosis categories).

---

## 5) One active job per pro (product rule)

- A pro may hold at most one active job at a time across statuses {en_route, arrived, diagnosing, materials_requested, materials_approved, in_progress}.
- The backend enforces this as a constraint; clients must respect it in UX.

---

## 6) Category naming parity (product rule)

- Pro‑side category names must exactly match Customer‑side category names. The shared vocabulary is product‑owned here; the backend carries category strings verbatim.

---

## 7) Insurance (product rule)

- Insurance is OUT. No blanket “Insured” messaging; no insurance product exists. Credentials surfaced to customers may include “Identity verified,” “Background checked,” and “Licensed” only when verified.

---

## 8) Document boundary (what lives where)

- HAVEN_JOB_CONTRACT.md (this file): authoritative product/job rules — lifecycle, permissions, economics, materials, declines, one‑active, category naming, insurance policy.
- HAVEN_SHARED_BACKEND_CONTRACT.md: technical representation and enforcement — enums, columns, RLS/policies, APIs. It MUST mirror these rules exactly and never invent different product behavior.

---

# HAVEN — SHARED JOB DATA CONTRACT
**Status:** Living document · **Version:** 0.1 · **Scope:** Customer App ↔ Pro App ↔ (future) Backend

> **Purpose.** This is the one document both the Customer App chat and the
> Pro App chat should be given before either one writes or changes anything
> touching job data or job status. It exists so the two prototypes stop
> drifting from each other silently. It is deliberately narrow — a data
> contract, not a full spec — so it's cheap to paste into a fresh
> conversation as authoritative context.
>
> **This document distinguishes three things at all times:**
> 1. **Target shape** — what a job object should look like once both apps
>    and a real backend exist.
> 2. **Customer App today** — what's actually implemented in
>    `home_services_app.jsx` right now, verified against source, not memory.
> 3. **Pro App today** — what's actually implemented in
>    `home_services_pro_app.jsx` right now, verified against source.
>
> Nothing below is aspirational-passed-off-as-real. Where the two apps
> already disagree, that's stated plainly rather than smoothed over.

---

## 1. Current Implementation Reality (read this first)

**Customer App** has a working job lifecycle: post → accept (simulated via
Demo Pro Controls) → en route → arrived → diagnosing → materials_requested
→ materials_approved → in progress → complete, plus cancellation, tipping,
ratings, receipts, and job preferences. The Customer App also models
diagnosis-required categories and a materials-approval UI; terminal
materials-decline outcomes (`inspection_completed` for diagnosis categories,
`materials_declined` for standard categories) are recognized and rendered.

**Pro App** now has a live, stateful job lifecycle (accept → `en_route` → `arrived` → `diagnosing` → `materials_requested` → `materials_approved` → `in_progress` → `complete`/`inspection_completed`) written by real UI actions. Exact status names and transition boundaries in the Pro App may differ from the Customer App’s lowercase‑snake_case set and from the original architecture doc. This document records the shared rules; see §2 for the canonical enum.

This appendix retains historical notes where helpful, but the canonical product rules and enum live at the top of this document; use those as authoritative.

---

## 2. Status Vocabulary — historical context (superseded by canonical §1)

The Customer App already ships with a working, tested status enum (Customer‑side
record only for now):

```
posted → en_route → arrived → diagnosing → (materials_requested → materials_approved →) in_progress → complete
                                                                                       ↘ inspection_completed (diagnosis decline)
                                                                                       ↘ materials_declined   (standard decline)
(any pre-complete) → cancelled
```
(lowercase snake_case; source: `home_services_app.jsx`, `SF` array and
`VALID_JOB_STATUSES`)

The Pro App's architecture doc originally proposed (historical naming, not canonical):
```
AVAILABLE → ACCEPTED → DRIVING → ARRIVED → DIAGNOSING → WORKING → COMPLETED
                                                       ↘ MATERIALS_REQUESTED → WORKING | INSPECTION_COMPLETED  (historical doc used “INSPECTION_ONLY_COMPLETE”)
```
(SCREAMING_SNAKE_CASE; source: `haven-pro-app-architecture-v2.md` §8)

Note: The canonical shared enum is defined in §1 of this document (lowercase snake_case). This historical block is retained only for reference; do not derive behavior from it.

### Prior proposal (non‑canonical reference; DEFERRED)

| Status | Meaning | Introduced by |
|---|---|---|
| `posted` | Job created, waiting for a pro to accept | Customer App (existing) |
| `en_route` | Pro accepted, traveling to the property | Customer App (existing) |
| `arrived` | Pro is at the property | Customer App (existing) |
| `diagnosing` | *(diagnosis-required categories only)* Pro is assessing scope | Proposed (from Pro App v2 design) |
| `materials_requested` | Pro found the job needs more than expected; awaiting customer approve/decline | Proposed |
| `in_progress` | Actively doing the work | Customer App (existing). Proposed earlier as the shared “Working” state mapping. |
| `complete` | Job finished, full repair, standard payout/pricing applies | Customer App (existing) |
| `inspection_completed` | Diagnosis performed, customer declined materials, job ends at the inspection fee | Proposed |
| `cancelled` | Job cancelled before or during the above (see §5 for cancellation sub-states) | Customer App (existing) |

Historical note: distinguishing an “accepted” pre‑drive state versus `en_route` is handled as a Pro‑local UI moment; the shared status remains `en_route` (see §1).

---

## 3. Canonical Job Object — target shape

Field names below use the Customer App's existing naming where a field
already exists there (left column shows the actual current field name so
this stays honest about what's real today).

| Field | Type | Customer App today | Pro App today | Notes |
|---|---|---|---|---|
| `id` | string/number | ✅ `id` (`Date.now()`) | ✅ `id` (string like `"j1"`) | **Mismatch today.** Customer uses a timestamp number; Pro uses a short string. Neither is collision-safe or cross-referenceable. A real backend must issue one canonical ID scheme (likely a UUID or DB-assigned string) that both sides adopt — this is a real backend requirement, not solvable client-side. |
| `schemaVersion` | number | ❌ not present | ❌ not present | **Recommended addition, either side, next time either touches job persistence.** Customer App already has this pattern for other persisted domains (`{__v, data}` wrapper via `usePersistedState`) — jobs should get the same treatment so a future format change doesn't require a silent migration. |
| `status` | string enum | ✅ `status` (see §2) | ❌ none yet | Pro App should adopt the §2 enum verbatim when it writes lifecycle code. |
| `category` | string | ⚠️ implicit via `taskId`/`TASKS` lookup, not a bare field | ✅ `category` (bare string, e.g. `"Plumbing"`) | Customer App resolves category through its task catalog; Pro App stores it directly on the job. A shared job object should carry `category` as a bare string on both sides — cheap to add, removes a lookup dependency. |
| `title` | string | ✅ via `custom.title` (custom jobs only) or catalog task name | ✅ `title` | Customer's catalog-task jobs currently only carry `taskId`, not a denormalized title string — fine for the Customer App alone (it has the catalog in memory), but a job handed to the Pro App needs the resolved title as a plain field, since the Pro App doesn't share the Customer App's task catalog. |
| `propertyId` / `propertyLabel` | string | ⚠️ `addressLabel` (e.g. `"Home"`), no stable `propertyId` | ❌ n/a | Customer App's address objects have real IDs (`addresses[].id`); jobs currently snapshot only the formatted text (`addressText`) and label, not the ID. **Gap:** if a property is later renamed, historical jobs can't be traced back to which saved property they were. Not urgent, but worth fixing before this becomes a real backend concern. |
| `addressSnapshot` | string | ✅ `addressText` | ✅ `city` (much coarser — city/state only, not a full address) | **Real privacy/precision mismatch.** The Pro App currently only has city-level location (appropriate for the *feed*, before acceptance — a pro shouldn't see a full address for a job they haven't accepted). Once a job is accepted, the Pro App needs the *full* address, which it doesn't have a field for at all yet. This should be modeled as two different pieces of data: a coarse `cityLabel` (feed-safe) and a full `addressSnapshot` (only populated/visible after acceptance). |
| `coordinates` | {lat, lng} | ❌ not present | ❌ not present (uses `city` string matching + `distanceMi`) | Both sides currently simulate distance/geography rather than using real coordinates. Fine for prototype; flagged as a real backend requirement. |
| `fixedCustomerLaborPrice` | number | ✅ resolved via `vjTask.p` / `custom.price` | ⚠️ `payout` (this is the *pro's* payout, not the customer's price — see next row) | Current working margin is 20% of the customer labor/service price. Adjustable later. Not immutable. Not TBD. The customer sees one fixed labor/service price. Haven keeps 20% inside the listed labor price; the customer price does not increase. The founder set that margin at 20% of the listed labor price. The Pro's fixed labor payout is 80% of the listed labor price. The Pro sees that payout before accepting, and the amount shown is exactly what the Pro receives. The rate can be changed later. It is not TBD. |
| `fixedProLaborPayout` | number | ❌ not modeled (Customer App has no concept of what the pro earns) | ✅ `payout` | The Pro's fixed labor payout is 80% of `fixedCustomerLaborPrice` (the listed labor price). The Pro sees that payout before accepting, and the amount shown is exactly what the Pro receives. The rate can be changed later. It is not TBD. |
| `platformFee` | number | ❌ not present | ❌ not present | Not yet modeled on either side. Haven keeps 20% inside the listed labor price (current working margin); the customer price does not increase. |
| `emergencyFee` / `emergency` | number / bool | ✅ `emergencyFee`, `emergency` | ✅ `emergency` (bool only, no fee field) | Pro App shows emergency as a badge/priority flag on the feed; it doesn't yet carry the fee amount as its own field. Should if/when Pro App shows payout breakdown. |
| `inspectionFee` | number | ❌ not present (Customer App has no Inspection Visit concept yet) | ✅ `inspectionFee` | **This is the clearest sign the two apps have already diverged on a real feature.** The Pro App's job feed already displays a two-tier price card (guaranteed inspection fee vs. contingent full payout) for diagnosis categories, per architecture doc §6 — this is real, shipped Pro App UI. The Customer App has *no* corresponding UI or data field for this at all. This needs Customer App work before a real diagnosis-required job could ever be posted and completed end-to-end. |
| `requiresDiagnosis` | bool | ❌ not present | ⚠️ implicit — `DIAGNOSIS_CATEGORIES` is a static `Set` checked by category name, not a field on the job itself | Recommend making this a real field on the job object (computed at creation time from the category lookup) rather than a lookup every consumer has to redo. Cheap, removes a shared-constant dependency. |
| `expectedDurationMin` / `expectedDurationMax` | number | ✅ (Customer App: `getExpectedDuration()` helper, derives a min/max from the task's rough duration string) | ✅ `durationMin` only (single value, not a range) | Customer App already models this as a range with a confidence level; Pro App has a single flat estimate. Recommend Pro App adopt the range shape when it next touches this — same reasoning as duration display already being a solved, tested problem on the Customer side. |
| `scheduledStart` / `scheduledWindow` | timestamp / string | ⚠️ `TIME_PREFS`/`tpId` (a preference *category*, e.g. "ASAP" — not an actual scheduled timestamp) | ✅ `requested` (a display string like `"Today, 3:00 PM"`, not a real timestamp either) | **Neither side has a real scheduled-time field today** — both are display strings/category IDs, not machine-usable timestamps. Real backend requirement. |
| `status timestamps` (`acceptedAt`, `completedAt`, etc.) | timestamp | ✅ `acceptedAt`, `completedAt`, `cancellationRequestedAt`, `tippedAt` | ❌ none (no lifecycle exists yet to timestamp) | Pro App should timestamp every transition in §2 the same way, once it writes lifecycle code — `enRouteAt`, `arrivedAt`, `diagnosingAt`, `materialsRequestedAt`, `workStartedAt`, `completedAt`, `cancelledAt`. |
| `customerPreferencesSnapshot` | string[] | ✅ `jobPreferences` (snapshot of enabled preference labels at booking time) | ❌ not present | Already built and shipped on the Customer side (see Customer App §3 of its own recent work) specifically so a "future Pro-app surface would read" it. Pro App should surface this on Job Detail once it exists — the data is already there and waiting. |
| `paymentSnapshot` | {brand, last4} | ✅ `paymentBrand`, `paymentLast4` | ❌ not present | Pro App has no reason to need full payment info, but may want brand/last4 for receipt-adjacent display later. Low priority. |
| `materialsRequest` | object | ❌ not present | ❌ not present (not coded; designed in architecture doc §9–10) | Needs: `{items[], totalCost, photoUrl, requestedAt, status: pending|approved|declined, respondedAt}`. Not built either side yet — this is the next real cross-app feature to design in code, not just in the doc. |
| `inspectionOutcome` | string enum | ❌ not present | ❌ not present | `full_repair` \| `inspection_only`. Should be set once a job resolves via §2's terminal states. |
| `cancellationState` | object | ✅ `cancelStatus` (`null` \| `"requested"`), `cancellationRequestedAt` | ❌ not present | Pro App has no cancellation flow modeled yet. |
| `customerRating` / `customerReview` | number / string | ✅ `stars`, `reviewTxt`, `rated`, `hireAgain` | ❌ not present (Pro App's own Trust Score is a *separate*, pre-computed simulated number on the pro profile, not derived from real per-job ratings yet) | Real backend requirement: Pro App's Trust Score should eventually aggregate from real `customerRating` values across completed jobs, not be a static seeded number. Not urgent for prototype stage. |
| `tipAmount` / `tipStatus` / `tippedAt` | number / string / timestamp | ✅ all three, fully implemented (`notAdded`\|`processing`\|`paid`\|`failed`) | ❌ not present | Pro App's Earnings screen (designed, not yet built) should read `tipAmount` directly once it exists — 100% of tip goes to the pro, per Customer App's existing tip-economics rule; this rule should be treated as already-decided, not re-litigated in Pro App design. |

### 3b. Locked economics decisions (now reflected in code)

The following product decisions are locked and adopted in both code and docs.

- Service price equals labor. No carve‑outs from the service price.
- Materials are additive on top of the service price (labor).
- Haven takes 0% of materials, 0% of tips, and 0% of Inspection Visits.
- 100% of approved materials and 100% of tips go to the Pro.
- The Customer App treats materials as additive; labor remains the full service/labor price.
- The customer sees one fixed labor/service price. Haven keeps 20% inside the listed labor price; the customer price does not increase. The founder set that margin at 20% of the listed labor price. The Pro's fixed labor payout is 80% of the listed labor price. The Pro sees that payout before accepting, and the amount shown is exactly what the Pro receives. The rate can be changed later. It is not TBD.

### 3c. Standard materials‑decline outcome wording (locked)

- For standard (non‑diagnosis) categories, when materials are requested
  mid‑job and the customer declines, the terminal outcome is:
  “Job Ended — Materials Declined.”
- A flat $30 convenience fee is LOCKED for this outcome (Haven $0). Credited to the Pro.
- Existing diagnosis fees and the diagnosis‑inspection path remain as they
  are; do not rename or merge that path into this new standard outcome.

---

## 4. The "Pro" object — also currently two different shapes

Worth naming explicitly, since it's the other half of a job record:

- **Customer App's `PROS`** entries are a *simulated, customer-facing view*
  of a pro: `{i (2-letter id), n (name), r (rating), j (job count), s
  (specialty), col (avatar color), trustScore, onTimeRate, hireAgainRate,
  completionRate, responseTime, badges[]}`.
- **Pro App's own profile state** (what a pro edits about themselves):
  `firstName, lastName, about, avatarEmoji, workCategories (Set),
  travelRadius, homeCity`.

These don't overlap even in intent — one is "what a customer sees about
the pro who's coming," the other is "what the pro has configured about
themselves." That's expected and fine. The thing to avoid: if a real
backend Pro profile gets built, it should be **one canonical Pro record**
that the Customer App's `PROS`-style view is *derived from* (a read
projection), not two independently-maintained pro datasets that can drift
out of sync with each other the way job status already has.

---

## 5. Which app may trigger which transition (target model)

| Transition | Triggered by | Notes |
|---|---|---|
| `(none) → posted` | Customer App | Job creation |
| `posted → en_route` | Pro App (Accept) | Currently simulated via Customer App's own "Demo Pro Controls" — this is explicitly a stand-in for a real Pro App action, not a real cross-app sync today |
| `en_route → arrived` | Pro App | Same simulation caveat |
| `arrived → diagnosing` | Pro App | Diagnosis-required categories only (§2); not coded either side yet |
| `diagnosing → in_progress` | Pro App | Scope matched what was listed |
| `diagnosing → materials_requested` | Pro App | Scope exceeded what was listed |
| `materials_requested → in_progress` | **Customer App** (approve) | Customer-triggered, not Pro-triggered — the Pro App is blocked waiting on this |
| `materials_requested → inspection_completed` | **Customer App** (decline) | Same — customer-triggered terminal state |
| `in_progress → complete` | Pro App | |
| `(any pre-complete) → cancelled` | Either, with different sub-rules: Customer may cancel before acceptance freely, and *request* cancellation after acceptance (`cancelStatus:"requested"` — already built); Pro App cancellation/abandonment handling is an open edge case per architecture doc §23, not yet designed in detail | |
| Rating / tip | Customer App only, post-`complete` | Already fully built on Customer side |

A real backend is what actually *enforces* this table (rejecting an
out-of-turn transition attempt). Until then, this table is the agreement
both prototypes should self-police against — i.e., don't write Pro App
code that lets a pro trigger `materials_requested → in_progress` directly;
that's a customer decision even in the prototype's simulated world.

---

## 6. What's explicitly Pro-App-local (not part of the shared contract)

Not everything the Pro App tracks needs to be a shared job field:

- Feed sort order, `homeFilter`, `moreFiltersOpen` — pure Pro App UI state.
- `travelRadius`, `workCategories`, `homeCity` — Pro's own settings, not
  part of any individual job.
- Any "I've accepted, about to start driving" UI moment that doesn't
  correspond to a real status change — if the Pro App wants a brief local
  transition animation between accept and `en_route`, that's fine, as
  long as the *job's actual `status` field* still only ever holds a value
  from §2.

---

## 7. Open questions (historical; updated where decisions are locked)

Carried over from the Pro App architecture doc's own open questions,
restated here because they directly affect the shared schema:

1. Should `materials_requested` (the general capability) be available on any job, or scoped only to diagnosis categories? — Resolved: available on any job (see §1/§4).
2. Standard (non‑diagnosis) materials‑decline compensation — Resolved (LOCKED): terminal = `materials_declined` with $30 convenience fee to the Pro; Haven $0 (see §1/§3c).
3. Whole-request materials approval only (no line-item negotiation) —
   confirmed acceptable for v1 per architecture doc; carried here as a
   schema implication: `materialsRequest` is one object per request, not
   an array of individually-approvable line items.

---

## 8. How to use this document — mandatory, not optional

**This document is a required source for both the Customer App chat and
the Pro App chat.** It is not a one-time report — it is the standing
engineering contract between the two prototypes.

**The trigger rule:** for *any* future slice that changes jobs, pricing,
statuses, tips, inspections, materials, preferences, or timestamps, the
instruction to give whichever Claude chat is doing that work is:

> Review HAVEN_JOB_CONTRACT.md first. Any schema change must be reflected
> in the contract and remain compatible with both apps.

Concretely, that means, in the same turn as the code change:

1. **Read this document before writing the change** — not after, not "if
   there's time." §2–§5 define the vocabulary and ownership rules; a
   change that contradicts them without updating this document first is a
   compatibility bug, not a stylistic choice.
2. **If the change adds, renames, or repurposes a field or status**, update
   the relevant row in §3 (or add one) and the enum in §2 in the same
   turn — not as a follow-up, not deferred to "later." A field that exists
   in shipped code but not in this document is exactly the kind of silent
   drift this document exists to prevent.
3. **If the change makes one app's shape diverge from the other's**, say so
   explicitly in the "today" columns rather than only documenting the
   target shape — this document's value is in staying honest about
   *current* reality, not just aspirational design, the same discipline
   already applied throughout §3's mismatch notes.
4. **If a change is genuinely incompatible with the other app** (not just
   not-yet-implemented there), that should stop and become a question back
   to you, the same way §7's open questions are surfaced rather than
   silently resolved one way.

This is enforced the same way any other standing engineering rule in this
project is: by being restated at the start of the relevant work, and by
this document itself refusing to quietly go stale — see the correction
pass already applied to `HAVEN_MASTER_SPEC.md` §10 as the precedent for
what happens when a "living document" isn't actually kept living.

This document does not replace `HAVEN_MASTER_SPEC.md` — it's a focused
extraction of just the job-data-contract slice, meant to be small enough
to pass into a fresh conversation without requiring the full spec.
