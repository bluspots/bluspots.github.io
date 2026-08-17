# HAVEN — MASTER SPECIFICATION
**Status:** Living document · **Version:** 0.2 · **Last updated:** this conversation
**Owner:** Product/Engineering (Claude) + Founder (you) + ChatGPT (product strategy)

> This document is the single source of truth for Haven. It is modular — each
> numbered section can be updated independently. Sections or fields marked
> **❓ OPEN QUESTION** are gaps that need a decision before they can be
> considered final. Nothing in this document is invented; anything not yet
> decided is flagged rather than guessed.
>
> **Changelog:** v0.2 adds sections 18–28 (North Star, Competitor Analysis,
> Product Decision Log, Marketplace Strategy, Trust Flywheel, AI Strategy,
> Success Metrics, Things We Refuse To Do, Long-Term Vision, Engineering
> Philosophy, Document Structure) and a full consistency review pass across
> the existing v0.1 sections. No existing section was rewritten; several were
> lightly expanded or cross-referenced where the review pass found gaps.

---

## 1. Executive Summary

**What Haven is.** Haven is a two-sided mobile marketplace connecting
homeowners with vetted, background-checked, independent service professionals
("Pros") for small-to-medium household jobs — assembly, installation, repair,
plumbing, electrical, painting, flooring, cleaning, landscaping, moving,
maintenance, appliance work, and pest control. Unlike quote-based competitors,
Haven uses **fixed, transparent pricing** shown before booking.

**The mission.** ❓ **OPEN QUESTION** — no formal mission statement has been
authored yet. Based on repeated language used throughout this project, a draft
is proposed below for your review/edit:

> *Draft mission: "Replace the experience of Googling a problem, calling five
> contractors, leaving voicemails, and waiting for quotes — with an app where
> you describe what's wrong, pick a time, and a trusted pro shows up. Simple,
> fast, and honest about cost from the first tap."*

**The long-term vision.** Haven is explicitly intended to grow beyond a
booking marketplace into **"the medical record for the house"** — a trusted,
permanent record of everything done to a home (services, receipts, warranties,
appliances, maintenance history), not just a transaction log. The product
philosophy statement used throughout development is:

> **Simplicity → Speed → Money**

**The customer promise.** Synthesized from product principles applied
throughout the build (not yet ratified as official marketing copy — ❓ needs
your sign-off):
- Fixed price shown before you book — no quotes, no surprises
- Every pro is ID-verified, background-checked, and insured
- Post a job in under 60 seconds
- Same-day availability where possible
- Every completed job becomes a permanent, retrievable home record

---

## 2. Core Philosophy

| Pillar | What it means for Haven |
|---|---|
| **Simplicity** | One question per screen. No screen should ask the user to think about more than one decision at a time. |
| **Speed** | Target: **describe problem → choose time → post job in under 60 seconds.** Every design decision is measured against whether it adds or removes friction from this path. |
| **Trust** | Trust is treated as *the* product, not a feature bolted on. Trust Score, verification badges, and receipts exist to remove anxiety, not to decorate the UI. |
| **Premium experience** | Calm, uncluttered, confident visual language (navy + amber + warm off-white). Never feels like a spreadsheet or an admin panel, even in data-heavy areas like My Home. |
| **"Simplicity = Speed = Money"** | The founding equation of the product: the less a customer has to think, the faster they book, the more revenue the platform captures. Every feature is judged against this chain. |

**Design principles actually enforced during development:**
1. Merge screens rather than add a "continue" step between them wherever content fits without crowding.
2. Pre-fill smart defaults (time preference, address, payment method) rather than force a choice.
3. Show the total price continuously — the user should never wonder what something costs.
4. Placeholder/unbuilt features must be **visibly disabled** ("Coming soon"), never a fake clickable no-op.
5. Empty states must explain what will appear there and why, not just show a blank icon.

**What Haven should never become** (inferred from explicit course-corrections during development — ❓ confirm these are accurate):
- A form-filling experience (multi-field screens with no visual hierarchy)
- A cluttered, TaskRabbit-style thin marketplace where pros show up underprepared
- An app that hides the real cost until late in the flow
- An admin/database feel in customer-facing areas (My Home, Documents)
- A product that adds features because "that's how booking apps usually work" rather than because they earn their place

---

## 3. Product Principles (non-negotiable rules)

1. **Minimize taps.** If a screen and the one after it can be merged without feeling crowded, merge them. (Precedent: Task Detail + Photo screen were merged into a single booking screen specifically for this reason.)
2. **Every screen answers one question.** "What needs to be done?" / "When do you need it?" — not five things at once.
3. **Never overwhelm the user.** Sections that could feel like a database (My Home, Documents) use calm cards and plain language, not tables of raw data.
4. **Defaults eliminate decisions.** Time preference, address, and payment method default to the most sensible option and are editable via a one-tap "Change" link, never a required selection.
5. **Speed over features.** A new feature is deferred if it adds a screen or a tap to the core booking path without clear value.
6. **Every feature must earn its place.** Confirmed in practice: several "review before posting" and confirmation-screen ideas were deliberately rejected in favor of making the existing booking screen itself the review (see §7).
7. **No fake affordances.** Any button that isn't wired up yet must look and behave as disabled, with a "Coming soon" label — never silently do nothing.

---

## 4. User Personas

❓ **OPEN QUESTION — no personas have been formally authored.** The features
built strongly imply at least the following persona *categories*, but no
names, demographics, quotes, or research back these up. Please confirm,
correct, or replace:

| Persona (inferred, unconfirmed) | Signal from what was built |
|---|---|
| **Busy homeowner** | Core booking-speed optimization work, smart defaults, "under 60 seconds" target |
| **Emergency customer** | Dedicated Emergency Mode: urgent categories, 6-hour timing windows, priority fee |
| **First-time homeowner** | My Home "house medical record" concept — implies someone who doesn't yet have a system for tracking home maintenance |
| **Property manager** | Mentioned once in the ChatGPT product-strategy roadmap (multi-property, recurring maintenance) but **not built or discussed further** — status unconfirmed |
| **Future personas** | ❓ Not yet defined (e.g., landlord, renter with limited authority over the property, real-estate agent prepping a home for sale — the Home Report feature suggests this last one is plausible but unconfirmed) |

**Needed from you:** For each persona you want formalized — primary goal,
biggest frustration with current alternatives (TaskRabbit, Craigslist, word of
mouth), and what would make them trust Haven enough to book their first job.

---

## 5. Complete Feature Inventory

Status key: **Prototype** (built, working in the browser prototype, no
backend) · **Partial** (some of the feature exists, not complete) ·
**Planned** (discussed, not built) · **Parking Lot** (idea only) · **Future**
(explicitly deferred, out of current scope).

