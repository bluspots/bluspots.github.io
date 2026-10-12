// Geocoder boundary. Callers use havenGeocodeAddress only.
// Mapbox is the only production implementation. Swap the body of
// havenGeocodeAddress to replace the provider later.
// Do not call this from marketplace load, job list, or claim.
// The public pk token is in this file so GitHub Pages can geocode
// without a browser setting. No secret sk token.

const HAVEN_MAPBOX_PUBLIC_TOKEN = "pk.eyJ1IjoiYWxleGJhcnR1YWwiLCJhIjoiY211dTMyM2h0MDM0aDJ5bzNscTJucHNjcyJ9.EZkYdZlHTW8vcZljriN3Pw";

async function havenMapboxGeocodeAddress(query) {
  const q = String(query || "").trim();
  if (!q || !HAVEN_MAPBOX_PUBLIC_TOKEN) return null;
  const url = "https://api.mapbox.com/search/geocode/v6/forward?q="
    + encodeURIComponent(q)
    + "&limit=1&autocomplete=false&access_token="
    + encodeURIComponent(HAVEN_MAPBOX_PUBLIC_TOKEN);
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    return null;
  }
  if (!res || !res.ok) return null;
  let data = null;
  try { data = await res.json(); } catch (e) { return null; }
  const feat = data && Array.isArray(data.features) ? data.features[0] : null;
  const coords = feat && feat.geometry && Array.isArray(feat.geometry.coordinates)
    ? feat.geometry.coordinates
    : null;
  if (!coords || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: lat, lng: lng };
}

function havenGeocodeAddress(query) {
  return havenMapboxGeocodeAddress(query);
}

// ── Address search and map confirmation (Mapbox Phase 1–2, frontend) ─────
// Suggestions use temporary geocoding (shown, never stored). Saving a
// confirmed address makes one permanent lookup, so its coordinates may be
// stored (Mapbox terms: temporary results can't be stored). Nothing here
// runs at startup; it's called only from the address screen.
const HAVEN_MAPBOX_GEOCODE_V6 = "https://api.mapbox.com/search/geocode/v6/";
// Orlando, used only to rank nearby results first. Not a location claim.
const HAVEN_ADDRESS_SEARCH_PROXIMITY = "-81.3792,28.5383";
const HAVEN_PRECISE_ACCURACY = ["rooftop", "parcel", "point"];

// One Mapbox address feature -> the app's address fields. Returns null for
// anything that isn't a full street address.
function havenAddressFromFeature(feature) {
  const p = feature && feature.properties;
  const ctx = p && p.context;
  if (!p || !ctx || p.feature_type !== "address") return null;
  const num = ctx.address && ctx.address.address_number;
  const streetName = (ctx.address && ctx.address.street_name) || (ctx.street && ctx.street.name);
  const coords = p.coordinates || {};
  const lat = Number(coords.latitude), lng = Number(coords.longitude);
  if (!num || !streetName || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    mapboxId: p.mapbox_id || null,
    street: `${num} ${streetName}`,
    city: (ctx.place && ctx.place.name) || (ctx.locality && ctx.locality.name) || "",
    state: (ctx.region && ctx.region.region_code) || "",
    zip: (ctx.postcode && ctx.postcode.name) || "",
    fullAddress: p.full_address || "",
    lat: lat, lng: lng,
    accuracy: coords.accuracy || "unknown",
    precise: HAVEN_PRECISE_ACCURACY.includes(coords.accuracy),
  };
}

// The unit part of what the customer typed ("Apt 3", "Unit 12B", "#4",
// "Suite 200"). Mapbox drops it, so the app keeps it in its own field.
function havenUnitFromQuery(query) {
  const m = String(query || "").match(/(?:^|[\s,])((?:apt|apartment|unit|suite|ste|bldg|building|fl|floor|rm|room)\.?\s*(?:[A-Za-z]?\d[A-Za-z0-9-]*|[A-Za-z])|#\s*[A-Za-z0-9-]+)\s*$/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

async function havenMapboxV6(path, params, signal) {
  if (!HAVEN_MAPBOX_PUBLIC_TOKEN) return { ok: false, reason: "unavailable" };
  const qs = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join("&");
  let res;
  try {
    res = await fetch(`${HAVEN_MAPBOX_GEOCODE_V6}${path}?${qs}&access_token=${encodeURIComponent(HAVEN_MAPBOX_PUBLIC_TOKEN)}`, signal ? { signal } : undefined);
  } catch (e) {
    return { ok: false, reason: e && e.name === "AbortError" ? "aborted" : "network" };
  }
  if (!res || !res.ok) return { ok: false, reason: res && (res.status === 401 || res.status === 403) ? "refused" : "network" };
  let data = null;
  try { data = await res.json(); } catch (e) { return { ok: false, reason: "network" }; }
  const seen = new Set();
  const results = (data && Array.isArray(data.features) ? data.features : [])
    .map(havenAddressFromFeature)
    .filter(Boolean)
    .filter(r => { const k = `${r.street.toLowerCase()}|${r.zip}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { ok: true, results: results };
}

// Suggestions while typing (temporary; not stored).
function havenSuggestAddresses(query, signal) {
  const q = String(query || "").trim();
  if (q.length < 3) return Promise.resolve({ ok: true, results: [] });
  return havenMapboxV6("forward", { q: q, autocomplete: "true", country: "us", types: "address", limit: 5, proximity: HAVEN_ADDRESS_SEARCH_PROXIMITY }, signal);
}
// The address at the phone's location (temporary; the customer confirms it).
function havenAddressAtLocation(lat, lng, signal) {
  return havenMapboxV6("reverse", { longitude: lng, latitude: lat, types: "address", limit: 1 }, signal);
}
// One permanent lookup for the address being saved, so its point may be stored.
async function havenConfirmAddressForSaving(fullAddress) {
  const r = await havenMapboxV6("forward", { q: fullAddress, country: "us", types: "address", limit: 1, permanent: "true" });
  return r.ok && r.results.length ? r.results[0] : null;
}

// Static Mapbox map image of one point (loaded only when shown).
function havenStaticMapUrl(lat, lng, opts) {
  const o = opts || {};
  const style = o.dark ? "dark-v11" : "streets-v12";
  const w = o.width || 600, h = o.height || 300;
  const ll = `${Number(lng).toFixed(6)},${Number(lat).toFixed(6)}`;
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/pin-l+F59E0B(${ll})/${ll},16,0/${w}x${h}@2x?logo=true&attribution=true&access_token=${encodeURIComponent(HAVEN_MAPBOX_PUBLIC_TOKEN)}`;
}
