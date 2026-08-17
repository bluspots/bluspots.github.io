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
Demo Pro Controls) → en route → arrived → in progress → complete, plus
cancellation, tipping, ratings, receipts, and job preferences. No diagnosis,
no materials-request flow, no inspection-only outcome — none of that exists
in the Customer App yet, despite being fully designed in the Pro App
architecture doc (v2, §8–10).

**Pro App** currently has *no job lifecycle code at all*. `SIM_JOBS` is a
static array (`const [jobs] = useState(SIM_JOBS)` — no setter is even
destructured). What's built is the job feed, eligibility/geographic
filtering, category filters, sort controls, Profile, Settings, and dark
mode. Accept, Driving, Arrived, Diagnosing, Materials Request, Working,
Completed — all of it is designed in `haven-pro-app-architecture-v2.md`
but not yet written as code.

**Why this matters right now:** the Pro App is about to write its first
lifecycle code. That's the cheapest possible moment to align vocabulary —
before either side has to migrate anything. Waiting until after the Pro
App's lifecycle ships would mean reconciling two independently-invented
status enums instead of adopting one from the start.

---

## 2. Status Vocabulary — the decision this document makes

The Customer App already ships with a working, tested status enum:

```
posted → en_route → arrived → in_progress → complete
                                            ↘ cancelled (from any pre-complete state)
```
(lowercase snake_case; source: `home_services_app.jsx`, `SF` array and
`VALID_JOB_STATUSES`)

The Pro App's architecture doc independently proposed:
```
AVAILABLE → ACCEPTED → DRIVING → ARRIVED → DIAGNOSING → WORKING → COMPLETED
                                                       ↘ MATERIALS_REQUESTED → WORKING | INSPECTION_ONLY_COMPLETE
```
(SCREAMING_SNAKE_CASE; source: `haven-pro-app-architecture-v2.md` §8 — not
yet coded)

**Decision: adopt the Customer App's existing lowercase convention and
extend it**, rather than the reverse. Rationale: the Customer App's enum is
already shipped, tested (110 passing assertions reference these exact
strings), and persisted in real user data structures. The Pro App's enum
exists only in a design doc — zero migration cost to change it before the
first line of lifecycle code is written. Changing the Customer App's enum
would mean touching shipped, working code and every test that references
it for no functional gain.

### Canonical status enum (target, extending Customer App's existing set)

| Status | Meaning | Introduced by |
|---|---|---|
| `posted` | Job created, waiting for a pro to accept | Customer App (existing) |
| `en_route` | Pro accepted, traveling to the property | Customer App (existing) |
| `arrived` | Pro is at the property | Customer App (existing) |
| `diagnosing` | *(diagnosis-required categories only)* Pro is assessing scope | **New — from Pro App v2 design, not yet coded either side** |
| `materials_requested` | Pro found the job needs more than expected; awaiting customer approve/decline | **New — not yet coded either side** |
| `in_progress` | Actively doing the work | Customer App (existing) — reused as-is for the post-diagnosis "Working" state; **do not introduce a separate `working` status**, it's the same state the Customer App already models |
| `complete` | Job finished, full repair, standard payout/pricing applies | Customer App (existing) |
| `inspection_only_complete` | Diagnosis performed, customer declined materials, job ends at the inspection fee | **New — not yet coded either side** |
| `cancelled` | Job cancelled before or during the above (see §5 for cancellation sub-states) | Customer App (existing) |

**Explicitly rejected:** `AVAILABLE` and `ACCEPTED` as separate statuses.
In the Customer App's actual model, "posted" *is* "waiting to be accepted" —
there is no gap between posting and a pro seeing it in their feed, and the
job never has a state that means "accepted but not yet en route." If the
Pro App needs to distinguish "I've accepted, haven't started driving yet"
as a UI moment, that's a Pro-App-local UI state, not a shared job status —
see §6.

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
| `fixedCustomerLaborPrice` | number | ✅ resolved via `vjTask.p` / `custom.price` | ⚠️ `payout` (this is the *pro's* payout, not the customer's price — see next row) | **These are not the same number and must not become the same field.** Customer's price includes Haven's margin; Pro's payout does not. |
| `fixedProLaborPayout` | number | ❌ not modeled (Customer App has no concept of what the pro earns) | ✅ `payout` | Once a backend exists, `fixedCustomerLaborPrice - fixedProLaborPayout = platformFee`. Today, neither app computes or stores a platform fee anywhere — it's implicit/undefined. |
| `platformFee` | number | ❌ not present | ❌ not present | Not yet modeled on either side. Real backend requirement (see previous row). |
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
| `materials_requested → inspection_only_complete` | **Customer App** (decline) | Same — customer-triggered terminal state |
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

## 7. Open questions this document surfaces (not resolved here)

Carried over from the Pro App architecture doc's own open questions,
restated here because they directly affect the shared schema:

1. Should `materials_requested` (the general capability) be available on
   *any* job, or scoped only to the five `requiresDiagnosis` categories?
   Architecture doc v2 recommends "any job" — if adopted, `materials_requested`
   in §2's enum applies universally, not just to diagnosis categories.
2. Standard (non-diagnosis) categories currently have no fallback
   compensation if materials are discovered mid-job and declined — real
   risk of uncompensated pro labor. Needs a product decision (minimum
   trip/attempt fee?) before `materials_requested` ships for standard
   categories.
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