| Feature | Status | How it currently works |
|---|---|---|
| Service catalog browsing | Prototype | 51 services across 15 categories; category chips + grid; search |
| Describe the Problem (guided diagnosis) | Prototype | Free-text input matched against a keyword map (`KEYWORD_MAP`) using a scoring algorithm — **not real AI/NLP**, simulated matching only |
| Custom Job ("Not Listed?") | Prototype | Free-form title, category, budget, description; same booking flow as catalog services |
| Emergency Mode | Prototype | 6 preset urgent issue types → routes into booking flow with emergency-only timing (ASAP/4hr/6hr), +$35 flat fee, red/orange badge throughout |
| Fixed pricing | Prototype | Every catalog service has a fixed price; custom jobs use a customer-entered budget instead of a quote |
| Time preference selection | Prototype | Compact chip selector; defaults pre-selected (non-emergency defaults to a no-surge option; emergency defaults to ASAP) |
| Photo upload at booking | Prototype | Real device camera/photo library via `<input type="file">` (web) — up to 4 photos, optional |
| Smart defaults (address/payment) | Prototype | Booking screen shows the default saved address and default card inline, with a "Change" link to the full screens — not a required choice |
| Booking → single-screen flow | Prototype | Description, time, photos, and address/payment summary all live on one screen; tapping "Post Job" is both the review and the action (see §7 for the explicit design decision behind this) |
| Job posting / "waiting for a pro" state | Prototype | Simulated — a demo button ("Simulate: a pro accepts") stands in for real pro-side matching, since there is no pro app or backend |
| Live tracking | Prototype | Status progression (En Route → Arrived → In Progress → Complete) advanced via a demo "Advance status" button; includes an illustrative SVG map (not real GPS) |
| In-job messaging | Prototype | Simulated two-way chat with canned pro replies and a typing indicator; locks permanently once job is marked complete |
| Trust Score system | Prototype | Static per-pro metrics (trust score, on-time %, would-hire-again %, completion %, avg. response time, verification badges) — **not calculated from real data**, hardcoded per pro |
| Pro Profile screen | Prototype | Full profile view (avatar, specialty, Trust Score card, metric grid, badges); reachable from tracking, the pending screen, and via Message |
| Ratings & reviews | Prototype | 1–5 stars, free-text review, "would hire again" (yes/maybe/no) — stored on the job but **does not feed back into the pro's Trust Score** (explicitly deferred) |
| Bookings list (multi-job) | Prototype | Handles multiple simultaneous jobs at different stages; All/Active/Done filter tabs |
| My Home — Home Overview | Prototype | Address, home type, year built, sqft, bedrooms/bathrooms — all editable via dropdown/bottom-sheet pickers |
| My Home — Service History | Prototype | Auto-populated from completed jobs; shows service, date, pro, price, "Completed" badge |
| My Home — Maintenance Suggestions | Prototype | Simulated static reminders tied to specific completed service types (gutter cleaning, HVAC filter, pest control, pressure washing) — **not based on real elapsed time** |
| My Home — Appliances | Prototype | 4 mock appliance cards (Fridge, Washer/Dryer, Water Heater, HVAC) with placeholder brand/install/warranty fields; only the "service count" is real, computed from completed jobs |
| My Home — Documents vault | Prototype | 5 document categories; only **Receipts** is functional (real count, opens a real list); Warranties/Manuals/Inspection reports/Other are visibly disabled placeholders |
| Completed-job Receipts | Prototype | Auto-generated on demand from job data (not stored separately) — Haven branding, receipt ID, service, date, pro, address, price breakdown, total, payment method used, description, photo count, trust note |
| Home Report | Planned (placeholder only) | Card exists with finalized copy and a disabled "Coming soon" button; no export logic |
| Profile — edit name/bio/photo | Prototype | Real photo upload, editable name and bio |
| Profile — Payment methods | Prototype | Full realistic add-card form (card #, expiry, CVV, billing address/city/state/zip); only brand/last4/expiry/default ever persisted or displayed after saving; CVV/billing data discarded after submit |
| Profile — Saved addresses | Prototype | Add/edit/delete, inline expand-to-edit pattern |
| Profile — Notifications | Prototype | Toggle switches for push/job updates/messages/promos/email — cosmetic only, no real push infrastructure |
| Profile — Help & Support | Prototype | FAQ accordion (5 static topics) + a simulated support chat with a canned auto-reply |
| Sign out | Planned (placeholder) | Visibly disabled, "coming soon" — no real auth exists to sign out of |
| Branding | Partial | "Haven" is an explicit **placeholder name**, confirmed temporary by you and may change before launch |
| Backend / real data persistence | Future | None. All state is in-memory React state; a full page reload resets everything. |
| Real payments (Stripe/Square) | Future | Explicitly out of scope for the prototype at every stage requested so far |
| Pro-side app | Future | Discussed conceptually (separate app, like Uber/Uber Driver) but not designed or built |
| Real AI diagnosis / photo recognition | Future | Current "Describe the Problem" and photo upload are simulated; no ML model is connected |
| Real GPS tracking / dispatch | Future | Current tracking is a scripted status progression with an illustrative map, not real location data |

---

## 6. Screen-by-Screen Documentation

Each screen below is documented as: **Purpose · Flow · Inputs · Outputs ·
Navigation · Future improvements.** Screens are listed in the order a new
user is most likely to encounter them.

### Home (dashboard)
- **Purpose:** Single entry point communicating the three primary paths: Describe the Problem, Urgent, Not Listed — plus fast access to common categories and popular services.
- **Flow:** Land here after opening the app or tapping the Home tab.
- **Inputs:** Search tap (routes to Browse), category tile tap, Describe/Urgent/Not-Listed card tap, popular service tap.
- **Outputs:** Navigates to Diagnose, Emergency, Custom Job, Browse, or directly to a Task Detail/Booking screen.
- **Navigation:** Bottom tab bar (Home/Bookings/Profile) always visible here.
- **Future improvements:** ❓ not yet requested — flag if you want personalization (e.g., "welcome back" states, recently booked services).

### Browse
- **Purpose:** Full category + search view for finding a specific catalog service.
- **Flow:** Reached via Home search bar, an entry tile (pre-filters by category group), or "See all."
- **Inputs:** Search text, category chip selection, service tap.
- **Outputs:** Opens Task Detail/Booking screen for the selected service, or Custom Job if none fit.
- **Navigation:** Back returns to Home.

### Diagnose ("Describe the Problem")
- **Purpose:** Let a customer describe an issue in plain language and get a matched service + price.
- **Flow:** Text input → "Find a solution" → scored keyword match → result card with issue, matched service, price, confidence badge → "Book this repair."
- **Inputs:** Free-text description.
- **Outputs:** Navigates into the Booking screen with description pre-filled.
- **Navigation:** Back returns to Home.
- **Future improvements:** Replace keyword-matching with a real NLP/AI backend (see §13 Parking Lot).

### Emergency
- **Purpose:** Fast, calm path for urgent issues needing help within 6 hours.
- **Flow:** 6 preset options (leak, no AC/heat, electrical, locked out, garage door, other) → routes into Booking screen with emergency timing (ASAP/4hr/6hr) and a flat $35 priority fee.
- **Inputs:** Option tap.
- **Outputs:** Booking screen, pre-filled and flagged `emergency: true`.
- **Navigation:** Back returns to Home.

### Task Detail / Custom Job (the "Booking screen")
- **Purpose:** The single screen where a job actually gets posted. Deliberately merged from what were originally three separate screens (task detail → photo upload → confirmation) into one, per the Booking Speed Optimization pass.
- **Flow:** Shows service + live price (with surge/emergency fee breakdown) → address/payment summary (defaults, editable via "Change" links) → time chips → optional inline photo row → optional description → "Post Job — $X."
- **Inputs:** Time selection, optional photos, optional description; for Custom Job also title/category/budget.
- **Outputs:** Creates a job record and navigates to Posted/Waiting.
- **Navigation:** Back returns to wherever the user came from (Home, Browse, Diagnose, Emergency, or My Home — tracked via a `cameFrom` state).
- **Design note:** No separate "review" screen exists by design — see §7 for the rationale.

### Posted / Waiting
- **Purpose:** Reassurance screen while "waiting" for a pro to accept.
- **Flow:** Shows job summary, a list of nearby pros "viewing" the job (with Trust Score badges, tappable to Pro Profile), and a demo "Simulate: a pro accepts" button.
- **Outputs:** On simulated acceptance, moves to Tracking.
- **Navigation:** Back returns to Bookings list.

### Tracking
- **Purpose:** Live status view of an active or completed job.
- **Flow:** Status stepper (En Route → Arrived → In Progress → Complete), illustrative SVG map, pro card (Trust Score, Message/Call buttons), booking summary, and a demo "Advance status" button. Once complete: Rate button and View Receipt button appear.
- **Navigation:** Back returns to Bookings list. "Help" opens Help & Support (returns here on back). Tapping the pro opens Pro Profile.

### Messages
- **Purpose:** In-job chat between customer and pro.
- **Flow:** Simulated pro replies with a typing-indicator delay; input disables permanently once the job is complete.
- **Navigation:** Back returns to Tracking.

### Rating
- **Purpose:** Post-completion review capture.
- **Flow:** Star rating (required to submit), optional written review, "would hire again" selector.
- **Navigation:** Back returns to Tracking; submitting returns to Bookings.

### Bookings (tab)
- **Purpose:** List of all jobs across every stage.
- **Flow:** All/Active/Done filter tabs; tapping a job routes to Posted or Tracking depending on its state.
- **Navigation:** Always resets here fresh when the Bookings tab is tapped.

### Profile (tab) and its sub-screens
Sub-screens: Edit Profile, My Home (see §8), Payment Methods, Saved Addresses,
Notifications, Help & Support. Each has a consistent light header with a back
arrow; back destinations are individually tracked so returning from, say,
Help opened from Tracking goes back to Tracking, not Profile (see §10 for the
`helpFrom`/`cameFrom` pattern).

### Pro Profile
- **Purpose:** Full-detail view of a pro's Trust Score, metrics, and badges.
- **Reachable from:** Tracking, Posted/Waiting pro list.
- **Navigation:** Back returns to wherever it was opened from (tracked via `proProfileFrom`).

### Receipts / Receipt
- **Purpose:** Documents-vault foundation — see §8.

---

## 7. Booking Flow (step by step, current state)

```
Open Haven
   │
   ├─→ Describe the Problem ──┐
   ├─→ Urgent (Emergency) ────┤
   ├─→ Not Listed (Custom) ───┤
   └─→ Browse → pick service ─┘
                │
                ▼
     Booking screen (ONE screen)
     • Service + live price (incl. surge/emergency fee)
     • Address (default, editable)
     • Payment method (default, editable)
     • Time (chip selector, pre-selected default)
     • Photos (optional, inline, up to 4)
     • Description (optional)
                │
                ▼
        Tap "Post Job — $X"
                │
                ▼
       Posted / Waiting screen
     (pros "viewing" the job — simulated)
                │
                ▼
        [Simulate: pro accepts]
                │
                ▼
          Tracking screen
   En Route → Arrived → In Progress → Complete
                │
                ▼
      Rate pro + View Receipt
```

**Explicit design decision on "Review before posting":** an earlier product
requirement asked for a dedicated confirmation screen (service, address,
time, photos, emergency status, total, one "Post Job" button) before posting.
The decision made was **not** to add a separate screen for this. Instead, the
single Booking screen already displays every one of those fields
simultaneously, so tapping "Post Job" already functions as the confirmation —
adding a separate screen would have added a tap in direct conflict with the
Simplicity → Speed → Money principle. This is a recorded product decision,
not an oversight — flagging here so it isn't "fixed" by a future contributor
who doesn't know the reasoning.

---

## 8. My Home System

| Sub-feature | Status | Detail |
|---|---|---|
| **Home Overview** | Prototype | Address, home type (dropdown), year built (dropdown, dynamically generated back to 1900 + "Before 1900"/"Not sure"), square footage, bedrooms + bathrooms (separate dropdowns, displayed combined as "2 bed / 1 bath") |
| **Service History** | Prototype | Auto-populated from `jobs` where `status === "complete"`, sorted newest first. Each entry: service, date completed, pro, price, "View details" / "View receipt" / "Hire again" |
| **Appliances** | Prototype (placeholder data) | 4 fixed appliance types; only the service-count per appliance is computed from real completed-job data; brand/model/install date/warranty are static placeholder text |
| **Documents** | Prototype (foundation) | 5 categories shown as cards; only **Receipts** is live (real count, opens a real list). Others are visibly disabled "Coming soon." |
| **Receipts** | Prototype | Auto-generated (not stored separately) from any completed job — see full field list in §5. Receipt ID format: `HVN-XXXXXX` derived from the job's internal timestamp ID. |
| **Maintenance Suggestions** | Prototype (simulated) | Rule-based: if a completed job matches one of 4 tracked service types (gutter cleaning, HVAC filter, pest control, pressure washing), a static reminder card appears with a "Book again" shortcut. Not based on real elapsed time — always shows once a matching job exists, regardless of how long ago. |
| **Home Report** | Planned (placeholder) | Card with finalized copy: *"Your home report will combine service history, receipts, warranties, appliance records, and maintenance notes into one clean record."* Button disabled, "Coming soon." No export logic. |
| **Future vision** | ❓ Open | The stated long-term ambition ("medical record for the house") implies eventual real document storage, warranty tracking with expiration alerts, and exportable reports (PDF, for sale/rental purposes) — none of this is scoped yet. Needs a dedicated future planning session. |

---

## 9. Trust System

| Element | Status | Detail |
|---|---|---|
| **Trust Score** | Prototype (static) | Each pro has a hardcoded `trustScore` (0–100), color-coded (green ≥97, amber ≥90, red below). Shown as a compact badge everywhere a pro appears, and as a large hero number on Pro Profile. |
| **Supporting metrics** | Prototype (static) | On-time rate, would-hire-again rate, completion rate, avg. response time — all hardcoded per pro, not calculated from real job outcomes. |
| **Verification badges** | Prototype (static/cosmetic) | "Identity verified," "Background checked," "Insured," "Licensed" — displayed as trust signals; **no real verification backend exists.** |
| **Reviews** | Prototype | Star rating + free text + "would hire again" captured per job. **Does not currently feed back into a pro's Trust Score** — explicitly deferred as a future "keep it simulated for now" decision. |
| **Receipts** | Prototype | See §8 — function partly as a trust artifact (proof of what was paid and done) as well as a record-keeping one. |
| **Payments** | Prototype (UI only) | Realistic add-card form (card #, expiry, CVV, billing address). CVV and billing details are **never persisted** — only brand, last 4, expiry, and default status are stored, and that's all that's ever displayed again. No real processor is connected. |
| **Safety** | Conceptual only | Background-check and insurance messaging exists in the UI; no real background-check integration (e.g., Checkr) has been built or even stubbed. |
| **Emergency flow** | Prototype | See §5/§7 — urgent path with dedicated timing and fee, not a trust feature per se but designed to reduce anxiety during urgent situations. |

---

## 10. Engineering Architecture

> **Correction pass note (this update):** several claims below were stale
> relative to the actual shipped code and have been corrected against
> `home_services_app.jsx` and `audit.test.js` directly, not from memory.
> The previous version of this section said there were no automated tests,
> no persistence, and described a since-replaced back-navigation pattern —
> none of that is still true. See the dated correction markers inline.

**Current project structure (browser prototype):**
```
home_services_app.jsx   — the entire application, single file, single
                           component, ~3,800 lines (grown substantially
                           since this doc's last full pass — see §16)
prototype.html           — standalone browser-runnable build (React + Babel
                           standalone via CDN, no build step), regenerated
                           from home_services_app.jsx via a bash pipeline
                           every time the source changes
audit.test.js             — jsdom + React Testing Library functional
                           regression suite, 110 passing assertions across
                           31 numbered steps/phases — **corrects the
                           previous "no automated tests" claim below**
```

*(A parallel Expo/React Native port was attempted for iPhone testing via
Expo Go and is currently paused per your explicit instruction — it lives in
a separate `haven-expo/` folder and is not part of the active codebase. See
§16 for why it was paused.)*

**Component/state model:**
- Single top-level `App()` function component.
- **All `useState`/`useRef` hooks are declared at the very top of the
  component, before any other logic.** This is an enforced convention, not
  an accident — an earlier bug (a `useState` accidentally placed inside a
  nested render function) caused a Rules-of-Hooks crash, and the fix
  established this as a standing rule.
- Each "screen" (Home, Browse, Task Detail, Tracking, etc.) is a plain
  JavaScript function defined inside `App()` that returns JSX — **not**
  separate React components. They're called directly as `{screenName()}`
  in the final render switch, not rendered as `<ScreenName/>` — this was
  also an explicit fix after a bug where calling them as components caused
  React to unmount/remount them on every state change.
- Navigation is a single string state variable (`scr`) plus a `tab` state
  for the three bottom-nav destinations (home/bookings/profile). There is
  no routing library, no navigation stack, no deep linking.
- **Correction:** "Back" behavior is **no longer** handled via the
  per-screen tracking variables described in earlier versions of this doc
  (`cameFrom`, `proProfileFrom`, `receiptFrom`, `helpFrom`). That pattern
  was replaced with one centralized system: `goTo(screen, forceOrigin,
  forTab)` records where a screen was opened from into a single `navFrom`
  map; `backFrom(screen, fallback)` is the single function every visible
  Back button calls to resolve where "back" actually goes, via a shared
  `peekBackDestination()` helper. An interactive, reversible edge-swipe
  gesture (drag from the left screen edge) was later added as a second
  entry point into this *same* system — it calls the identical
  `backFrom()`, never a separate navigation path. `SCREENS` (a `Set`) and
  `TRANSIENT_FLOW_SCREENS` (booking-flow/one-off-form screens excluded
  from tab-memory restoration) govern which screens exist and which are
  eligible to be "remembered" when switching tabs.
- Shared, reusable render helpers exist for repeated UI patterns: `trustBadge`/`trustLine` (Trust Score chip), `timeChips` (time preference selector), `addressPaymentCard` (default address/payment display), `photoRow` (inline photo picker), `subHeader` (standard light header with back arrow).

**Persistence — correction:** the previous version of this doc said "all
data is in-memory; nothing persists across a page reload." That is no
longer accurate. A shared `usePersistedState(key, initialValue, {version,
migrate, validate})` hook persists every major data domain independently
(jobs, addresses, cards, profile, notifications, notification/job
preferences, theme, draft bookings) to `localStorage`, each under its own
key with a `{__v, data}` version wrapper and a `validate` function that
sanitizes malformed/legacy data rather than crashing. This is also the
closest thing the prototype has to schema enforcement without TypeScript
— see the technical debt note below, which is refined rather than
resolved by this.

**Naming conventions:** camelCase for all state/functions; screen-render
functions named `xScreen` (e.g., `taskScreen`, `myhomeScreen`); data constants
in SCREAMING_SNAKE_CASE at the top of the file (`TASKS`, `PROS`, `TIME_PREFS`,
etc.).

**Design system implementation:** colors are five short-named constants
(`N`, `AM`, `BG`, `W`, `TX`, `TS`, `TM`, `BD`, `SC`, `SL`) defined once at the
top of the file and referenced everywhere — see §11 for actual values.

**Future backend architecture:** ❓ **OPEN QUESTION** — nothing has been
decided. No database, no auth, no API layer exists or has been designed.
When this becomes in scope, prior conversations casually referenced
Firebase (auth, real-time data, storage) and Stripe (payments) as
candidates, but these were suggestions made early on, not committed
decisions.

**Scalability goals:** ❓ Not yet defined.

**Cross-app data contract:** see `HAVEN_JOB_CONTRACT.md` (new, this update)
for the canonical job schema, status vocabulary, and transition-ownership
table shared between the Customer App and the Pro App. The two apps'
`makeJob()`/`SIM_JOBS` shapes and status vocabularies had already begun
diverging before this document existed (the Pro App's job feed already
ships an Inspection-Visit two-tier price display with no Customer App
equivalent at all) — that document is the fix, and should be updated in
the same turn as any future job-shape change on either side.

**Technical debt (known, accepted for now — corrected against actual code):**
- Single ~3,800-line file with no code-splitting. Acceptable for a
  prototype; would need to be broken into real components before
  production. (Previously listed as "~2,000 lines" — stale.)
- No TypeScript. **Partially mitigated, not resolved:** every persisted
  domain now runs through a `validate` sanitizer (see Persistence, above)
  and jobs are always reconstructed through `makeJob()`, so malformed data
  can't silently corrupt state the way pure convention-only shapes could.
  This catches bad data at the *persistence* boundary, not at write-time
  the way a type system would — a real schema/type layer remains future
  work, not done.
- ~~No automated tests of any kind.~~ **False as of this update** — see
  `audit.test.js`, 110 passing assertions. The suite itself has its own
  debt: it's a single hand-rolled script using deeply nested `setTimeout`
  callbacks for async sequencing (no real test framework), which has
  caused real development friction — see the async test-utility addition
  made alongside this correction pass.
- No real navigation library. **Partially superseded:** the fragile
  per-screen `cameFrom`-style tracking described in the previous version
  of this doc was replaced by the centralized `goTo`/`backFrom`/`navFrom`
  system described above, which is a real improvement, but it's still a
  hand-rolled string-based system, not a routing library — no deep
  linking, no browser history integration.
- ~~All data is in-memory; nothing persists across a page reload.~~
  **False as of this update** — see Persistence, above.
- **New since last full pass:** the Customer App and Pro App job/status
  shapes have measurably diverged (documented in `HAVEN_JOB_CONTRACT.md`).
  Not urgent to fix today, but worth resolving before either app writes
  much more lifecycle-adjacent code on either side.

---

## 11. UX Design System

**Colors** (as defined in code):

| Token | Hex | Usage |
|---|---|---|
| `N` (Navy) | `#1C2B3A` | Primary brand color — headers, primary text, dark cards, nav active state |
| `AM` (Amber) | `#F59E0B` | Primary accent — prices, CTAs, active selections |
| `BG` (Background) | `#F5F2ED` | App background, warm off-white |
| `W` (White) | `#FFFFFF` | Card backgrounds |
| `TX` (Text) | `#1C2B3A` | Primary text |
| `TS` (Text secondary) | `#5A6B78` | Secondary/supporting text |
| `TM` (Text muted) | `#9AAAB6` | Placeholder/disabled text |
| `BD` (Border) | `#E5DED4` | Default border/divider color |
| `SC` (Success) | `#059669` | Success states, completed badges, Trust Score high tier |
| `SL` (Success light) | `#ECFDF5` | Success background tint |
| Emergency red/orange | `#C2410C` text / `#FFF1EE` bg / `#FFD4C7` border | Used consistently for all Urgent/Emergency elements |
| Warning amber tint | `#92400E` text / `#FEF3C7` bg | Used for pending/waiting states, tips |

**Typography:** System font stack (`-apple-system, BlinkMacSystemFont,
'Segoe UI', Roboto, sans-serif`). No custom typeface has been introduced.
Weight scale used throughout: 400 (regular body), 500–600 (medium emphasis),
700 (headings/buttons), 800–900 (large numerals — prices, Trust Score).

**Spacing:** Not formalized into a token scale — spacing values are
hand-tuned per component (commonly 8/10/12/14/16/18/20px). ❓ Open question:
worth formalizing into a spacing scale before handoff to a real design system.

**Buttons:** Primary = amber fill, white text, bold, rounded (16–18px
radius), soft amber shadow. Secondary = white/transparent fill with a
1.5px border. Disabled/"coming soon" = muted gray text and background,
no shadow, `cursor: default`.

**Cards:** White background, 16–20px border radius, soft navy-tinted shadow
(`rgba(28,43,58,.06–.09)`), consistently used across almost every screen.

**Icons:** Emoji are used as the icon system throughout (🔧 📺 🏠 🚨 ✏️ etc.)
rather than an icon font or SVG icon set — a deliberate lightweight choice
for prototyping speed, not necessarily the final production approach. ❓ Open
question: whether emoji icons are intended to ship in production or are a
placeholder for a custom icon set.

**Animations:** Minimal — a pulsing icon on the "Looking for a pro" screen, a
typing-indicator bounce animation in chat, small `boxShadow`/color
transitions on selection states. No page-transition animation system.

**Loading states:** ❓ Not formally designed — the prototype has no real
network calls, so no loading spinners or skeleton states have been needed
yet. Will need design once a backend exists.

**Disabled states:** Consistent pattern established — muted gray text/background, no shadow, explicit "(coming soon)" or "Coming soon" label. Applied to: Call button, Sign out, Export/Home Report, Warranties/Manuals/Inspection Reports/Other document cards.

**Empty states:** Consistent pattern — icon + one to two sentences of plain-language explanation of what will appear and why, never just a bare icon. Applied to: Bookings (no jobs yet), My Home Service History, My Home Maintenance Suggestions, Receipts list.

**Errors:** ❓ Not designed. No form-validation error states, no network-error states exist yet (no network calls exist to fail).

**Accessibility:** ❓ Not yet audited. No explicit accessibility work (contrast ratios, screen-reader labels, tap-target sizing audit) has been done.

---

## 12. Brand

| Attribute | Current status |
|---|---|
| **Name** | "Haven" — explicitly a **temporary placeholder**, confirmed by you as likely to change before launch. Earlier naming exploration considered: Handled, Pronto, Doorstep, Clutch, Proxi, Nimble, Sorted, Crewly, ProDoor, ProNow, GoProxi, ProHQ, CalledPro, NearPro, ProReady, ProRun. No name has been finalized. |
| **Brand personality** | ❓ Not formally defined. Inferred tone from actual UI copy: calm, direct, competent, quietly premium — never cutesy, never alarmist even in the Emergency flow ("Keep it clean, not scary" was an explicit instruction). |
| **Tone/voice** | ❓ Not formally defined as a style guide. Observed pattern in existing copy: short sentences, plain language, no jargon, no exclamation-point marketing voice. |
| **Premium feel** | Achieved via restraint — muted warm palette, generous whitespace, no gradients-as-decoration (gradients are used sparingly and only on a few "special" cards: My Home, Pro Profile Trust Score, Home Report). |
| **What the brand should evoke** | ❓ Not formally defined — worth a dedicated brand session. Working hypothesis based on the name itself and the "medical record for the house" positioning: safety, permanence, quiet competence — a home's trusted record-keeper, not a gig-economy hustle app. |

---

## 13. Parking Lot

Ideas discussed (primarily via the ChatGPT product-strategy roadmap) but not
yet built, organized by the priority signal available. ❓ **All priority
labels below are inferred from original phasing language ("Phase 1/2/3") and
should be reviewed/reprioritized by you — they are not confirmed
decisions.**

### High Priority (originally "Phase 2")
| Idea | Description | Reason | Benefits | Drawbacks | Current decision |
|---|---|---|---|---|---|
| Real review-to-Trust-Score feedback loop | Reviews currently don't affect Trust Score | Trust Score is currently entirely static/fake | Makes Trust Score meaningful over time | Needs a real scoring algorithm decision | Deferred, explicitly "keep simulated for now" |
| Before/after photos on completed jobs | Pro uploads proof-of-work photos | Builds customer confidence, dispute resolution | Strengthens receipts/Home Report | Needs pro-side app to exist first | Not started |
| Saved appliance records (real data) | Brand/model/install date/warranty, user-entered | Currently placeholder text only | Core to "medical record for the house" vision | Needs a data-entry UX | Not started |

### Medium Priority (originally "Phase 2/3")
| Idea | Description | Reason | Benefits | Drawbacks | Current decision |
|---|---|---|---|---|---|
| Warranties / Manuals / Inspection Reports vaults | Real document storage for these categories | Documents section currently only supports Receipts | Completes the Documents vault vision | Needs file upload + storage (explicitly out of scope for now) | Placeholder only |
| Home Report export (PDF) | Combine service history, receipts, warranties, appliances into one exportable report | Useful for selling/renting a home | High perceived value | Needs real PDF generation, real data behind every section it summarizes | Placeholder card only, button disabled |
| Video estimates | Customer records a short video instead of/with photos | Helps pros assess jobs (e.g., leaks, noises) before accepting | Could improve accept rate & reduce mismatched jobs | Adds a step to booking, conflicts with speed principle unless kept fully optional | Not started |
| Smarter pro-matching (tools/skills/distance) | Match jobs to pros based on more than category | Improves marketplace quality | Better outcomes, less pro/customer mismatch | Needs a real pro-side data model and matching backend | Not started |

### Low Priority
| Idea | Description | Reason | Benefits | Drawbacks | Current decision |
|---|---|---|---|---|---|
| Seasonal maintenance cards | Spring/Summer/Fall/Winter suggested services | Nice-to-have engagement driver | Encourages repeat bookings | Low urgency compared to core trust/speed work | Not started |
| "Pro tools / what's in my truck" | Pro-side equipment list used for matching | Powers smarter matching (see above) | Improves match quality | Depends entirely on a pro-side app existing first | Not started |

### Experimental
| Idea | Description | Reason | Benefits | Drawbacks | Current decision |
|---|---|---|---|---|---|
| Real AI diagnosis (photo + text) | Replace keyword-matching with a real model | Current matching is simulated | Much stronger differentiator, matches original product vision closely | Real cost/complexity, needs a backend and a model | Explicitly simulated for now by design |

### Future Vision (originally "Phase 3")
| Idea | Description | Reason | Benefits | Drawbacks | Current decision |
|---|---|---|---|---|---|
| Home Care Plan subscription | Monthly plan: priority booking, discounted maintenance, reminders, report export, dedicated support | Recurring-revenue business model idea | Predictable revenue, deepens retention | Requires most other Home/Trust features to exist first | Explicitly "design the structure so it can be added later," not built |
| Marketplace supply strategy (city-by-city launch, 10–15 core services first) | Business/ops decision, not a code feature | Avoids being "thin" across too many categories at launch | Higher service quality per category at launch | Requires real pro-recruitment planning | Business decision, not yet made |
| Separate Pro-side app | Full app for pros to accept/manage jobs, like Uber Driver | Explicitly decided this should be separate from the customer app, not a mode-switch within it | Cleaner UX for both sides | Doubles the engineering surface area | Decided in principle (separate app), not started |

---

## 14. Product Roadmap

❓ **This roadmap is a proposed ordering based on what unlocks the most user
value with the least new complexity — it is a draft for your review, not a
committed plan.**

**Immediate (next 1–2 slices):**
- Resolve the open questions in §17 that block further product decisions (mission statement, brand name finalization, persona definition)
- Continue hardening the existing prototype (bug passes, navigation audits) as new features get added, since this has repeatedly surfaced real bugs

**Short-term:**
- Decide and scope the real review → Trust Score feedback loop
- Decide the actual data model for Appliances (real user-entered data vs. continued placeholder)
- Formalize the design system (spacing scale, icon strategy) before any visual redesign work

**Medium-term:**
- Warranties/Manuals/Inspection Reports real data model (once file handling is in scope)
- Home Report export (depends on the above being real, not placeholder)
- Begin architecture planning for a real backend (auth, persistence, API)

**Long-term:**
- Pro-side app
- Real payments integration
- Real AI-based diagnosis
- Home Care Plan subscription model
- Multi-market launch strategy

---

## 15. Engineering Rules

These are standing rules for all future work on Haven, not suggestions:

1. **Never duplicate code.** If a UI pattern (a card, a badge, a button style) appears more than twice, it becomes a shared render helper (see §10 for existing examples: `trustBadge`, `timeChips`, `addressPaymentCard`, `subHeader`).
2. **Favor reusable components** over copy-pasted JSX blocks, even in a single-file prototype.
3. **Refactor when worthwhile** — but not preemptively. The single-file architecture is an accepted, intentional tradeoff for prototype speed (see §10), not an oversight to "fix" without being asked.
4. **Avoid unnecessary complexity.** Don't add a picker, a modal, or a new screen when a simpler in-place UI pattern solves the same problem (see §7's explicit rejection of a separate review screen).
5. **Maintain production-quality architecture within the constraints of a prototype** — e.g., the Rules-of-Hooks discipline and the `cameFrom`-style navigation tracking are treated as real engineering standards, not prototype shortcuts, because they've already caused real bugs when violated.
6. **Challenge poor engineering decisions** — including ones I (Claude) have made. If a pattern causes a second bug, it should be reconsidered, not patched again the same way.
7. **Optimize for long-term maintainability** within the current single-file constraint — clear section comments, consistent naming, and this specification document are the primary tools for that until real modularization happens.

---

## 16. Known Issues

**Architecture-level:**
- Entire app is a single ~2,000-line file. Fine for a prototype; a real refactor into components/screens/hooks will be needed before production.
- No automated tests exist anywhere.
- No TypeScript — job/pro/task data shapes are implicit and only documented here, not enforced in code.
- All state is in-memory; a page reload loses everything.

**UX-level bugs found and fixed during development (recorded so they aren't reintroduced):**
- A `useState` hook was once placed inside a nested render function instead of at the top of the component, causing a Rules-of-Hooks crash (Notifications screen). Fixed; the "all hooks at the top" rule (§10, §15) exists specifically because of this.
- Screen-render functions were briefly called as JSX components (`<HomeScreen/>`) instead of plain function calls (`{homeScreen()}`), causing React to unmount/remount them on every state change. Fixed; now a standing convention.
- The Help screen's back button once used `setScr(helpFrom)` where `helpFrom` could hold the literal string `"profile"` — but `"profile"` is a `tab` value, not a valid `scr` value, causing a blank screen. Fixed via a dedicated `closeHelp()` resolver function. This is recorded because the same category of mistake (confusing a `tab` value with a `scr` value) is an easy one to repeat.
- A custom-job entry tile inside Browse was briefly mislabeled with `cameFrom("home")` instead of `cameFrom("browse")`, causing its Back button to return to the wrong screen. Fixed.

**Current, unresolved limitations (by design, not bugs):**
- "Describe the Problem" is keyword-matching, not real AI.
- Trust Score, verification badges, and pro metrics are all static/hardcoded.
- Reviews do not affect Trust Score.
- Maintenance Suggestions are not based on real elapsed time.
- Payment and address data used on a receipt is a snapshot taken at booking time — if a customer's default payment method changes later, old receipts correctly still show what was used at the time, but this has not been explicitly tested end-to-end for edge cases (e.g., deleting a card after a job that used it — the receipt would still show the old brand/last4 text, which is correct behavior, but not yet verified against a scenario where the *address* used no longer exists in the saved list either).

**Paused work:**
- An Expo/React Native port for iPhone testing via Expo Go was built and then paused at your explicit instruction after repeated SDK version/dependency conflicts (SDK 51 → 54 migration issues, a Hermes "private properties are not supported" runtime error traced to dependency version mismatches). It is not part of the active codebase and should not be resumed without an explicit decision to do so.

---

## 17. Open Questions

This is the running list referenced throughout the document. Answering any
of these will update the relevant section(s) above in the same turn.

**Foundational / strategic:**
1. What is Haven's official mission statement? (Draft proposed in §1 — needs your edit or approval.)
2. Is "Haven" the final name, or still actively being replaced? If still open, is there a target decision date?
3. Who are Haven's actual user personas — real detail (goals, frustrations, what earns their trust), not the inferred categories in §4?
4. What is the actual monetization model going forward? (Earlier conversations referenced a ~20% platform take rate, background-check fees, and a possible pro subscription tier — none of this has been revisited or confirmed since.)
5. What market(s) does Haven launch in first, and does the "10–15 core services first" supply strategy still hold?

**Brand:**
6. What should Haven's brand personality/tone/voice be, formally? (§12 has only inferred, unconfirmed signals.)
7. Are emoji acceptable as the permanent icon system, or are they a placeholder for a custom icon set?

**Product/roadmap:**
8. Should reviews start feeding into Trust Score now, or remain simulated indefinitely?
9. Should Appliances move from placeholder data to real user-entered records next, or is Documents (warranties/manuals) a higher priority?
10. Is the Home Report export (PDF) something to scope soon, or genuinely long-term?
11. Is a Pro-side app still planned as "separate," and if so, when does it become active work?

**Engineering:**
12. At what point should the single-file prototype be refactored into a real component architecture — is there a trigger condition (e.g., "once a backend is added") or should this start now?
13. What backend stack is actually intended (Firebase was mentioned early on, informally — is that still the working assumption)?
14. Is there a target device/browser support matrix, or is "modern browsers + eventual native app" sufficient for now?

**Design:**
15. Should spacing be formalized into a token scale before further visual work?
16. Is there an accessibility bar (WCAG level, etc.) this needs to hit before launch?

**Business/Marketplace (added in v0.2 review pass):**
17. How does Haven actually solve the marketplace chicken-and-egg problem (§21) — seed supply first in one city, seed demand first, or something else?
18. What are the actual supply-acquisition (pro recruitment) and demand-acquisition (customer growth) channels and plans (§21)?
19. Does the pro-side app (§13, §19) need to exist before any real pro recruitment can begin, or can supply be seeded manually first?
20. Should target values be set for any of the Success Metrics (§24) yet, or only once real usage data exists to calibrate against?

---

## 18. North Star

**The single guiding objective:**

> **Haven removes uncertainty from home services.**

**The problem Haven ultimately solves.** Getting something fixed, installed,
cleaned, or maintained in your home has traditionally required tolerating
four unknowns at once: *when* will someone show up, *what* will it actually
cost, *can I trust* the person entering my home, and *will the work* be done
well. Every existing alternative (Google search, word of mouth, Yelp,
quote-based marketplaces) forces the customer to resolve some or all of these
unknowns themselves — calling multiple people, negotiating price, hoping a
stranger is trustworthy, and finding out about quality only after the job is
done. Haven's reason to exist is to remove all four unknowns **before** the
customer commits.

**The four uncertainties Haven removes:**

| Uncertainty | What the customer normally faces | How Haven removes it |
|---|---|---|
| **Time** | "When will someone actually show up?" — vague quote-request timelines, voicemail tag, no-shows | Fixed time-preference options shown at booking; Emergency Mode guarantees a bounded window (within 6 hours); live tracking once a pro accepts |
| **Price** | "What is this actually going to cost?" — quotes, hourly estimates that balloon, hidden fees | Fixed price shown before booking for every catalog service; any surge/emergency fee is itemized and visible at every step, never hidden until checkout |
| **Trust** | "Is this a stranger I can safely let into my home?" — no way to verify who's coming | ID verification, background checks, insurance, and a Trust Score (not just a star average) surfaced at every point a pro is shown |
| **Quality** | "Will the work actually be done right?" — no record, no recourse, word-of-mouth reputation only | Trust Score metrics (on-time rate, completion rate, would-hire-again rate), receipts, and a permanent Service History create both accountability in the moment and a lasting record afterward |

**The governing test for every future feature:** before building anything,
ask which of the four pillars (Time, Price, Trust, Quality) it strengthens.
If a proposed feature doesn't clearly strengthen at least one of them, it
does not belong in Haven regardless of how common it is in other apps in this
category — this is the same discipline already expressed in §3's product
principles ("every feature must earn its place"), now given a concrete test
to apply it against.

---

## 19. Competitor Analysis

❓ **Note on sourcing:** the analysis below is drawn from general,
well-established public knowledge of how these companies operate (business
model, common customer complaints, market positioning). It is strategic
judgment for internal planning, not sourced/verified reporting — ownership
structures, pricing, and specific policies can change, and this section
should be refreshed with a live check before being used in anything
external-facing (investor materials, competitive claims in marketing, etc.).

| Competitor | Strengths | Weaknesses | Why customers use them | Where customers get frustrated | How Haven should differentiate | Worth borrowing | Intentionally avoid |
|---|---|---|---|---|---|---|---|
| **TaskRabbit** | Large tasker supply in major metros; broad task categories; owned by IKEA (furniture assembly synergy); simple task-posting UX | Primarily **hourly pricing**, not fixed; taskers often under-informed about the job before arriving (title-only visibility); quality varies widely | Fast for common small tasks (furniture assembly, moving help, mounting) | Cost anxiety from open-ended hourly billing; taskers arriving without full context | Fixed pricing as the default, not the exception; photos + description visible to the pro *before* they accept, not after | The core "hire an independent tasker for a small job" concept itself; category breadth | Hourly-only pricing as the primary model |
| **Thumbtack** | Huge category breadth (home services + many other professional services); strong SEO/lead-gen presence | **Quote-request model** — customer must wait for multiple pros to respond with bids; no fixed pricing; can feel like being sold to | Customers who want to compare multiple bids for larger/more complex jobs | Slow — waiting for quotes; being contacted by many pros at once; no price transparency upfront | Instant fixed pricing removes the entire "wait for quotes" step for jobs that don't need custom bidding | Category breadth (long-term, not launch) | Lead-gen/quote-request as the primary booking mechanism |
| **Angi** (formerly Angie's List, merged with HomeAdvisor) | Long-standing brand recognition; large reviews database; broad contractor network | History of a paid-membership/lead-purchase model that put cost burden on pros in ways that shaped (and sometimes hurt) service quality incentives; mixed reputation on lead quality | Homeowners researching bigger jobs (renovations, larger contractor work) | Pros paying for leads that don't convert; customers fielding many inbound sales calls | Haven's take rate comes from completed jobs, not from selling leads to pros regardless of outcome — aligns incentives toward actually getting hired and doing good work | Long-standing trust-building through reviews at scale (long-term aspiration) | Pay-per-lead monetization that misaligns pro incentives |
| **HomeAdvisor** | (Now merged into Angi) Broad contractor database; established for bigger home-improvement projects | Same lead-gen model critique as Angi; historically criticized for lead quality and aggressive matching/sales practices | Larger, less routine home projects (renovations, big-ticket installs) | Feeling "sold to" rather than helped; unclear pricing until a contractor visits | Haven stays fixed-price, no in-home sales-quote step for the job categories it serves | N/A — mostly a cautionary example | Multi-contractor bidding wars for simple jobs |
| **Handy** (owned by Angi) | Simple booking flow for cleaning/handyman work; fixed pricing on some categories (closer to Haven's model) | Reputation for inconsistent pro quality and customer-service responsiveness when issues arise; narrower category focus (cleaning-heavy) | Customers wanting a quick, simple booking for common recurring services (cleaning especially) | Inconsistent pro quality; difficulty getting support when a job goes wrong | Trust Score + receipts + a permanent Service History give Haven a stronger accountability trail than a simple booking confirmation | Fixed-price simplicity for common recurring jobs — validates Haven's core model | Narrow category focus; weak post-job support loop |
| **Yelp** | Massive, trusted review database; strong for *research* before choosing anyone | **Not a booking platform** — no fixed pricing, no scheduling, no payment; just a directory | Reading reviews before calling someone directly | Still have to call around and negotiate after finding a name on Yelp | Haven collapses "research a pro" and "book a pro" into one step — no separate discovery-then-contact phase | The credibility power of a real review corpus, long-term | Directory-only model with no transaction layer |
| **Google Search** | Universal starting point; local business listings, reviews, ads all in one place | No structure at all — customer has to build their own multi-step process (search → call → wait → compare) from scratch every time | The default first move for anyone with a problem, out of habit | The exact broken process Haven's mission statement explicitly names: "Google → call 5 contractors → leave voicemails → wait for quotes → compare prices → hope someone shows up" | Haven *is* the replacement for this entire multi-step process, collapsed into one app | Nothing structural — Google is the baseline Haven is measured against | N/A |
| **Facebook Marketplace** | Free, informal, hyperlocal; often cheaper because there's no platform fee | **No vetting whatsoever** — no background checks, no fixed pricing, no protection if something goes wrong | Price-sensitive customers willing to trade safety/structure for a lower cost | No recourse if a job goes badly; no way to verify who you're actually letting into your home | Haven's entire trust layer (verification, Trust Score, receipts) is the direct opposite of Marketplace's zero-structure approach | Nothing structural — represents the un-vetted end of the spectrum Haven is positioned against | Anonymous, unverified transactions |
| **Nextdoor** | Real neighbor recommendations feel more trustworthy than a stranger's review; hyperlocal | Entirely informal — no booking, no pricing structure, no accountability beyond social reputation; recommendations are inconsistent and un-scalable | Finding a "guy someone in the neighborhood used and liked" | No way to actually book, price, or verify anything — still ends in a phone call and negotiation | Haven can absorb the *reason* people trust Nextdoor recommendations (a known, vetted, local provider) into Trust Score and reviews, without the manual, ask-around friction | The instinct that a neighbor's endorsement carries real weight — informs how Trust Score/reviews should be framed | Purely informal, unstructured referral as the entire trust mechanism |

**Cross-cutting differentiation summary:** every competitor above forces the
customer to resolve at least one of the four North Star uncertainties (§18)
themselves — usually Price (quote-based competitors) or Trust (informal/
unverified competitors like Facebook Marketplace and Nextdoor), sometimes
both. Haven's structural bet is that **removing all four simultaneously**,
rather than optimizing one at the expense of another, is the actual
opportunity — no major competitor currently does this end-to-end.

---

## 20. Product Decision Log

A permanent, append-only record of major product decisions. Entries are
never deleted, even if a decision is later reversed — a reversal gets its own
new entry that references the original.

| # | Decision | Reasoning | Tradeoffs | Why it was chosen |
|---|---|---|---|---|
| 1 | No dedicated "review before posting" confirmation screen | Booking speed is the top priority; a separate review screen adds a tap for information the booking screen already displays | Slight risk that a user misses a detail if they don't scroll; mitigated by keeping the booking screen's layout calm and complete | Matches "every feature must earn its place" (§3) — an extra screen that only re-displays existing information doesn't earn its place |
| 2 | Booking flow optimized for speed (merge Task Detail + Photo screen into one) | Original flow required Home → Task Detail (fill, tap Continue) → Photo screen (add/skip, tap Post) → Posted — two taps, two screens, before a job was even posted | Slightly denser single screen; mitigated with compact chip-style time selector and an inline (not full-screen) photo row | Directly serves the "under 60 seconds to post a job" target in §1/§2 |
| 3 | Smart defaults for time, address, and payment | Forcing a choice on every field adds friction even when the obvious answer is already known | Requires a visible, low-friction way to change the default (the "Change" link pattern) so defaults don't feel like the app deciding *for* the user | Serves Product Principle #4 (§3): "defaults eliminate decisions" |
| 4 | Emergency has its own dedicated flow, separate from normal booking | Urgent situations have different needs (bounded time windows, different fee structure, calmer/less-scary framing) than routine bookings | Adds a second timing system (`EMERGENCY_TIME_PREFS` alongside `TIME_PREFS`) to maintain | The four-uncertainties framing (§18) makes clear that *Time* is the dominant anxiety in an emergency — a dedicated flow that guarantees a bounded window addresses that directly |
| 5 | Receipts are automatically generated from job data, not manually created or stored separately | A receipt is just a formatted view of data that already exists on a completed job (service, price, pro, address, payment snapshot) | If job data is ever restructured, receipt rendering must be updated in lockstep since there's no independent receipt record | Avoids duplicating data (Engineering Rule #1, §15) while still delivering a "polished receipt screen" per product requirement |
| 6 | Home Report is intentionally deferred (placeholder card only) | Home Report is a *summary* of Service History + Receipts + Warranties + Appliances + Maintenance — several of those don't have real data models yet (Warranties/Manuals in particular) | Customers see a "Coming soon" card rather than a working feature | Building the export before its underlying data sources are real would produce a report that's mostly empty or fake — the placeholder is honest about what exists today |
| 7 | Documents foundation (Receipts) built before cloud storage or file upload | Receipts can be fully real (generated from existing job data) without needing any file storage system at all; Warranties/Manuals/Inspection Reports genuinely need file upload + storage, which is explicitly out of scope for now | Documents section currently looks "half real, half placeholder" | Ships the part that can be *actually* real now, rather than waiting for file infrastructure to ship anything at all |
| 8 | Placeholder/unbuilt buttons are made visibly disabled instead of fake no-ops | Several buttons (Call, Sign out, Export Home Report) originally did nothing when tapped, with no visual indication — this reads as broken, not unbuilt | None significant — purely a labeling/styling fix | An app that looks broken erodes trust faster than an app that's honest about what's not built yet (directly ties to the *Trust* pillar in §18, applied internally to the product's own credibility) |
| 9 | "Custom" renamed to "Not Listed?" | "Custom" didn't clearly communicate the feature's purpose from a customer's perspective; "Not Listed?" directly answers the question a customer has at that moment ("I don't see my job in the catalog") | None | Wording should describe the customer's situation, not the internal mechanism (a "custom" job record) |
| 10 | Urgent and Not Listed given equal visual weight (§ Home Screen Polish) | The original "Not Listed?" card used a solid dark navy background, which visually read as the *default/selected* option — incorrectly implying priority over Urgent | None — pure visual correction | The Home screen is meant to present three genuinely equal primary paths (Describe, Urgent, Not Listed); no option should look pre-selected |
| 11 | Haven should feel premium, calm, and simple — including in the Emergency flow | Urgent/emergency UX in many apps leans into alarming red, exclamation points, and urgency-as-anxiety; explicit instruction was "keep it clean, not scary" | Slightly softer visual urgency than some competitors might use | Calm confidence is a core brand attribute (§12) — even urgent moments shouldn't make the customer more anxious than necessary |
| 12 | All React hooks placed at the top of the single component, never inside nested render functions | A `useState` call placed inside a nested render function caused a real Rules-of-Hooks crash (Notifications screen) | Requires discipline as the file grows — no structural enforcement beyond convention | Prevents a real, previously-experienced class of bug from recurring (§10, §16) |
| 13 | Screen-render functions called as plain functions (`{screenName()}`), never as JSX components (`<ScreenName/>`) | Calling them as components caused React to unmount/remount them on every state change, which broke local state and caused instability | None once understood — purely a correctness fix | Same category as #12 — a previously-experienced bug is now a standing rule, not a one-time patch |
| 14 | Per-screen "came from" tracking (`cameFrom`, `proProfileFrom`, `receiptFrom`, `helpFrom`) instead of a single global back-stack | Several screens are reachable from more than one place (e.g., Help can be opened from Profile or from Tracking) and need to return to the correct origin, not a fixed default | Manually maintained per-screen; has caused at least two real bugs when a new entry point forgot to set the tracking variable correctly | A real navigation-stack library would be the "correct" long-term answer, but was judged out of scope for the current single-file prototype; the lightweight pattern works as long as it's applied consistently (§16 documents where it wasn't) |
| 15 | Reviews do not currently feed into Trust Score | Trust Score is currently fully simulated/static; wiring reviews into it requires deciding a real scoring algorithm, which hasn't happened | Trust Score can feel disconnected from the reviews a customer just submitted | Explicit instruction to "keep Trust Score simulated/static for now" rather than build a half-considered scoring formula |
| 16 | Expo/React Native mobile port paused indefinitely | Repeated SDK version and dependency conflicts (SDK 51 → 54 migration, Hermes runtime errors) were slowing down core product development more than the iPhone-testing benefit was worth | The prototype currently has no native mobile testing path | Explicit instruction to restore focus to the browser prototype; mobile testing can be revisited later as a separate, deliberate effort rather than an ongoing parallel maintenance burden |


---

## 21. Marketplace Strategy

❓ **Business-strategy caveat:** the specifics below (take rate, launch
sequencing) reflect the *most recent explicit numbers discussed* early in
this project (a ~20% platform take rate; a 10–15 core service launch list)
plus general two-sided-marketplace principles. None of this has been
re-confirmed recently and should be treated as a draft business strategy,
not a locked-in plan — see §17 Open Question #4/#5.

**Launch strategy.** Rather than launching with the full 51-service catalog
at once, the working plan (from early product strategy discussions) is to
launch with a focused list of 10–15 high-frequency services — TV mounting,
furniture assembly, smart lock install, doorbell camera install, faucet
replacement, toilet repair/install, light fixture replacement, ceiling fan
install, drywall patch, deep cleaning, lawn mowing, junk removal, pressure
washing, gutter cleaning, minor repairs — and expand category breadth only
as real pro supply can support it. The app can *show* the full catalog, but
operationally the goal is depth (real pro coverage) over breadth (many
categories with only one or two available pros).

**Supply acquisition (pros).** ❓ Not yet planned in detail. Open questions
include: recruitment channels, background-check vendor (Checkr was mentioned
informally), onboarding flow, and whether a pro-side app (§13 Parking Lot)
needs to exist before any real pro recruitment can begin.

**Demand acquisition (customers).** ❓ Not yet planned. No marketing,
acquisition-channel, or growth strategy has been discussed in this project
so far.

**Quality control.** The Trust Score system (§9) is the primary designed
mechanism for this, but it is currently static/simulated. A real quality
control system will need: (a) a real scoring algorithm fed by actual
completion/on-time/review data, (b) a process for removing or flagging
underperforming pros, and (c) a review moderation approach. None of this
exists yet — it's a direct dependency of Product Decision #15 (§20) being
resolved.

**Geographic expansion.** ❓ Not yet planned. Single-market launch is implied
by the "avoid being thin across categories" principle, but no target city or
expansion sequencing has been discussed.

**Commission strategy.** The working assumption from early discussions: ~20%
platform take rate from the pro's payout (customer pays the full listed
price; the pro receives roughly 75–80%). Additional revenue levers discussed
but not built or confirmed: background-check fees charged to pros,
same-day/ASAP surge (currently implemented as a customer-facing fee — see
§5 — but revenue-split treatment of that fee is undecided), and a possible
pro subscription tier for reduced commission + priority placement. ❓ None of
this is implemented in the prototype (there is no real payment processing —
see §5/§9) and should be treated as strategy-stage only.

**Pricing philosophy.** Fixed pricing is a structural commitment, not just a
UX choice — see §18/§19. Custom Jobs are the deliberate escape valve for
anything that can't be fixed-priced (the customer sets a budget instead of
the platform setting a price), which keeps the "no quote requests" principle
intact even for jobs outside the standard catalog.

**How Haven avoids the marketplace chicken-and-egg problem.** ❓ Not yet
solved or even fully discussed. The general two-sided-marketplace pattern
(seed supply manually in a single city before opening demand broadly, or vice
versa) has not been chosen. This is one of the most important unresolved
strategic questions in the entire document and should be prioritized in a
future business-strategy session — flagged as a new open question below.

---

## 22. Trust Flywheel

Every completed job is designed to compound into more long-term value for
Haven than the transaction itself — this is the mechanism by which Haven
becomes more valuable to a customer the longer they use it, rather than
staying a one-off transactional tool.

```
                    ┌─────────────────┐
                    │     BOOKING      │
                    │  (fixed price,   │
                    │  vetted pro)     │
                    └────────┬─────────┘
                             │ job completes
                             ▼
                    ┌─────────────────┐
                    │     RECEIPT      │
                    │ (auto-generated, │
                    │ permanent record)│
                    └────────┬─────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ SERVICE HISTORY  │
                    │ (timeline, all   │
                    │ jobs ever done)  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  MAINTENANCE     │
                    │  SUGGESTIONS     │
                    │ (proactive, not  │
                    │  requested)      │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    DOCUMENTS     │
                    │ (receipts today; │
                    │ warranties/      │
                    │ manuals later)   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   HOME REPORT    │
                    │ (everything above│
                    │ combined into one│
                    │  exportable view)│
                    └────────┬─────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ CUSTOMER TRUST   │
                    │ ("Haven remembers│
                    │  my home for me")│
                    └────────┬─────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ REPEAT BOOKING   │
                    │ (lower friction  │
                    │ than a first-time│
                    │    customer)     │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ HIGHER-QUALITY   │
                    │   MARKETPLACE    │
                    │ (more data feeds │
                    │ better Trust     │
                    │ Score, matching, │
                    │ and pro quality) │
                    └────────┬─────────┘
                             │
                             └──────────────┐
                                            │
                    (loops back into more bookings,
                     each one strengthening the record
                     further — the flywheel effect)
```

**Why this is a flywheel and not just a feature list:** each stage doesn't
just serve the customer in the moment — it makes the *next* booking easier
and the *platform* smarter. A customer with three completed jobs and a
populated Service History has less reason to comparison-shop elsewhere next
time (their record lives in Haven, not anywhere else), and Haven has more
real data (once Trust Score is wired to real outcomes per Product Decision
#15) to make better matches. This is the mechanism by which Haven is meant to
become "the medical record for the house" (§1) rather than staying a
one-off booking tool — and it's the primary argument for why My Home (§8)
and Documents (§8) are core product, not a peripheral feature.

---

## 23. AI Strategy

Every AI capability that could plausibly belong in Haven, organized by
realistic time horizon. **Aspirational vs. realistic is called out
explicitly for each — this section should not be read as a committed
roadmap.**

### Near-term (realistic within the current product's natural next steps)
| Capability | Current state | What "real" would require |
|---|---|---|
| **Problem diagnosis** (Describe the Problem) | Simulated via keyword-matching (`KEYWORD_MAP`, scored substring matching) | Replacing the matching engine with a real small NLP model or an LLM call against the service catalog — a comparatively contained scope since the catalog and matching *interface* already exist |
| **Customer support** (chat) | Fully simulated with canned replies | Wiring the existing Help chat UI to a real LLM-backed support agent — again, the interface already exists, only the backend intelligence is missing |

### Medium-term (plausible, but each requires real infrastructure first)
| Capability | Current state | What "real" would require |
|---|---|---|
| **Photo analysis** | Photos are collected at booking (real device photos) but never analyzed — purely stored/displayed | A vision model to assess job photos (e.g., confirm "this is a P-trap leak" from an actual photo, not just typed text) — meaningfully harder than text diagnosis, and was explicitly discussed early on as a "Phase 2+" idea, not a near-term one |
| **Quote prediction** (for Custom Jobs) | Customer sets their own budget with no guidance | Suggesting a realistic budget range based on similar past Custom Jobs — needs a real historical dataset to train or ground against, which doesn't exist yet |
| **Maintenance prediction** | Currently rule-based/simulated (§8 Maintenance Suggestions — fixed rules like "gutter cleaning → suggest again in 6 months") | Real prediction would use actual elapsed time, regional seasonality, and possibly appliance data — a natural evolution of the existing simulated rules, not a rebuild |
| **Scheduling optimization** | None — time slots are simply customer-selected preferences with no real routing/dispatch logic | Requires real pro location data, a real pro-side app, and a dispatch algorithm — depends entirely on the Pro App existing first (§13) |

### Long-term (aspirational, dependent on scale and data that doesn't exist yet)
| Capability | Why it's long-term |
|---|---|
| **Video analysis** | Harder than photo analysis; needs real infrastructure for video upload/processing that doesn't exist and wasn't prioritized even at the UI level yet |
| **Fraud detection** | Only becomes meaningful at real transaction volume and with real payment processing — neither exists yet |
| **Knowledge graph** (connecting appliances, warranties, service history, and maintenance intelligently) | Depends on Documents/Appliances moving from placeholder to real structured data first (§8, §20 Decision #7) |
| **Home intelligence** (proactively understanding a specific home's needs — age, systems, climate, usage patterns) | The furthest-out vision, directly downstream of the Trust Flywheel (§22) actually running at scale for years — this is what "medical record for the house" fully matured looks like, not a near-term buildable feature |

**Governing principle for AI work:** every AI feature should be evaluated
against the same North Star test (§18) as any other feature — does it
reduce uncertainty around Time, Price, Trust, or Quality? "Problem diagnosis"
clearly does (Time + Quality of match); "video analysis" is farther from an
obvious uncertainty it resolves and should be treated with more scrutiny
before investing in it, even once it becomes technically easy.

---

## 24. Success Metrics

❓ **No specific numeric targets have been set for any of these** — the list
below defines *what* Haven should measure and *why*, not target values. Target
values should be set once there's real usage data to calibrate against.

| Metric | Why it matters |
|---|---|
| **Average booking time** (open app → job posted) | The single most direct measurement of the Simplicity → Speed → Money philosophy (§2). The explicit design target discussed throughout this project is under 60 seconds — this metric is how that target would actually be verified against real usage, not just prototype walkthroughs. |
| **Time to first pro acceptance** | Measures the *Time* uncertainty (§18) from the customer's perspective after posting — a slow time-to-acceptance undermines trust in the platform even if the eventual job goes well. |
| **Booking conversion rate** (started a booking flow → actually posted) | Reveals friction points in the booking screen itself — a low conversion rate here would be a direct signal that speed optimization work (§7, §20 Decision #2) isn't sufficient or that a default is wrong. |
| **Repeat customer rate** | The direct measurable output of the Trust Flywheel (§22) actually working — if customers aren't returning, the flywheel isn't spinning regardless of how good any individual feature is. |
| **Customer lifetime value (LTV)** | Ties directly to the commission strategy (§21) and justifies investment in retention-oriented features (My Home, Documents, Home Report) versus pure acquisition spend. |
| **Revenue** | Standard business health metric; only meaningful once real payments exist (§9, §21). |
| **Cancellation rate** | A proxy for both *Trust* (did the customer lose confidence before the job even happened?) and marketplace *Quality* (are pros accepting jobs they then can't fulfill?). |
| **Trust Score distribution** (across the pro base) | Once Trust Score is wired to real data (§20 Decision #15), this becomes the primary marketplace health metric — a distribution skewing low signals a supply-quality problem before it shows up in customer complaints. |
| **Average review score** | A simpler, more traditional quality signal to track alongside Trust Score, useful specifically because it's easy to compare against competitor benchmarks (most of whom only have this metric — see §19). |
| **NPS (Net Promoter Score)** | Captures overall sentiment in a way none of the operational metrics above can — particularly important for validating whether the "premium, calm, trustworthy" brand feel (§12) is actually landing with real customers. |
| **Marketplace liquidity** (% of posted jobs that get accepted by a pro within a reasonable window, by category and geography) | The most important *early* marketplace-health metric — directly measures whether the chicken-and-egg problem (§21) has actually been solved in a given market before expanding further. |

---

## 25. Things We Refuse To Do

Product principles about what Haven will *not* do, and why each one exists.
These are treated with the same weight as the "must earn its place" rule in
§3 — a refusal is not just a style preference, it's a filter against
becoming any of the competitors Haven is explicitly positioned against (§19).

| Refusal | Why it exists |
|---|---|
| **No hidden pricing.** | Directly resolves the *Price* uncertainty (§18). This is the single clearest line separating Haven from Thumbtack/Angi/HomeAdvisor-style quote-based competitors (§19). |
| **No unnecessary screens.** | Every screen or tap that doesn't earn its place works against the core Simplicity → Speed → Money philosophy (§2) and the explicit "under 60 seconds" target. Product Decision #1/#2 (§20) are the concrete precedent for this refusal. |
| **No dark patterns.** | Trust (§18) is a structural product pillar, not a marketing claim — a platform that manipulates its own customers to boost a metric is incompatible with being "the trusted operating system for home ownership" (§1). |
| **No overwhelming interfaces.** | Directly tied to Core Philosophy's "premium experience" pillar (§2) and enforced concretely throughout My Home (§8), which was repeatedly described as needing to feel like "a calm home dashboard, not an admin database." |
| **No quote requests for common jobs.** | The defining structural difference from Thumbtack/Angi/HomeAdvisor (§19). Custom Jobs are the deliberate, narrow exception — even there, the customer sets a budget rather than waiting for competing bids. |
| **No feature bloat.** | Every feature must strengthen at least one of the four North Star pillars (§18) — this is the concrete test that prevents bloat, rather than a vague aspiration. |
| **No sacrificing speed for complexity.** | Directly informed Product Decision #2 (§20) — the Task Detail + Photo screen merge is the clearest example of choosing speed over a more "complete-feeling" multi-step flow. |
| **No unnecessary notifications.** | ❓ Not yet tested in practice (no real push infrastructure exists — §11), but the principle follows from the same "calm, premium" brand attribute (§2, §12) — notifications should respect the customer's attention, not exploit it for engagement metrics. |
| **No fake or silently-broken UI.** | Product Decision #8 (§20) — every placeholder is visibly disabled with a "Coming soon" label rather than a button that does nothing. An app that feels broken erodes the same Trust pillar (§18) the entire product is built to establish. |

---

## 26. Long-Term Product Vision (Five-Year Horizon)

*Focused entirely on the customer experience — not company valuation, revenue,
or market share.*

Five years in, using Haven doesn't feel like using a marketplace app anymore
— it feels like having a competent, quietly trustworthy relationship with
your own home.

**The homeowner** no longer thinks "who do I call?" when something breaks.
They open Haven, describe what's wrong in plain language (or it's already
obvious from the home's own maintenance history that something is due), pick
a time, and it's handled. They've stopped comparison-shopping elsewhere
because Haven already knows their home better than a new provider ever
could — their address, their appliance ages, what's been done before, what
worked well and what didn't.

**The home itself** has a real, continuously growing record — not a folder of
scattered paper receipts and half-remembered contractor names, but one place
that knows every appliance's install date and warranty status, every repair
ever made, every pro who did the work and how it went.

**The service history** reads less like a transaction log and more like a
biography of the house — when the water heater was replaced, who repainted
the living room and what color, when the gutters were last cleaned, all
retrievable in seconds instead of "I think it was a couple years ago?"

**Documents** — receipts, warranties, manuals, inspection reports — live in
one place instead of being lost in email or a drawer. When a warranty is
about to expire, the homeowner finds out from Haven before it lapses, not
after something breaks.

**Maintenance** stops being something the homeowner has to remember on their
own. Haven surfaces what's actually due, based on what's actually been done
to *this* home, not a generic seasonal checklist.

**Trust** isn't a badge anymore — it's just an accurate reflection of a track
record. A Trust Score of 98 means something because it's built from real,
verified outcomes across thousands of completed jobs, not a static number.
The homeowner doesn't have to wonder if a stranger is safe to let in — the
platform has already done that work, continuously, not just at pro
sign-up.

**AI** works quietly in the background rather than as a gimmick — the
homeowner types "there's a weird smell near the water heater" and gets a
confident, specific answer, because Haven understands both the *problem*
being described and the *specific home* it's happening in.

**Marketplace quality** compounds instead of eroding over time, the way many
services marketplaces do as they scale. Because Trust Score is built on real
outcomes and low-quality pros are structurally filtered out rather than
just down-ranked, using Haven for the hundredth time feels at least as
reliable as the first — arguably more so, because the platform now has real
history to match against.

**The overall feeling, in one sentence:** Haven has quietly become the thing
homeowners assume everyone eventually needs — not a gig-economy app they
compare against alternatives each time, but the default, trusted way a home
gets taken care of.

---

## 27. Engineering Philosophy

An expansion of the Engineering Rules (§15) into the reasoning behind them —
useful for a new engineer trying to understand *why* the codebase looks the
way it does, not just what's allowed.

| Principle | Reasoning |
|---|---|
| **Build for longevity, not just for the demo.** | Even prototype-stage decisions (the `cameFrom` navigation pattern, the Rules-of-Hooks discipline in §20 Decisions #12–14) are treated as real engineering standards because they've already caused real bugs when skipped. A prototype that's sloppy "because it's just a prototype" creates debt that outlives the excuse. |
| **Keep architecture simple until complexity is actually earned.** | The single-file structure (§10) is an intentional, revisited-and-kept decision, not an oversight — it optimizes for the actual current constraint (one person iterating quickly across many feature slices) rather than a hypothetical future team size. |
| **Prefer reusable systems over one-off code.** | Concretely enforced: `trustBadge`, `timeChips`, `addressPaymentCard`, `subHeader`, and the shared photo-picker logic (§10) all exist because a pattern repeated at least twice was extracted rather than copy-pasted a third time. |
| **Refactor before scaling, not instead of shipping.** | The plan is not "refactor now, then keep building" — it's "keep shipping feature slices, and refactor when a real trigger condition is hit" (§17, Open Question #12 asks exactly what that trigger should be). Refactoring too early would slow down the exact iteration speed the project currently depends on. |
| **Prototype quickly.** | Every feature slice in this project's history was built and validated in the browser prototype first, in plain JS/JSX with no build step (the `prototype.html` + CDN-React approach), specifically so product ideas could be tested same-conversation rather than blocked on infrastructure. |
| **Measure before optimizing.** | §24 (Success Metrics) exists precisely so that future performance/UX optimization work is driven by real data (booking time, conversion rate) rather than guesswork — this codebase has, so far, only ever been optimized against explicitly observed friction (e.g., the Task Detail + Photo screen merge was a response to an identified multi-tap problem, not a speculative improvement). |
| **Avoid clever code.** | The codebase consistently favors plain, readable patterns (inline style objects, straightforward conditional rendering, descriptive function names like `openReceipt`/`hireAgainJob`) over abstraction for its own sake — a new contributor should be able to read any single screen function top-to-bottom and understand it without needing to trace through multiple layers of indirection. |
| **Keep the codebase approachable.** | This Master Specification itself is part of this principle — the goal is that a new engineer (or a future AI session) can get accurate context from this document rather than needing to reverse-engineer intent from ~2,000 lines of JSX. §16's recorded bug history exists for the same reason: so a mistake is only ever made once. |

---

## 28. Document Structure — Future Evolution

This Master Specification currently holds everything in one file
deliberately — the same "keep it simple until complexity is earned"
principle (§27) applies to documentation, not just code. As Haven grows,
this single document should split into focused living documents, each
owned and updated independently:

| Future document | Would contain | Split out from |
|---|---|---|
| **Master Specification** (this document, reduced) | North Star (§18), Core Philosophy (§2), Executive Summary (§1), cross-links to every other document | Stays as the "index" — the one document everyone reads first |
| **Design System** | Colors, typography, spacing, buttons, cards, icons, animations, accessibility standards | §11 |
| **Engineering Handbook** | Architecture, naming conventions, engineering rules and philosophy, technical debt log | §10, §15, §27 |
| **Feature Specifications** | Screen-by-screen documentation, booking flow, My Home system, Trust system — one spec per major feature area, each independently versioned | §5, §6, §7, §8, §9 |
| **Roadmap** | Product roadmap, parking lot, priority reviews | §13, §14 |
| **Decision Log** | The permanent product decision log | §20 |
| **Business Strategy** | Marketplace strategy, competitor analysis, success metrics, monetization | §19, §21, §24 |

**Why splitting improves long-term maintainability:**
1. **Update frequency differs wildly by section.** The Decision Log should never be rewritten, only appended to; the Design System might change every few weeks during active visual work. Bundling both into one document means either the whole thing gets touched constantly (noisy history, hard to review changes) or the fast-moving parts get neglected because updating "the whole spec" feels heavier than it should.
2. **Audience differs by section.** A designer needs the Design System; a new backend engineer needs the Engineering Handbook; a business/strategy conversation needs Marketplace Strategy and Competitor Analysis. Forcing everyone to navigate all 28+ sections to find their relevant slice doesn't scale past a single-person or single-AI-session workflow.
3. **A single giant document eventually becomes stale in a way that's hard to detect.** Small, focused documents make it obvious when something hasn't been touched in a while (a stale Roadmap is an obvious problem; a stale *section* of a giant document is easy to miss).
4. **This project's own working pattern already points this way.** Feature work has consistently happened in focused "slices" (§20's entire decision log is literally structured as a slice-by-slice history) — splitting the documentation to mirror that same slice-based structure is a natural fit, not a new discipline being imposed from outside.

**When to actually do this split:** ❓ not yet — this document is still small
enough to be more useful whole than fragmented. The natural trigger point is
whichever comes first: (a) a real second contributor joins who only needs
one slice of this document, or (b) any single section grows large enough
that finding information inside this file becomes slower than opening a
dedicated document would be.

---

## Review Pass Notes (v0.2)

A full read-through was done from §1 to §28 specifically checking for
contradictions, duplicate sections, missing information, weak explanations,
and anything likely to confuse a new engineer. Findings:

- **No contradictions found** between the original v0.1 sections and the new
  v0.2 sections — the Product Decision Log (§20) was cross-checked against
  §3, §7, §10, and §16, and all align (the decisions recorded are the same
  ones already described in prose elsewhere, now consolidated in one
  place rather than duplicated with different wording).
- **No duplicate sections found.** Some deliberate cross-referencing exists
  between sections (e.g., §18's four pillars are referenced by §19, §23,
  §24, §25) — this is intentional linking, not duplication, and is called
  out explicitly wherever it happens so a reader isn't confused about
  whether it's new information or a pointer.
- **Gaps that remain (not fixed by this pass, since fixing them would mean
  inventing answers):** the marketplace chicken-and-egg problem (§21) is
  explicitly flagged as unsolved rather than papered over with a plausible-
  sounding but unconfirmed answer. This is intentional per this document's
  standing rule of flagging gaps rather than inventing content.
- **One organizational improvement made during this pass:** §21 (Marketplace
  Strategy) and §24 (Success Metrics) both reference commission/take-rate
  numbers — these are now cross-referenced to each other and to §9/§5 (where
  the *product* — not business — treatment of fees is documented) so a
  reader doesn't encounter the 20% take-rate figure in three places with
  three different confidence levels.
- **New open questions surfaced by this pass** (added to §17 — see below)
  rather than left implicit inside §19/§21/§23.

---

*End of Master Specification v0.2. Sections 1–17 are unchanged in substance
from v0.1 (only the header/changelog was updated); sections 18–28 are new.
Continue updating this document section-by-section as decisions are made.*
