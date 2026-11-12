# Live location sessions + immediate stop: client contract (MIG-0037)

Status: **DRAFT, not applied.** Backend: `supabase/migrations/0037_live_location_session.sql`.
Owner: Codey (backend). Consumers: the Pro app (sender) and the Customer app (viewer), built by Claude.
It builds on live tracking v1 (0032, `LIVE_TRACKING_V1_CONTRACT.md`) and the realtime job signal (0036).
Founder rule (2026-11-12): an intentional stop wipes the point the Customer can see **immediately**,
whenever the backend can be reached. A network blip keeps today's behaviour: after 5 minutes without a
write, the Customer sees `paused`.

## 1. The calls (Pro app)

All are `POST /rpc/<name>` with the user's JWT. Bodies are JSON. No call returns coordinates except
the Customer's existing `get_job_live_location`.

| Call | Body | Success |
|---|---|---|
| `pro_start_live_location` | `{p_job_id}` | `{ok:true, session_id:"<uuid>", started_at:"…Z"}` |
| `pro_update_live_location` | `{p_job_id, p_session_id, p_lat, p_lng, p_captured_at?}` | `{ok:true, received_at:"…Z"}` |
| `pro_stop_live_location` | `{p_job_id}`, or `{}` for all of my jobs | `{ok:true, stopped:true\|false}` |

- `session_id` is held **in memory only** for that job. Don't persist it across app launches, and don't
  log or send it anywhere else.
- Starting again on the same job gives a **new** `session_id`. The old one stops working at once,
  including on another device.
- A token refresh, a new sign-in or an app restart **never** revives a session. Only
  `pro_start_live_location` does.
- `stopped:false` means there was nothing to stop. Treat it as success.

## 2. When to call what (order matters)

1. **Entering en_route** (claim succeeded, or the app opens on an en_route job the Pro is actively
   driving): call `start`, then begin sending `update` every ≥4 s with that `session_id`.
   App relaunch or sign-in on an en_route job is OPEN for the founder (see §6). Until he decides,
   do **not** auto-start after a sign-in that followed a sign-out or a stop. Show "Sharing is off" with a
   "Share location" action, which calls `start`.
2. **Every update** carries `p_session_id`. Never call the old 4-argument shape (see §4).
3. **Sign-out:** stop the native watcher and pending sends, then call `pro_stop_live_location({})`, and
   **only then** call `signOut()`. Allow about 3 s for the stop. If it fails or times out, sign out anyway.
   A failed stop never blocks sign-out; the 5-minute `paused` rule is the backstop.
4. **Location permission revoked** (or "Stop sharing" tapped): stop the watcher, then call
   `pro_stop_live_location({p_job_id})`. If the app is offline or suspended, call it as soon as the app
   next reaches the backend. Retry the idempotent stop with backoff until it returns `ok` (or
   `not_found`) while still signed in.
5. **Arrived / leaving en_route / cancel / reassignment / release:** the server already wipes the point
   and ends the session (triggers). Stop the watcher. Calling `stop` as well is harmless
   (`not_found` or `stopped:false`).
6. **Resume** after a stop or a `session_stopped`: only on an explicit user action (a "Share location"
   tap), or a fresh entry into en_route. Call `start` and use the new `session_id`.

## 3. Error codes and what the client does

| Code (`{ok:false, error}`) | From | Meaning | Client action |
|---|---|---|---|
| `not_authenticated` | all | no or expired JWT | refresh the session once; if still failing, stop sending |
| `not_found` | all | missing job, or you are not this job's assigned Pro (same reply for both) | stop the watcher; don't retry; refetch the job (it was likely released or cancelled) |
| `tracking_not_active` | start, update | the job is not en_route (Arrived, cancelled, …) | stop the watcher; don't retry |
| `session_required` | update | `p_session_id` missing | programming error: call `start` once, then resend |
| `session_stopped` | update | that session was stopped, replaced (other device or a new start), or ended by the server | **stop the watcher. Don't retry.** Don't auto-call `start`; resume only per §2.6 |
| `invalid_point` | update | bad or 0,0 coordinate | drop that fix, keep the session |
| `rate_limited` (+`retry_after_s`) | update | under 4 s since the last write | wait `retry_after_s`, keep the session |
| HTTP 400, `code:"P0001"`, `message:"session_required"` | old 4-argument `pro_update_live_location` | the pre-0037 call shape is refused after 0037 | update the app to §1; treat it as stop |
| HTTP 401 / 403 | any | anon or server key | never happens from a signed-in app |

## 4. Old (0032) call shape after 0037

`pro_update_live_location(p_job_id, p_lat, p_lng[, p_captured_at])` still exists, but every call is
refused with HTTP 400 `{code:"P0001", message:"session_required"}` and nothing is written. A Pro app
build that doesn't call `start` therefore **stops sharing** once 0037 is applied (the Customer sees
`waiting`). Ship the Pro app update together with, or before, the paste. Deprecation: the 4-argument
function stays, refusing, until every app build in use sends `p_session_id`. A later migration then
drops it, after which PostgREST answers 404 instead of 400.

## 5. Customer app

- No new call. Keep `get_job_live_location` (polled every 10 s while the tracking screen is open).
- On `pro_stop_live_location`, the backend sends the 0036 signal `job_changed`
  (`{v:1, job_id, status:"en_route", reason:"updated", at}`) to **the Customer's topic only**. On a
  `job_changed` for the job being tracked, call `get_job_live_location` **immediately**, as well as the
  normal job refetch. It returns `{available:false, reason:"waiting"}` after a stop, so drop the point
  and show "Location sharing is off". Without the signal, the 10 s poll still drops it within 10 s.
- Nothing else in the 0036 contract changes. The signal never carries location.

## 6. Guarantees and limits

- **No point after a stop:** a delayed, in-flight, retried or second-device write that carries the
  stopped session id is refused, and so is every old-shape write. A writer already inside the database
  when the stop runs finishes first, and its point is then deleted by the stop. Both cases are tested
  with real concurrent sessions.
- Offline at the moment of stop: the point stays until the stop reaches the server, or until it goes
  `paused` after 5 minutes (unchanged).
- Status changes (Arrived, cancel, release, reassignment) wipe the point and end the session in the
  same transaction, as in 0032. A Pro who is released and re-claims needs a new `start`.
- OPEN for the founder: auto-start on app relaunch or sign-in on an en_route job (recommend: only
  after an explicit "Share location"), and whether the shipped Pro app may stop sharing until it is
  updated (§4).
