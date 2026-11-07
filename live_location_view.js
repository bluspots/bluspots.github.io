// Customer tracking: the assigned Pro's live location while they are Driving to
// Job. Founder approved 2026-11-06 (draft). Read path: fetchJobLiveLocation
// (backend_adapter.js, get_job_live_location). This file is display only.
//
// - Only the job's Customer, only on the tracking screen, only while the app is
//   in front and the job is en_route. Polled every 10 s; never at startup.
// - The pin is the Pro's actual point, unrounded. No route, ETA, travel time,
//   geocoding or second marker. A paused or ended read shows no point at all.
// - Kept in memory only, never in localStorage, never logged.

const HAVEN_LIVE_POLL_MS = 10000;
const HAVEN_LIVE_RETRY_MS = 30000; // after a network or server error (or a read timeout)
const HAVEN_LIVE_READ_TIMEOUT_MS = 10000; // a read (request + body) is aborted after 10 s
const HAVEN_LIVE_MAX_AGE_MS = 5 * 60000; // a point this old is never shown as current
const HAVEN_LIVE_WAITING = "Waiting for the Pro's location";

// Mapbox Static Images, one pin at the exact point (numbers as received, not rounded).
function havenLiveMapUrl(point, dark) {
  if (!point || typeof HAVEN_MAPBOX_PUBLIC_TOKEN === "undefined" || !HAVEN_MAPBOX_PUBLIC_TOKEN) return null;
  const ll = String(point.lng) + "," + String(point.lat);
  const style = dark ? "dark-v11" : "streets-v12";
  return "https://api.mapbox.com/styles/v1/mapbox/" + style + "/static/pin-l+0F6E4E(" + ll + ")/" + ll + ",15,0/600x300@2x?logo=true&attribution=true&access_token=" + encodeURIComponent(HAVEN_MAPBOX_PUBLIC_TOKEN);
}

// "Location paused. Last update X min ago." (no time known: no number).
function havenLivePausedText(lastReceivedAt, nowMs) {
  const t = lastReceivedAt ? Date.parse(lastReceivedAt) : NaN;
  if (!Number.isFinite(t)) return "Location paused.";
  const min = Math.max(1, Math.round((nowMs - t) / 60000));
  return "Location paused. Last update " + min + " min ago.";
}

// When the shown point was received by the server, on this device's clock.
// Preferred: this device's time of the read minus the server's age_s (immune to
// a phone clock that is off). Else the server's received_at, else captured_at.
function havenLivePointTime(live) {
  if (!live || live.state !== "live") return null;
  if (typeof live.readAt === "number" && typeof live.ageS === "number" && Number.isFinite(live.ageS)) return live.readAt - live.ageS * 1000;
  const t = Date.parse(live.receivedAt || live.capturedAt || "");
  return Number.isFinite(t) ? Math.min(t, typeof live.readAt === "number" ? live.readAt : t) : null;
}

// The point to show now, or null once it is 5 minutes old (or its time is unknown).
function havenLiveCurrentPoint(live, nowMs) {
  const t = havenLivePointTime(live);
  if (t == null || !live.point || nowMs - t >= HAVEN_LIVE_MAX_AGE_MS) return null;
  return live.point;
}

// "Updated X sec ago" from the point's time versus now, so it keeps counting.
function havenLiveAgeText(pointTime, nowMs) {
  if (typeof pointTime !== "number" || !Number.isFinite(pointTime)) return "";
  const s = Math.max(0, Math.floor((nowMs - pointTime) / 1000));
  if (s < 60) return "Updated " + s + " sec ago";
  return "Updated " + Math.floor(s / 60) + " min ago";
}

// What the card says for a read without a point.
function havenLiveMessage(live, nowMs) {
  const s = live && live.state;
  if (!s || s === "loading") return "Loading your Pro's location…";
  if (s === "waiting") return HAVEN_LIVE_WAITING;
  // A live point that has expired reads exactly like the server's paused state.
  if (s === "live") { const t = havenLivePointTime(live); return havenLivePausedText(t == null ? null : new Date(t).toISOString(), nowMs); }
  if (s === "paused") return havenLivePausedText(live.lastReceivedAt, nowMs);
  if (s === "ended") return "Location sharing has ended for this job.";
  if (s === "unavailable") return "Your Pro's location isn't available.";
  if (s === "network") return "Couldn't load your Pro's location. Trying again shortly.";
  return "";
}
