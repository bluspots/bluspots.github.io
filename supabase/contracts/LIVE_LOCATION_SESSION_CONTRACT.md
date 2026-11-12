# Live location sessions + immediate stop: client contract (MIG-0037)

Status: **DRAFT, not applied.** Backend: `supabase/migrations/0037_live_location_session.sql`.
Owner: Codey (backend). Consumers: the Pro app (sender) and the Customer app (viewer), built by Claude.
It builds on live tracking v1 (0032, `LIVE_TRACKING_V1_CONTRACT.md`) and the realtime job signal (0036, already live).

## 0. The rule (founder, 2026-11-12)

1. **Driving to Job starts sharing.** The Pro's deliberate Driving to Job action (the successful claim
   that puts the job in `en_route`) is the only thing that starts a session. There is no separate
   "Share location" tap.
2. **A stop is final for that drive.** Sign-out, location permission revoked, or "Stop sharing" ends the
   session and wipes the point the Customer sees, at once. After that, **nothing restarts sharing on that
   drive**: not a sign-in, not reopening Haven Pro, not a token refresh, not a late or repeated `start`.
   The server enforces this (it refuses `start` with `session_stopped`). Sharing can start again only
   after a new Driving to Job: the job leaves `en_route` (released, cancelled, Arrived…) or gets another
   Pro, and is then claimed again.
3. **Interruptions recover.** A network blip, a token refresh, the app going to the background, or the
   OS killing the app does **not** stop the session. The Pro app keeps sending with the same session.
   After 5 minutes without a write the Customer sees `paused` (unchanged from 0032).

Old Pro builds that use the 0032 writer can no longer share once 0037 is applied (founder approved in
principle; see §4).

## 1. The calls (Pro app)

All are `POST /rpc/<name>` with the user's JWT. Bodies are JSON. No call returns coordinates except
the Customer's existing `get_job_live_location`.

| Call | Body | Success |
|---|---|---|
| `pro_start_live_location` | `{p_job_id}` | `{ok:true, session_id:"<uuid>", started_at:"…Z"}` |
| `pro_update_live_location` | `{p_job_id, p_session_id, p_lat, p_lng, p_captured_at?}` | `{ok:true, received_at:"…Z"}` |
| `pro_stop_live_location` | `{p_job_id}`, or `{}` for all of my jobs | `{ok:true, stopped:true\|false}` |

- `session_id` belongs to one job and one signed-in Pro. It is not a location and is useless without
  that Pro's JWT. Never log it or send it anywhere else.
- Kill recovery: the app **may** keep the `session_id` in the device's secure storage (Keychain or
  Keystore), keyed by job and user, so it can carry on after the OS kills it mid-drive. It must delete it
  on stop, sign-out, `session_stopped`, `not_found` or `tracking_not_active`. (OPEN for the founder; it
  replaces the earlier "memory only" line. The backend works either way.)
