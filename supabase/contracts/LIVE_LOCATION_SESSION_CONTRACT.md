# Live location sessions: client contract (MIG-0037)

**Status: DRAFT, not applied.**
- Backend: `supabase/migrations/0037_live_location_session.sql`.
- Owner: Codey (backend). Consumers: the Pro app (sender) and the Customer app (viewer), built by Claude.
- It builds on live tracking v1 (0032, `LIVE_TRACKING_V1_CONTRACT.md`) and the realtime job signal (0036, which is live).
- Revision: founder decisions t675u (Alex, 2026-11-12 3:40 PM ET), which supersede the earlier "a stop is final for the drive" rule. The 30-minute no-update cutoff was **DECIDED** by Alex on 2026-11-12 at 4:51 PM ET (design approval; nothing pasted).

## 0. The rules (founder, 2026-11-12)
1. **Driving to Job starts sharing automatically.** When this device's claim succeeds, the app calls `start`.
2. **Ending a session.** A location-permission revoke, sign-out or an explicit "Stop sharing" ends the session and wipes the Customer-visible point at once. The server also ends a session that has written nothing for 30 minutes (§6).
3. **Explicit resume only.** On the same en_route job, sharing comes back only through the Pro's explicit **"Resume location sharing"** tap, which calls `pro_resume_live_location` and gets a **fresh** session. These never restart it: app open, sign-in, permission returning, a token refresh, or any retry.
4. **No resume after the drive ends.** There is no resume after Arrived, cancel, release or reassignment. The server ends the session, and resume returns `tracking_not_active` or `not_found`.
5. **Persistence.** The app may keep the active `session_id` in Keychain/Keystore, scoped to this Pro and job. After a restart it continues with that session. It never silently creates a new one.
6. **Blips recover.** A network blip, backgrounding or an OS kill does not end the session. After 5 minutes without a write, the Customer sees `paused` (unchanged from 0032).

## 1. RPCs (Pro app)
Every call is `POST /rest/v1/rpc/<name>` with the signed-in user's JWT and a JSON body.
- Every result below comes back with **HTTP 200** and a JSON object. Refusals are `{ok:false, error, …}`, never an HTTP error, except where §3 says otherwise.
- All are SECURITY DEFINER and EXECUTE is granted to `authenticated` only (anon and the service key get 401/403).
- No call returns coordinates.

| Function (SQL signature) | Body | Success |
|---|---|---|
| `pro_start_live_location(p_job_id uuid) returns jsonb` | `{"p_job_id": "<uuid>"}` | `{"ok": true, "session_id": "<uuid>", "started_at": "YYYY-MM-DDTHH:MM:SSZ"}` |
| `pro_resume_live_location(p_job_id uuid) returns jsonb` | `{"p_job_id": "<uuid>"}` | `{"ok": true, "session_id": "<uuid, always new>", "started_at": "…Z"}` |
| `pro_update_live_location(p_job_id uuid, p_session_id uuid, p_lat double precision, p_lng double precision, p_captured_at timestamptz default null) returns jsonb` | `{"p_job_id", "p_session_id", "p_lat", "p_lng", "p_captured_at"?}` | `{"ok": true, "received_at": "…Z"}` |
| `pro_stop_live_location(p_job_id uuid default null) returns jsonb` | `{"p_job_id": "<uuid>"}`, or `{}` for every job of mine (sign-out) | `{"ok": true, "stopped": true \| false}` |

**Start vs resume.**
- `start` is the automatic Driving to Job call. It is **refused** (`session_stopped`) after a stop, a sign-out stop or an expiry on that drive.
- `resume` is the explicit tap. It clears that drive's stop and opens a new session.
- Both replace any current session on the job. The old id stops working at once, so there is only ever one sender.
- Both are refused unless the caller is the job's assigned Pro and the job is `en_route`.
- `resume` is a separate RPC so that only the button's code path can reach it, and it appears as its own name in the API logs.

**`p_captured_at`:**
- It is kept only if it falls within the last 2 minutes or at most 30 s in the future. Otherwise it is stored as null.
- Coordinates must be in range and not 0,0. They are rounded to 6 decimals.

