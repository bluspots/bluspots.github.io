# Realtime job signal v1 — backend contract (MIG-0036)

Status: **DRAFT, not applied.** Backend: `supabase/migrations/0036_realtime_job_signal.sql` (Customer repo PR, base `master`).
Owner: Codey (backend). Consumers: Customer app and Pro app (Claude). Reviewed by: Quagon (pending).
Haven is app-first: this contract is for the Customer app and the Pro app.

## 1. What it is

When a job row changes in any way (app write, RPC, Founder Control Center cancel or release, SQL editor),
the database sends one tiny **private Broadcast** message to each person on that job, before and after the change:
the Customer, the assigned Pro, a Pro who was just released or reassigned away, and a newly assigned Pro.

The message is only a **"something changed, refetch"** signal. It carries no address, coordinates, prices, names,
notes, payment, materials or Customer data. The apps must refetch through the reads they already use.

## 2. Topic (one per signed-in user)

```
jobs:user:<auth user id, lowercase uuid>
```

Example: `jobs:user:b79c42e9-6e09-4335-9035-a11ecf37d032`

- Use `session.user.id` exactly as Supabase returns it (lowercase). An uppercase uuid is refused.
- A user can join **only their own** topic. Joining anyone else's topic, `jobs:user:` + anything else, or any other
  topic name fails with an authorization error. Anon cannot join anything.
- Clients **cannot send** on this topic (no write permission). Presence is not allowed on it.
- One channel per app session. The Customer app and the Pro app use the same topic format.

## 3. Channel config (supabase-js v2)

```js
// after sign-in (and whenever the signed-in user changes)
await supabase.realtime.setAuth()            // REQUIRED: Realtime Authorization uses the user's JWT
const topic = `jobs:user:${session.user.id}`
const channel = supabase
  .channel(topic, { config: { private: true } })   // REQUIRED: private: true (public channels never get these messages)
  .on('broadcast', { event: 'job_changed' }, (msg) => onJobSignal(msg.payload))
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') refetchEverythingVisible()          // also covers reconnects
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') scheduleResubscribe()  // backoff; call setAuth() again first
  })

// on sign-out or user switch
await supabase.removeChannel(channel)
```

Swift (if a native shell is used): `supabase.channel("jobs:user:\(uid)") { $0.isPrivate = true }`, call
`await supabase.realtime.setAuth()` before `subscribe()`.

Do **not** set `broadcast: { self: true }`, `ack`, or `replay`; they are not needed.

## 4. Event and payload

- Event name: **`job_changed`** (the only event in v1).
- Payload (exact keys; `id` is added by Supabase):

```json
{
  "v": 1,
  "id": "6f1c0c7e-6a43-4d4e-9b3b-2d7d9f1e8a10",
  "job_id": "e0360000-0000-4000-8000-0000000000f1",
  "status": "posted",
  "reason": "removed",
  "at": "2026-11-11T07:41:05.123Z"
}
```

