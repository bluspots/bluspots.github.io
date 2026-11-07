/**
 * Customer tracking: the Pro's live location while they are on the way
 * (get_job_live_location, migration 0032). Founder approved 2026-11-06 (draft).
 * Mounts the SHIPPED prototype.html script in jsdom with a mocked backend.
 *
 *  1. Tracking screen + en_route backend job → one POST to /rest/v1/rpc/get_job_live_location
 *     with { p_job_id }, then another 10 s later.
 *  2. Startup, Home, Bookings and the posted screen → no live-location call.
 *  3. available:true → the pin is exactly `point` (not rounded).
 *  4. waiting / paused → the specified copy, no marker; paused never reuses an earlier point.
 *  5. tracking_not_active, not_found, not_authenticated, 401, 403 → no marker, polling stops;
 *     a network error → no marker, polling backs off (30 s).
 *  6. Leaving en_route, leaving the screen, the app going to the background, and sign-out
 *     clear the point and stop polling.
 *  7. No simulated countdown or promised arrival time for a backend en_route job.
 *  8. No coordinates in localStorage; no GET to the live-location function; no
 *     coordinates on any Supabase request URL (the Mapbox image URL carries the
 *     point by design).
 *  Fix (paper QA of fc9bb13):
 *  9. A read (request or body) that never settles is aborted at 10 s and treated as a
 *     network error: pin removed, network copy, next read at 30 s.
 * 10. A shown point expires at 5 minutes (pin hidden, paused copy) even while a read is
 *     still in flight; "Updated … ago" keeps counting instead of freezing at age_s.
 *
 * Coordinates are never printed. The live point is a fixture near a public landmark
 * (Orlando City Hall), never a real job's point. Mocked fetch is not certification.
 */
const { JSDOM } = require('jsdom');
global.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
Object.defineProperty(global.window, 'innerWidth', { value: 390, configurable: true });
global.window.matchMedia = (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
global.File = dom.window.File;
global.Blob = dom.window.Blob;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLElement.prototype.scrollIntoView = function(){};
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.URL.createObjectURL = global.URL.createObjectURL || (() => 'blob:test');
global.URL.revokeObjectURL = global.URL.revokeObjectURL || (() => {});
const storedData = {};
global.localStorage = {
  getItem: (k) => (k in storedData ? storedData[k] : null),
  setItem: (k, v) => { storedData[k] = String(v); },
  removeItem: (k) => { delete storedData[k]; },
  clear: () => { Object.keys(storedData).forEach(k => delete storedData[k]); },
};
global.window.localStorage = global.localStorage;
global.navigator.setAppBadge = () => Promise.resolve();
global.navigator.clearAppBadge = () => Promise.resolve();
global.navigator.clipboard = { writeText: () => Promise.resolve() };
let visibility = 'visible';
Object.defineProperty(global.document, 'visibilityState', { configurable: true, get: () => visibility });

// The app's 10 s poll and 30 s retry run scaled down here; the delays the app
// asked for are recorded so the cadence itself is still checked exactly.
const realSetTimeout = global.setTimeout;
const requestedDelays = [];      // poll delays the app asked for (10 s / 30 s)
const timeoutDelays = [];        // read-timeout delays the adapter asked for
const SCALE = { 10000: 160, 30000: 480 };
let scaleReadTimeout = true;     // false: the 10 s read timeout runs in real time
global.setTimeout = (fn, ms, ...a) => {
  if (SCALE[ms]) {
    const isReadTimeout = typeof fn === 'function' && /\.abort\(\)/.test(String(fn));
    if (isReadTimeout) { timeoutDelays.push(ms); if (scaleReadTimeout) ms = SCALE[ms]; }
    else { requestedDelays.push(ms); ms = SCALE[ms]; }
  }
  return realSetTimeout(fn, ms, ...a);
};
// Wall clock under test control (for ageing / 5-minute expiry).
const realNow = Date.now.bind(Date);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;

const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
const { act } = require('react-dom/test-utils');
const babel = require('@babel/core');
const fs = require('fs');
const React = require('react');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } }
function bodyText() { return Array.from(document.body.children).filter(el => el.tagName !== 'STYLE').map(el => el.textContent).join(' '); }