## 2. Call order
| Moment | Calls | Local secure record `{user, job, session_id}` |
|---|---|---|
| **Driving to Job** succeeds on this device | `start` | save |
| **Update loop** | `update(job, session_id, lat, lng, captured_at)` at most every 4 s | — |
| **Blip** (timeout, offline, 5xx) | keep calling `update` at the normal pace with the same session | keep |
| **Kill, then relaunch** with a stored session for this user and an en_route job | **no start**; continue `update` with the stored id. If it returns `session_stopped`, show Resume | keep, or delete on refusal |
| Relaunch with **no** stored session, or one for another user or job | **no call**; show "Resume location sharing" if the job is en_route and this Pro is assigned | delete foreign entries |
| **Explicit stop** ("Stop sharing") | stop the watcher → `stop({p_job_id})`, idempotent, retried with backoff while signed in | delete at once (even if the call fails) |
| **Permission revoked** | same as explicit stop | delete at once |
| **Permission returns** | **no call**; show Resume | — |
| **Resume tap** | `resume({p_job_id})` → then the update loop with the new id | save the new id |
| **Sign-out** | stop the watcher and pending sends → `stop({})` (about 3 s; one retry on a network error, 5xx, `40P01` or `40001`) → `signOut()`. A failed stop never blocks sign-out | delete every entry for that user **before** sign-out completes |
| **Account switch** (Pro B signs in on the same device) | sign-out of A as above. B never reads A's entries (the key includes the user id) | B starts empty |
| **Arrived** (the Pro's own PATCH) | the server ends the session; stop the watcher; **no** Resume | delete |
| **Cancel / release / reassignment** (signal or refetch) | the server already ended it; stop the watcher; **no** Resume | delete |

## 3. Codes and what the client does
| Result | From | Meaning | Client action |
|---|---|---|---|
| `{ok:false, error:"not_authenticated"}` (200) | all | no user in the JWT | refresh the token once and resend with the **same** session. Never call start or resume because of it |
| `{ok:false, error:"not_found"}` (200) | all | no such job, or you are not its assigned Pro (one reply for both, so an account switch can't probe) | stop the watcher, delete the record, refetch the job, no Resume |
| `{ok:false, error:"tracking_not_active"}` (200) | start, resume, update | the job is not en_route (Arrived, cancelled, released…) | stop the watcher, delete the record, no Resume |
| `{ok:false, error:"session_required"}` (200) | update | `p_session_id` was null | programming error; don't loop |
| `{ok:false, error:"session_stopped"}` (200) | start, update | the session was stopped (by you or at sign-out), replaced by a newer start or resume, or ended by the server | stop sending, delete the record, show **Resume** (the job is still en_route and yours). Never call start |
| `{ok:false, error:"session_stopped", reason:"expired"}` (200) | update | no accepted write for 30 min (§6); the server already wiped the point | same as `session_stopped` |
| `{ok:false, error:"invalid_point"}` (200) | update | out of range, null or 0,0 | drop that fix, keep the session |
| `{ok:false, error:"rate_limited", retry_after_s:n}` (200) | update | less than 4 s since the last accepted write | wait `n` s, keep the session |
| HTTP **400** `{code:"P0001", message:"session_required"}` | the old 4-argument `pro_update_live_location` | pre-0037 shape | never sent by 0037-ready builds |
| HTTP **401 / 403** | any | anon or the service key | never from a signed-in app |
| HTTP **5xx**, timeout, offline | any | transient | update: retry with the same session. stop: retry with backoff. start/resume: retry the same call (each success returns a new id; use the last one) |

## 4. Server guarantees and client duties
The backend cannot tell a human tap from an automatic call. Here is exactly what is enforced where.

**The server enforces (tested):**
- **Binding.**
  - A session is bound to `(job_id, pro_id)`, and every `update` checks the job's assigned Pro, en_route, and the exact current session id.
  - Pro B can never use Pro A's session, even with the id: the result is `not_found` and nothing is written.
  - The Customer can't start, resume, stop or write.
- **En_route only.** start, resume and update need an en_route job.
  - Leaving en_route (Arrived, cancel, release, complete), a Pro change or a Customer change ends the session in the same transaction.
  - After that, resume returns `tracking_not_active` or `not_found`.
- **A stopped session is never revived.** A stopped, replaced, expired or ended id is refused forever. After a stop, sign-out stop or expiry, the automatic `start` refuses until a `resume` (or a new Driving to Job after the job leaves en_route).
- **New session id every time.** start and resume always return a fresh random id, and the previous one dies at once.
- **Stale writes rejected.** A write that was delayed, in flight, retried or from a second device with a dead session is refused. A write already inside the database when a stop runs finishes first, and its point is then deleted. No point exists without a live session.
- **Rate limits.** Accepted writes are at most one per 4 s per job. start and resume are not rate-limited (OPEN).
- **Expiry.** See §6.
- **Owner-only tables.**
  - Sessions and stop markers hold no location, and no app role or the service key can read them.
  - The `session_id` is never returned except to the Pro who started or resumed it.

**Client duties (not enforceable by the server):**
- Call `resume` **only** from an explicit "Resume location sharing" tap. Never call it on launch, sign-in, permission return, token refresh or after an error.
- Call `start` only on this device's successful Driving to Job.
- Keep `session_id` only in Keychain (this device only) or Keystore-backed storage, keyed by user and job. The web/PWA build keeps it in memory only.
- Never put it in localStorage, logs, analytics, crash reports or URLs.
- Delete it on stop, revoke, sign-out, account switch, job end and on any `not_found`, `tracking_not_active` or `session_stopped`.
- On sign-out, call `stop({})` before `signOut()`.

## 5. Customer app
- There is no new call. Keep `get_job_live_location`, polled every 10 s while the tracking screen is open.
- On a stop, a sign-out stop or an expiry, the backend sends the 0036 signal `job_changed` (`{v:1, job_id, status:"en_route", reason:"updated", at}`) to **the Customer's topic only**.
- On a `job_changed` for the tracked job, call `get_job_live_location` immediately. It returns `{available:false, reason:"waiting"}`, so drop the point and show "Location sharing is off".
- After a resume, the next accepted write makes it live again.

## 6. Expiry rule
- **Rule:** a session that has had **no accepted write for 30 minutes**, counted from its start or its last accepted point, whichever is later, is ended by the server on its next use. The session and point are deleted, a stop marker is written, the Customer is signalled, and the caller gets `session_stopped` with `reason:"expired"`. Only a resume tap reopens it.
- **Why:** it closes a real gap. Without it, a session stored on a device (or a stop that never reached the server, for example a revoke while offline) stayed usable for as long as the job sat en_route, possibly days. With it, a stored id is only good while the drive is actually live.
- **No separate maximum age.** The session already ends when the job leaves en_route, and a moving drive keeps writing.
- The 5-minute `paused` view for the Customer is unchanged and comes first. Expiry is a later, server-side end.
- **DECIDED (Alex, 2026-11-12 4:51 PM ET, design approval):** 30 minutes with no accepted update. It is a single constant in `pro_update_live_location`.

## 7. Old (0032) call shape after 0037
`pro_update_live_location(p_job_id, p_lat, p_lng[, p_captured_at])` still exists, but every call is refused with HTTP 400 `{code:"P0001", message:"session_required"}` and nothing is written.
- A Pro build without 0037 support **can't share** once 0037 is applied. Claude's Pro #79 at 856ede68 is not 0037-ready.
- Ship the Pro update with the paste or before it.

## 8. OPEN for the founder
1. Should `start` or `resume` be rate-limited? Today they aren't. Each call just rotates the session.
2. Should there be an owner-side audit row for each start, resume, stop and expiry? Today the API logs show the RPC names. There is no table.
3. Does the Pro update ship with or before any paste of 0037? Shipped pre-0037 Pro builds stop sharing at paste time (§7).

Decided: the 30-minute no-update cutoff (§6), Alex 2026-11-12 4:51 PM ET.