- A second `start` on the same drive without a stop (for example a second device's Driving to Job)
  gives a **new** `session_id`. The old one stops working at once, so there is only ever one sender.
- `stopped:false` means there was nothing to wipe. Treat it as success.

## 2. When to call what (order matters)

1. **Driving to Job** (this device's claim succeeded): call `start`, then send `update` every ≥4 s with
   that `session_id`. This is the **only** place the app calls `start`.
2. **Never call `start`** on sign-in, app reopen, token refresh, or after any error. On reopen during a
   drive, use the stored `session_id` (§1) and send `update`. If there is none, show "Location sharing is
   off" (no button that calls `start`).
3. **Every update** carries `p_session_id`. Never call the old 4-argument shape (see §4).
4. **Sign-out:** stop the native watcher and pending sends, call `pro_stop_live_location({})`, and **only
   then** call `signOut()`. Allow about 3 s. If it fails (network error, HTTP 5xx, or a transient
   `40P01`/`40001`), **retry once**; then sign out anyway. A failed stop never blocks sign-out; the
   5-minute `paused` rule is the backstop.
5. **Location permission revoked** (or "Stop sharing" tapped): stop the watcher, then call
   `pro_stop_live_location({p_job_id})`. If offline or suspended, call it as soon as the app next
   reaches the backend. Retry the idempotent stop with backoff until it returns `ok` (or `not_found`)
   while still signed in.
6. **Arrived / leaving en_route / cancel / reassignment / release:** the server wipes the point and ends
   the session. Stop the watcher. Calling `stop` as well is harmless.
7. **Blip** (timeout, 5xx, offline): keep the session and keep trying `update` at the normal pace.

## 3. Error codes and what the client does

| Code (`{ok:false, error}`) | From | Meaning | Client action |
|---|---|---|---|
| `not_authenticated` | all | no or expired JWT | refresh the token once and resend with the **same** session; if still failing, stop sending |
| `not_found` | all | missing job, or you are not this job's assigned Pro (same reply for both) | stop the watcher; forget the session; refetch the job |
| `tracking_not_active` | start, update | the job is not en_route (Arrived, cancelled, …) | stop the watcher; forget the session |
| `session_required` | update | `p_session_id` missing | programming error; don't loop |
| `session_stopped` | start, update | sharing was stopped on this drive (by you or at sign-out), the session was replaced by a newer `start`, or the server ended it | **stop for good on this drive.** Forget the session. Don't retry, don't call `start` |
| `invalid_point` | update | bad or 0,0 coordinate | drop that fix, keep the session |
| `rate_limited` (+`retry_after_s`) | update | under 4 s since the last write | wait `retry_after_s`, keep the session |
| HTTP 400, `code:"P0001"`, `message:"session_required"` | old 4-argument `pro_update_live_location` | the pre-0037 call shape is refused after 0037 | update the app to §1; treat as stop |
| HTTP 401 / 403 | any | anon or server key | never happens from a signed-in app |

## 4. Old (0032) call shape after 0037

`pro_update_live_location(p_job_id, p_lat, p_lng[, p_captured_at])` still exists, but every call is
refused with HTTP 400 `{code:"P0001", message:"session_required"}` and nothing is written. A Pro build
that doesn't call `start` therefore **can't share** once 0037 is applied (the Customer sees `waiting`).
The founder approved this in principle (2026-11-12). Ship the Pro update with, or before, the paste. The
4-argument function stays, refusing, until no build uses it; a later migration drops it (then 404).

## 5. Customer app

- No new call. Keep `get_job_live_location` (polled every 10 s while the tracking screen is open).
- On a stop the backend sends the 0036 signal `job_changed`
  (`{v:1, job_id, status:"en_route", reason:"updated", at}`) to **the Customer's topic only**. On a
  `job_changed` for the tracked job, call `get_job_live_location` **immediately**. After a stop it returns
  `{available:false, reason:"waiting"}`: drop the point and show "Location sharing is off". Without the
  signal, the 10 s poll drops it within 10 s.
- What the Customer sees: after a deliberate stop, no location for the rest of that drive (the Pro is
  still on the way; the job status is unchanged). After a blip: the last point, then `paused` after 5 min,
  then live again when writes resume.

## 6. Guarantees (tested on local Postgres 17 with real concurrent sessions) and limits

- **A stop is final on the server.** After `stop({p_job_id})` or `stop({})`, `start` on that drive
  returns `session_stopped`, whatever the JWT (new sign-in, refreshed token). A `start` that was in flight
  when the stop ran either finished first (its session is then deleted by the stop) or runs after it and
  is refused: start and stop lock the job row the same way (this closes Quagon's LOW-3).
- Sign-out (`stop({})`) also marks an en_route job whose sharing had not started yet.
- **No point after a stop:** delayed, in-flight, retried or second-device writes with a stopped session
  are refused, and so is every old-shape write. A write already inside the database when the stop runs
  finishes first and its point is then deleted.
- The stop marker is cleared only when the job leaves `en_route` or changes Pro (same trigger that ends
  the session), so the next Driving to Job starts fresh. Markers hold no location and are readable by no
  app role.
- Offline at the moment of stop: the point stays until the stop reaches the server, or `paused` after
  5 minutes (unchanged).
- OPEN for the founder: (a) there is no way to resume on the same drive after a stop (for example a
  permission toggled off by mistake); the Pro keeps driving unshared. Confirm, or ask for a deliberate
  "resume" action. (b) Kill recovery by keeping `session_id` in secure storage (§1).