const html = fs.readFileSync('prototype.html', 'utf8');
const scriptMatch = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('no babel script block in prototype.html'); process.exit(1); }
const scriptBody = scriptMatch[1].replace(
  /const root = ReactDOM\.createRoot\(document\.getElementById\('root'\)\);\s*root\.render\(<ErrorBoundary><App\/><\/ErrorBoundary>\);\s*$/,
  'module.exports.App = App; module.exports.ErrorBoundary = ErrorBoundary;'
);
const { code } = babel.transformSync(scriptBody, { presets: [['@babel/preset-react', { runtime: 'classic' }]], filename: 'shipped.jsx' });
const moduleObj = { exports: {} };
eval(`(function(React, module){ ${code} \n})`)(React, moduleObj);
const { App: RawApp, ErrorBoundary } = moduleObj.exports;
const App = () => React.createElement(ErrorBoundary, null, React.createElement(RawApp));

// ── Mocked backend ──
const CUSTOMER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee7';
const JOB_UUID = 'cccccccc-1111-4222-8333-444444444447';
const PRO_UUID = 'dddddddd-1111-4222-8333-555555555557';
const LIVE = { lat: 28.53833612, lng: -81.37923487 };   // fixture, 8 decimals on purpose (must not be rounded)
const LIVE2 = { lat: 28.54012345, lng: -81.38198765 };
const LIVE_PATH = '/rest/v1/rpc/get_job_live_location';
const hasCoord = s => [LIVE, LIVE2].some(p => String(s).includes(String(p.lat).slice(0, 7)) || String(s).includes(String(p.lng).slice(1, 8)));
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
let remoteStatus = 'en_route';
let liveImpl = () => jsonRes(200, { ok: true, available: false, reason: 'waiting' });
const calls = [];
global.fetch = async (url, init) => {
  const u = String(url); init = init || {};
  calls.push({ url: u, method: init.method || 'GET', body: init.body || null, signal: init.signal || null });
  const ok = (body) => jsonRes(200, body);
  if (u.endsWith('/auth/v1/health')) return ok({});
  if (u.includes('/rest/v1/rpc/is_qa_tester')) return ok(false);
  if (u.includes(LIVE_PATH)) return liveImpl(calls.filter(c => c.url.includes(LIVE_PATH)).length);
  if (u.includes('/rest/v1/jobs?id=in.')) return ok([{ id: JOB_UUID, status: remoteStatus, customer_id: CUSTOMER_ID, pro_id: remoteStatus === 'posted' ? null : PRO_UUID }]);
  if (u.includes('/rest/v1/')) return ok([]);
  return { ok: false, status: 404, json: async () => [], text: async () => 'not found' };
};
global.window.fetch = global.fetch;
function storedSession() {
  const token = storedData['haven_auth_access_token'];
  if (!token) return null;
  return { access_token: token, user: { id: storedData['haven_auth_user_id'], email: storedData['haven_auth_email'], user_metadata: { role: 'customer' } } };
}
global.supabase = global.window.supabase = {
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: storedSession() }, error: null }),
      getUser: async () => { const s = storedSession(); return { data: { user: s ? s.user : null }, error: s ? null : { name: 'AuthSessionMissingError', status: 400 } }; },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
};

const now = Date.now();
const job = (status) => ({
  id: now - 5000, taskId: 1, tpId: 2, lockedPrice: 65, status, acceptedAt: status === 'posted' ? undefined : now - 600000,
  backendJobId: JOB_UUID, backendProId: status === 'posted' ? undefined : PRO_UUID, backendProName: status === 'posted' ? undefined : 'Grace Hopper',
  pro: status === 'posted' ? undefined : { i: 'GH', n: 'Grace Hopper', s: 'Haven Pro', col: '#134E4A', r: null, j: null, memberSince: null, trustScore: null, proId: PRO_UUID, real: true },
  workPerformed: [], materials: [], proNotes: '', msgs: [], photos: [], desc: '', addressText: '1 Oak St, Orlando, FL 32801', addressLabel: 'Home',
});