| key | type | meaning |
|---|---|---|
| `v` | int | contract version, `1`. Ignore messages with another `v` (just refetch). |
| `id` | uuid | message id (Supabase). Optional de-duplication. |
| `job_id` | uuid | the job that changed. You were (or now are) a party to it. |
| `status` | string or null | the job's status **right after** the change (same values as `jobs.status`). `null` only when the job row was deleted. |
| `reason` | string | for **you**: `created` (you posted a new job), `added` (you just became this job's Pro or Customer), `updated` (still your job, something changed), `removed` (no longer your job: released, reassigned away, cancelled-with-unassign, or deleted). Unknown values: treat as `updated`. |
| `at` | string | database time of the change, UTC ISO-8601 with milliseconds. |

Who gets what (examples, all tested):

| change | Customer | old Pro | new Pro |
|---|---|---|---|
| Pro marks Arrived / any status step | `updated`, new status | (same Pro) `updated` | — |
| Founder **releases** the Pro (en_route → posted) | `updated`, `posted` | `removed`, `posted` | — |
| Founder **cancels** (0035 also unassigns the Pro) | `updated`, `cancelled` | `removed`, `cancelled` | — |
| Pro claims a posted job | `updated`, `en_route` | — | `added`, `en_route` |
| Reassignment Pro A → Pro B (privileged) | `updated` | A: `removed` | B: `added` |
| Customer posts a job | `created`, `posted` | — | — |
| Customer cancels own posted job | `updated`, `cancelled` | — | — |
| Any other column change (materials, fees, …) | `updated` | (assigned Pro) `updated` | — |
| Job row deleted (owner only) | `removed`, `null` | `removed`, `null` | — |
| UPDATE that changes nothing | nothing | nothing | nothing |

## 5. Client behaviour (required)

1. **Signal → refetch.** On `job_changed`, debounce 300–500 ms (several signals can arrive together), then refetch
   through the existing reads only:
   - Customer app: its jobs/bookings reads (RLS `jobs_select_own_customer`), job detail, live location
     (`get_job_live_location`) if the tracking screen is open.
   - Pro app: the assigned job read (RLS `jobs_select_assigned_pro`), `get_assigned_job_destination`, and the board
     RPC `jobs_posted_within_radius` if the board is open.
2. **Never trust the payload for decisions.** Use `status`/`reason` only to pick a message or which screen to refresh.
   What the user sees and can do must come from the refetch. If the refetch says the job is not found / not yours,
   treat it as removed.
3. **`removed`** → take the job off "my active job". Suggested copy (final wording is product's call):
   `cancelled` → "This job was cancelled."; `posted` → "You're no longer assigned to this job."; `null` → "This job
   is no longer available." Pro app: stop live-location sending for that job (the server already rejects it).
4. **Broadcasts can be missed** (phone asleep, app in background, network drop, Realtime restart). So also refetch:
   on `SUBSCRIBED` (first join and every rejoin), when the app returns to the foreground / becomes visible, and when
   the network comes back. While an active-job screen is open, keep a slow safety poll (60 s).
5. **Token refresh.** Realtime checks access at join time and disconnects when the JWT expires. supabase-js
   refreshes the token; if the channel errors, call `supabase.realtime.setAuth()` and resubscribe with backoff.
6. Sign-out / account switch: `removeChannel` before subscribing to the new user's topic.
7. Do not log payloads to third-party analytics.

## 6. Pro board (no realtime signal in v1)

Pros learn about board changes by **refetching `jobs_posted_within_radius`**: when the board screen opens or the app
comes to the foreground, every **30 s while the board is visible**, right after their own `job_changed` signal
(for example after being released), and after a failed claim. There is **no** board-wide broadcast: a
"board changed" signal sent to every Pro would reveal when and how often jobs are posted or claimed anywhere on the
platform (in a small town that can point at one household), and would make every Pro call the board RPC at the same
moment. Claims are already race-safe on the server (`pro_claim_job`), so a stale board can never double-book a job.
Revisit if the founder wants faster board updates (option: coarse 0.69-mile grid topics, separate review).

`job_status_events` needs nothing: every status change is a `jobs` UPDATE in the same transaction, so the job signal
already fires and a refetch sees the new event rows too.

## 7. Failure modes (backend side)

| case | effect | app impact |
|---|---|---|
| Realtime down, or the broadcast insert fails for any reason | the job write still succeeds; a WARNING is logged; no message | covered by refetch on focus / reconnect / poll |
| No `realtime.messages` partition for the current UTC day yet (Realtime creates them when clients connect) | message dropped with `WarnSendingBroadcastMessage` | same |
| `realtime.messages` locked by maintenance | the trigger waits at most 1 s, then skips the message | same |
| Job write rolled back | nothing is sent (the message is part of the same transaction) | none |
| Bulk admin/SQL update of many jobs | one message per party per job | debounce |
| Rollback of 0036 | messages stop; nothing else changes | apps keep working via refetch |

Retention: Supabase keeps broadcast rows in `realtime.messages` for about 3 days (job id, status, recipient id in the
topic; nothing else). Only the database owner / server key can read them.

## 8. Security properties (tested locally, see PR)

- Each user can read only `jobs:user:<own id>`, broadcast only; no presence; no client writes; anon nothing.
- `service_role` (server secret key) can join any topic, as it bypasses RLS everywhere. It is never shipped in the apps.
- Payload keys are exactly `v, id, job_id, status, reason, at`.
- The trigger function is SECURITY DEFINER with `search_path = pg_catalog, public, pg_temp`, no EXECUTE for any client
  role, and wraps all work in an exception handler so it can never block or roll back a job write.