async function delay(ms) { await new Promise(r => realSetTimeout(r, ms)); }
async function settle(ms = 40) { await act(async () => { await delay(ms); }); }
async function waitFor(check, label, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (check()) return true; await settle(25); }
  throw new Error('Timed out: ' + label);
}
async function mount(status) {
  cleanup();
  Object.keys(storedData).forEach(k => delete storedData[k]);
  storedData['haven_auth_access_token'] = 'signed-in-access-token';
  storedData['haven_auth_user_id'] = CUSTOMER_ID;
  storedData['haven_auth_email'] = 'qa-customer@example.com';
  storedData['haven_auth_role'] = 'customer';
  storedData['haven_notifications'] = JSON.stringify({ __v: 1, data: [] });
  storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: [job(status)] });
  remoteStatus = status; visibility = 'visible';
  calls.length = 0; requestedDelays.length = 0; timeoutDelays.length = 0; clockOffset = 0; scaleReadTimeout = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { render(React.createElement(App), container); });
  await settle(60);
  await waitFor(() => /What do you/.test(bodyText()), 'signed-in home');
}
async function tap(el, label) { if (!el) throw new Error('missing ' + label); await act(async () => { fireEvent.click(el); }); await settle(60); }
async function openBookings() {
  await tap(screen.getAllByText('Bookings').pop(), 'Bookings tab');
  for (let i = 0; i < 80 && !screen.queryAllByText(/Assemble furniture/).length; i++) await settle(25);
}
async function openTracking() {
  await openBookings();
  await tap(screen.queryAllByText(/Assemble furniture/).pop(), 'job card');
  await waitFor(() => /← Bookings/.test(bodyText()), 'tracking screen');
}
const liveCalls = () => calls.filter(c => c.url.includes(LIVE_PATH));
const card = () => document.querySelector('[data-testid="live-track"]');
const liveImgs = () => Array.from(document.querySelectorAll('img')).filter(i => /api\.mapbox\.com\/styles\/v1\/mapbox\//.test(i.getAttribute('src') || ''));
const pinFor = p => `pin-l+0F6E4E(${p.lng},${p.lat})`;
function noLeaks(label) {
  assert(!liveCalls().some(c => c.method !== 'POST'), '8. ' + label + ': the live-location function is only ever POSTed');
  assert(!calls.some(c => /supabase\.co/.test(c.url) && hasCoord(c.url)), '8. ' + label + ': no coordinates on any Supabase URL');
  assert(!liveCalls().some(c => new URL(c.url).search), '8. ' + label + ': no query string on the live-location call');
  assert(!Object.values(storedData).some(hasCoord), '8. ' + label + ': no coordinates in localStorage');
}
const okLive = (p, age) => jsonRes(200, { ok: true, available: true, point: { lat: p.lat, lng: p.lng }, received_at: new Date().toISOString(), captured_at: null, age_s: age == null ? 12 : age });

(async () => {
  // (2) startup, Home, Bookings, posted screen
  await mount('en_route');
  await settle(300);
  assert(liveCalls().length === 0, '2. startup and Home: no live-location call');
  await openBookings(); await settle(300);
  assert(liveCalls().length === 0, '2. Bookings list: no live-location call');
  await mount('posted');
  await openBookings();
  await tap(screen.queryAllByText(/Assemble furniture/).pop(), 'posted job card');
  await settle(400);
  assert(!/← Bookings/.test(bodyText()) || !card(), 'the posted job opens its waiting screen, not live tracking');
  assert(liveCalls().length === 0 && !card(), '2. posted / waiting screen: no live-location call, no live card');

  // (1)(3) tracking, live point, then the 10 s poll
  liveImpl = () => okLive(LIVE);
  await mount('en_route');
  await openTracking();
  await waitFor(() => liveImgs().length === 1, 'live map');
  const first = liveCalls()[0];
  assert(liveCalls().length === 1 && first.method === 'POST' && new URL(first.url).pathname === LIVE_PATH, '1. opening tracking: one POST to get_job_live_location');
  assert(JSON.stringify(JSON.parse(first.body)) === JSON.stringify({ p_job_id: JOB_UUID }), '1. the body is { p_job_id }');
  assert(requestedDelays.includes(10000), '1. the next read is scheduled 10 s later');
  liveImpl = () => okLive(LIVE2, 3);
  await waitFor(() => liveCalls().length >= 2, 'second read');
  await settle(60);
  assert(liveCalls().length === 2, '1. a second POST after the 10 s interval');
  const src = liveImgs()[0] ? liveImgs()[0].getAttribute('src') : '';
  assert(src.includes(pinFor(LIVE2)), '3. the pin is the Pro\'s point exactly as received (not rounded)');
  assert(liveImgs().length === 1 && !/F59E0B/.test(src), 'one pin only (no second marker)');
  assert(/Your Pro's live location/.test(bodyText()) && /Updated [345] sec ago/.test(bodyText()), 'the map is labelled as the Pro\'s live location with its age');
  // (7) no simulated countdown, no promised arrival time
  assert(!/min away|miles away|mi away|Arriving in|arrival window/i.test(bodyText()), '7. no simulated minutes / miles / arrival window');
  assert(!/A live arrival time will show here/.test(bodyText()), '7. no promised arrival time for a backend en_route job');
  assert(!document.querySelector('svg[viewBox="0 0 350 185"]') && !/This map shows your address/.test(bodyText()), '7. no decorative map; the property map is replaced while en_route');

  // (4) paused after a live point: no reuse of the earlier point
  liveImpl = () => jsonRes(200, { ok: true, available: false, reason: 'paused', last_received_at: new Date(Date.now() - 6 * 60000).toISOString() });
  await waitFor(() => card() && card().getAttribute('data-live-state') === 'paused', 'paused');
  assert(/Location paused\. Last update 6 min ago\./.test(bodyText()), '4. paused: "Location paused. Last update 6 min ago."');
  assert(liveImgs().length === 0 && !hasCoord(document.body.innerHTML), '4. paused: no marker and the earlier point is gone from the screen');
  // (4) waiting
  liveImpl = () => jsonRes(200, { ok: true, available: false, reason: 'waiting' });
  await waitFor(() => card() && card().getAttribute('data-live-state') === 'waiting', 'waiting');
  assert(/Waiting for the Pro's location/.test(bodyText()) && liveImgs().length === 0, '4. waiting: "Waiting for the Pro\'s location", no marker');
  noLeaks('polling');

  // (6) leaving the screen
  liveImpl = () => okLive(LIVE);
  await waitFor(() => liveImgs().length === 1, 'live again');
  await tap(Array.from(document.querySelectorAll('button')).find(b => /← Bookings/.test(b.textContent)), '← Bookings');
  let n = liveCalls().length;
  await settle(700);
  assert(liveCalls().length === n && liveImgs().length === 0, '6. leaving the tracking screen stops polling and clears the point');

  // (6) background / foreground
  await tap(screen.queryAllByText(/Assemble furniture/).pop(), 'job card again');
  await waitFor(() => liveImgs().length === 1, 'live on reopen');
  visibility = 'hidden';
  await act(async () => { document.dispatchEvent(new window.Event('visibilitychange')); }); await settle(60);
  n = liveCalls().length;
  await settle(700);
  assert(liveCalls().length === n && liveImgs().length === 0, '6. the app in the background: polling pauses and the point is cleared');
  visibility = 'visible';
  await act(async () => { document.dispatchEvent(new window.Event('visibilitychange')); }); await settle(60);
  await waitFor(() => liveCalls().length > n && liveImgs().length === 1, 'resumed');
  assert(true, '6. back in front with the job still en_route: polling resumes at once');

  // (6) leaving en_route via the existing jobs poll
  remoteStatus = 'arrived';
  await waitFor(() => !card(), 'job left en_route', 9000);
  n = liveCalls().length;
  await settle(700);
  assert(liveCalls().length === n && liveImgs().filter(i => i.getAttribute('src').includes('0F6E4E')).length === 0, '6. the job leaving en_route stops polling and clears the point');
  noLeaks('lifecycle');

  // (6) sign-out
  liveImpl = () => okLive(LIVE);
  await mount('en_route');
  await openTracking();
  await waitFor(() => liveImgs().length === 1, 'live before sign-out');
  await tap(screen.getAllByText('Profile').pop(), 'Profile tab');
  await waitFor(() => /Payment Methods/.test(bodyText()), 'profile');
  for (let i = 0; i < 80 && !screen.queryAllByText(/^Sign Out$/).length; i++) await settle(25);
  await tap(screen.queryAllByText(/^Sign Out$/).pop(), 'Sign Out row');
  await tap(Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.textContent.trim() === 'Sign out'), 'confirm sign out');
  await waitFor(() => !storedData['haven_auth_access_token'] || /Signed out/.test(bodyText()), 'signed out');
  n = liveCalls().length;
  await settle(800);
  assert(liveCalls().length === n && liveImgs().length === 0, '6. sign-out stops polling and clears the point');
  noLeaks('sign-out');

  // (5) stopping responses and network back-off
  for (const [label, impl] of [
    ['tracking_not_active', () => jsonRes(200, { ok: false, error: 'tracking_not_active' })],
    ['not_found', () => jsonRes(200, { ok: false, error: 'not_found' })],
    ['not_authenticated', () => jsonRes(200, { ok: false, error: 'not_authenticated' })],
    ['401', () => jsonRes(401, { message: 'JWT expired' })],
    ['403', () => jsonRes(403, { message: 'permission denied' })],
  ]) {
    liveImpl = impl;
    await mount('en_route');
    await openTracking();
    await waitFor(() => liveCalls().length >= 1 && card() && /ended|unavailable/.test(card().getAttribute('data-live-state')), label + ' state');
    await settle(800);
    assert(liveCalls().length === 1 && liveImgs().length === 0, '5. ' + label + ': no marker, polling stops');
    assert(label === 'tracking_not_active' ? /Location sharing has ended for this job\./.test(bodyText()) : /Your Pro's location isn't available\./.test(bodyText()), '5. ' + label + ': an honest line, no invented location');
  }
  liveImpl = () => { throw new Error('offline'); };
  await mount('en_route');
  await openTracking();
  await waitFor(() => card() && card().getAttribute('data-live-state') === 'network', 'network state');
  assert(liveImgs().length === 0 && /Couldn't load your Pro's location/.test(bodyText()), '5. network error: no marker, honest line');
  assert(requestedDelays.includes(30000) && !requestedDelays.includes(10000), '5. network error: backs off to 30 s (no 10 s poll)');
  assert(timeoutDelays.length >= 1 && timeoutDelays.every(d => d === 10000), '9. every read is bounded by a 10 s timeout');
  await settle(250);
  assert(liveCalls().length === 1, '5. network error: no read at the 10 s mark');
  liveImpl = () => okLive(LIVE);
  await waitFor(() => liveCalls().length === 2 && liveImgs().length === 1, 'retry after back-off');
  assert(true, '5. network error: tries again after the back-off and recovers');

  // (5) settled errors after a live pin: 5xx / 408 / 429 / malformed clear it and back off
  for (const [label, impl] of [
    ['500', () => jsonRes(500, {})], ['408', () => jsonRes(408, {})], ['429', () => jsonRes(429, {})],
    ['malformed JSON', () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } })],
  ]) {
    liveImpl = () => okLive(LIVE);
    await mount('en_route');
    await openTracking();
    await waitFor(() => liveImgs().length === 1, label + ': live first');
    liveImpl = impl;
    await waitFor(() => card() && card().getAttribute('data-live-state') === 'network', label + ': network state');
    assert(liveImgs().length === 0 && /Couldn't load your Pro's location/.test(bodyText()), '5. ' + label + ' after a live pin: pin removed, network copy');
    assert(requestedDelays[requestedDelays.length - 1] === 30000, '5. ' + label + ': next read in 30 s');
  }

  // (9) a hung read after a live pin: aborted at 10 s → network, retry at 30 s
  for (const [label, hang] of [
    ['request never settles', () => new Promise(() => {})],
    ['body never settles', () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })],
  ]) {
    liveImpl = () => okLive(LIVE);
    await mount('en_route');
    await openTracking();
    await waitFor(() => liveImgs().length === 1, label + ': live first');
    liveImpl = n => (n === 2 ? hang() : okLive(LIVE2, 1));
    await waitFor(() => liveCalls().length === 2, label + ': second read started');
    const hungCall = liveCalls()[1];
    await waitFor(() => card() && card().getAttribute('data-live-state') === 'network', label + ': timed out');
    assert(liveImgs().length === 0 && /Couldn't load your Pro's location\. Trying again shortly\./.test(bodyText()), '9. ' + label + ': aborted after the 10 s timeout, pin removed, network copy');
    assert(!!hungCall.signal && hungCall.signal.aborted === true, '9. ' + label + ': the request is aborted');
    assert(requestedDelays[requestedDelays.length - 1] === 30000, '9. ' + label + ': next read scheduled at 30 s');
    await waitFor(() => liveCalls().length === 3 && liveImgs().length === 1, label + ': recovers on the next read');
    assert(liveImgs()[0].getAttribute('src').includes(pinFor(LIVE2)), '9. ' + label + ': a hung read does not block later polls');
  }

  // (10) ageing and 5-minute expiry while a read is in flight
  liveImpl = () => okLive(LIVE, 3);
  await mount('en_route');
  scaleReadTimeout = false; // keep the next read pending (real 10 s timeout)
  await openTracking();
  await waitFor(() => liveImgs().length === 1, 'live');
  let release = null;
  liveImpl = () => new Promise(r => { release = () => r(jsonRes(200, { ok: true, available: false, reason: 'waiting' })); });
  await waitFor(() => liveCalls().length === 2 && release, 'read in flight');
  const ageText = () => (bodyText().match(/Updated (\d+) (sec|min) ago/) || []).slice(1).join(' ');
  clockOffset = 40000; await settle(1150);
  assert(/^4[3-5] sec$/.test(ageText()) && liveImgs().length === 1, '10. "Updated … ago" keeps counting (≈43 sec, not frozen at 3)');
  clockOffset = 4 * 60000; await settle(1150);
  assert(ageText() === '4 min' && liveImgs().length === 1, '10. at 4 minutes the pin still shows, "Updated 4 min ago"');
  clockOffset = 5 * 60000; await settle(1150);
  assert(liveCalls().length === 2 && !!release, '10. the read is still in flight');
  assert(liveImgs().length === 0 && card().getAttribute('data-live-state') === 'paused', '10. at 5 minutes the pin is hidden even with a read in flight');
  assert(/Location paused\. Last update 5 min ago\./.test(bodyText()) && !/Your Pro's live location/.test(bodyText()), '10. the locked paused copy replaces it');
  assert(!hasCoord(Array.from(document.querySelectorAll('img')).map(i => i.getAttribute('src')).join(' ')), '10. the expired point is no longer on screen');
  release(); await settle(100);
  scaleReadTimeout = true;

  // (10) timestamp fallbacks (no age_s): received_at, then captured_at
  {
    const vm = require('vm');
    const sb = { Date, Math, Number, String, encodeURIComponent };
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync('live_location_view.js', 'utf8') + '\n;globalThis.__v = { havenLivePointTime, havenLiveCurrentPoint, havenLiveAgeText };', sb);
    const V = sb.__v;
    const t0 = Date.parse('2026-11-06T20:00:00Z');
    const base = { state: 'live', point: { lat: 1, lng: 2 }, readAt: t0 };
    assert(V.havenLivePointTime({ ...base, ageS: 12, receivedAt: '2026-11-06T19:00:00Z' }) === t0 - 12000, 'point time = read time minus the server\'s age_s (immune to a wrong phone clock)');
    assert(V.havenLivePointTime({ ...base, ageS: null, receivedAt: '2026-11-06T19:59:30Z', capturedAt: '2026-11-06T19:59:00Z' }) === t0 - 30000, 'no age_s: the server\'s received_at');
    assert(V.havenLivePointTime({ ...base, ageS: null, receivedAt: null, capturedAt: '2026-11-06T19:59:00Z' }) === t0 - 60000, 'no received_at: captured_at');
    assert(V.havenLiveCurrentPoint({ ...base, ageS: null, receivedAt: null, capturedAt: null }, t0) === null, 'no time at all: no pin (never shown as current)');
    assert(V.havenLiveCurrentPoint({ ...base, ageS: 299 }, t0) !== null && V.havenLiveCurrentPoint({ ...base, ageS: 300 }, t0) === null, 'the pin expires at exactly 5 minutes');
    assert(V.havenLiveAgeText(t0 - 75000, t0) === 'Updated 1 min ago' && V.havenLiveAgeText(t0 - 9000, t0) === 'Updated 9 sec ago', 'age copy from the timestamp');
  }

  // (8) source: never a GET, never stored, never logged
  const src2 = fs.readFileSync('backend_adapter.js', 'utf8');
  const fn = src2.slice(src2.indexOf('const fetchJobLiveLocation='), src2.indexOf('const fetchAssignedProLabels='));
  assert(/method:"POST"/.test(fn) && !/\?p_job_id|console\.|localStorage/.test(fn.replace(/\/\/[^\n]*/g, '')), '8. read path: POST only, job id in the body, no logging, no storage');
  const view = fs.readFileSync('live_location_view.js', 'utf8').replace(/\/\/[^\n]*/g, '');
  assert(!/console\.|localStorage|get_assigned_job_destination|getArrivalSim/.test(view), 'display code never logs, stores, or uses the Pro-only destination');
  const app = fs.readFileSync('home_services_app.jsx', 'utf8');
  assert(!/getArrivalSim|minutesAway|milesAway/.test(app), '7. no simulated countdown code in the app');
  assert(!/realtime|\.channel\(/i.test(fn + view), 'no Realtime subscription');
  for (const f of ['index.html', 'prototype.html']) {
    const h = fs.readFileSync(f, 'utf8');
    assert(h.includes('rpc/get_job_live_location') && !/sb_secret_[A-Za-z0-9]|"role"\s*:\s*"service_role"|sk\.eyJ/.test(h), f + ': ships the read path and no secret key');
  }

  cleanup();
  console.log(`--- Customer live location view: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(String(e && e.message || e)); process.exit(1); });
