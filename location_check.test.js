/**
 * LOC-01 (Customer): the booking screen's "Check my location" is a real,
 * permission-based check and never a fabricated match.
 * Mounts the SHIPPED prototype.html script in jsdom with a mocked backend and
 * a mocked navigator.geolocation (no real device).
 * (1) Nothing is read until the customer taps; no location request at startup.
 * (2) Near / away by straight-line distance to the CONFIRMED address point;
 *     away explains and offers "Yes, this is the right address" / "Change
 *     address"; booking is never blocked.
 * (3) Unconfirmed address: no location request, an honest note.
 * (4) Denied, unavailable/timeout, imprecise readings: honest notes, retry.
 * (5) The device location is never sent or stored: job payload identical to
 *     master's (golden from MAP-04), no request contains the coordinates, and
 *     no storage key contains them. No Mapbox request.
 * (6) The old fabricated "Location matches this property" and the QA
 *     "Simulate different location" are gone.
 */
const { JSDOM } = require('jsdom');
global.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
// jsdom has no layout, so scrollTop is always 0. Give each element a real,
// per-element scrollTop so the app's save/restore logic can be observed.
const scrollStore = new WeakMap();
Object.defineProperty(dom.window.Element.prototype, 'scrollTop', {
  configurable: true,
  get() { return scrollStore.get(this) || 0; },
  set(v) { scrollStore.set(this, Number(v) || 0); },
});
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

const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
const { act } = require('react-dom/test-utils');
const babel = require('@babel/core');
const fs = require('fs');
const React = require('react');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); }
}
function bodyText() { return Array.from(document.body.children).filter(el => el.tagName !== 'STYLE').map(el => el.textContent).join(' '); }

// ── Load the shipped script block (same approach as verification_claims.test.js) ──
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

// ── Mocked backend (no network) ──
const CUSTOMER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const JOB_UUID = 'cccccccc-1111-4222-8333-444444444444';
const PRO_UUID = 'dddddddd-1111-4222-8333-555555555555';
let remoteRows = [];
const fetchLog = [];
let inserted = null;
global.fetch = async (url, opts) => {
  const u = String(url);
  fetchLog.push(u);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.endsWith('/auth/v1/health')) return ok({});
  // posting-time geocode (unchanged by MAP-04): a fixed answer so payloads compare exactly
  if (u.includes('api.mapbox.com')) return ok({ features: [{ geometry: { coordinates: [-81.379, 28.538] }, properties: {} }] });
  if (u.includes('/rest/v1/rpc/is_qa_tester')) return ok(false);
  if (u.endsWith('/rest/v1/jobs') && opts && opts.method === 'POST') { inserted = JSON.parse(opts.body); return ok([{ id: 'eeeeeeee-1111-4222-8333-444444444444' }]); }
  if (u.includes('/rest/v1/')) return ok([]);
  return { ok: false, status: 404, json: async () => [], text: async () => 'not found' };
};
global.window.fetch = global.fetch;
const authMock = { signOutCalls: 0, signOutImpl: null };
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
      signOut: async () => { authMock.signOutCalls += 1; return authMock.signOutImpl ? authMock.signOutImpl() : { error: null }; },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
};


const SAMPLE_HOME = { id: 1, label: 'Home', isPrimary: true, street: '123 Market Street', unit: 'Apt 4B', city: 'San Francisco', state: 'CA', zip: '94103', accessNotes: '', propertyType: 'Apartment', yearBuilt: '1998', sqft: '1,150', beds: '2', baths: '1' };
const SAMPLE_WORK = { id: 2, label: 'Work', isPrimary: false, street: '500 Folsom Street', unit: '', city: 'San Francisco', state: 'CA', zip: '94105', accessNotes: '', propertyType: '', yearBuilt: '', sqft: '', beds: '', baths: '' };
const SAMPLE_HOME_TEXT = '123 Market Street, Apt 4B, San Francisco, CA 94103';
const REAL = { id: 1760000000000, label: 'Home', isPrimary: false, street: '1 Oak St', unit: '', city: 'Orlando', state: 'FL', zip: '32801', accessNotes: 'Gate code at office', propertyType: 'House', yearBuilt: '1990', sqft: '1800', beds: '3', baths: '2' };
const GEO = { lat: 28.5383, lng: -81.3792, accuracy: 'rooftop', mapboxId: 'dXJuOm1ieGFkcjp0ZXN0', source: 'mapbox', confirmedAt: 1760000000000 };
const doneJob = (id, extra) => ({ id, status: 'complete', completedAt: id, taskId: 1, tpId: 2, lockedPrice: 65, acceptedAt: id - 7200000, workPerformed: ['Done'], materials: [], proNotes: '', msgs: [], photos: [], desc: '', pro: { i: 'MT', n: 'Marcus T.', s: 'Pro', col: '#1E40AF' }, ...extra });

function seedBase() {
  Object.keys(storedData).forEach(k => delete storedData[k]);
  storedData['haven_auth_access_token'] = 'signed-in-access-token';
  storedData['haven_auth_user_id'] = CUSTOMER_ID;
  storedData['haven_auth_email'] = 'qa-customer@example.com';
  storedData['haven_auth_role'] = 'customer';
  storedData['haven_notifications'] = JSON.stringify({ __v: 1, data: [] });
}
async function delay(ms) { await new Promise(r => setTimeout(r, ms)); }
async function settle(ms = 40) { await act(async () => { await delay(ms); }); }
async function waitFor(check, label, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (check()) return true; await settle(25); }
  throw new Error('Timed out: ' + label + '\n' + bodyText().slice(0, 400));
}

async function mount(seedFn) {
  cleanup();
  seedBase();
  if (seedFn) seedFn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { render(React.createElement(App), container); });
  await settle(60);
  await waitFor(() => /What do you/.test(bodyText()), 'signed-in home');
  return container;
}
function btn(re) { return Array.from(document.querySelectorAll('button')).find(b => re.test(b.textContent.trim())); }
async function tap(el, label) { if (!el) throw new Error('missing ' + label + '\n' + bodyText().slice(0, 300)); await act(async () => { fireEvent.click(el); }); await settle(60); }
const saved = () => JSON.parse(storedData['haven_addresses']).data;
const ids = () => saved().map(a => a.id).sort((a, b) => a - b);
const setAddrs = list => { storedData['haven_addresses'] = JSON.stringify({ __v: 1, data: list }); };
const setJobs = list => { storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: list }); };
async function openMyHome() {
  await tap(screen.getAllByText('Profile').pop(), 'Profile');
  await tap(btn(/^🏡\s*My Home/), 'My Home');
}



const fs2 = require('fs');
const GOLDEN = JSON.parse(fs2.readFileSync('test_fixtures/map04_master_job_payload.json', 'utf8'));
function normalize(p) { const o = JSON.parse(JSON.stringify(p)); for (const k of Object.keys(o)) if (['id','created_at','updated_at','client_job_id','local_id','requested_at','posted_at'].includes(k) || /_at$/.test(k)) o[k] = '<volatile>'; return o; }
const CONF = { ...REAL, isPrimary: true, geo: GEO };            // 28.5383, -81.3792 (Orlando)
const UNCONF = { ...REAL, isPrimary: true };
let geoCalls = 0, geoImpl = null;
const DEVICE = { near: { latitude: 28.5390, longitude: -81.3790, accuracy: 30 },           // ~80 m away
                 away: { latitude: 28.5653, longitude: -81.5862, accuracy: 25 },            // Winter Garden, ~12.6 mi
                 fuzzy: { latitude: 28.5383, longitude: -81.3792, accuracy: 5000 } };
const UNIQUE = ['28.539', '-81.379', '28.5653', '-81.5862'];
function setGeo(kind) {
  geoCalls = 0;
  geoImpl = (ok, err) => { geoCalls++;
    if (kind === 'denied') return setTimeout(() => err({ code: 1, message: 'denied' }), 10);
    if (kind === 'timeout') return setTimeout(() => err({ code: 3, message: 'timeout' }), 10);
    setTimeout(() => ok({ coords: DEVICE[kind], timestamp: Date.now() }), 10);
  };
  Object.defineProperty(global.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok, err) => geoImpl(ok, err) } });
}
const RealDate = Date;
function fixClock() { const d = new RealDate(); d.setDate(d.getDate() + 1); d.setHours(9, 30, 0, 0); const t = d.getTime(); global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } }; global.window.Date = global.Date; }
async function openBooking(addrs) { fixClock(); await mount(() => setAddrs(addrs)); await tap(screen.getAllByText('Mount TV')[0], 'Mount TV'); }
const checkBtn = () => Array.from(document.querySelectorAll('button')).find(b => /Check my location/.test(b.textContent));
const postBtn = () => Array.from(document.querySelectorAll('button')).find(b => /Post Job|to continue/.test(b.textContent));
async function runCheck() { await tap(checkBtn(), 'Check my location'); await settle(60); }
async function postJob() {
  const win = document.querySelector('[role="group"][aria-label="Arrival window"] button'); if (win) await tap(win, 'window');
  inserted = null; const p = postBtn(); if (!p || p.disabled) throw new Error('post not ready: ' + (p && p.textContent));
  await tap(p, 'Post Job'); await waitFor(() => inserted !== null, 'job insert'); return normalize(inserted);
}

(async () => {
  // (1) startup + nothing until tap
  setGeo('near'); fetchLog.length = 0;
  await openBooking([CONF]);
  assert(geoCalls === 0 && checkBtn(), 'no location request until the customer taps "Check my location"');
  assert(!/Location matches this property/.test(bodyText()), 'no "matches" text before any check');
  // (2) near
  await runCheck();
  assert(geoCalls === 1, 'one location request on tap');
  assert(/Your phone appears to be near this address\./.test(bodyText()) && !/Location matches this property/.test(bodyText()), 'near: hedged wording, never "matches"');
  // (2) away
  setGeo('away'); await openBooking([CONF]); await runCheck();
  assert(/Your phone appears to be about 13 mi from Home\. That's fine: you don't need to be there to book\./.test(bodyText()), 'away: explains the distance (straight-line, ~12.6 mi shown as 13 mi) and that being there is not required');
  const yes = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Yes, this is the right address');
  const chg = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Change address');
  assert(yes && chg, 'away: offers "Yes, this is the right address" and "Change address"');
  const win = document.querySelector('[role="group"][aria-label="Arrival window"] button'); if (win) await tap(win, 'window');
  assert(postBtn() && !postBtn().disabled && /Post Job/.test(postBtn().textContent), 'away: booking is not blocked');
  await tap(yes, 'Yes');
  assert(/You confirmed Home as the service address\./.test(bodyText()) && !/appears to be about/.test(bodyText()), 'confirming keeps the address and clears the warning');
  // change address with a single address opens that address's form
  setGeo('away'); await openBooking([CONF]); await runCheck();
  await tap(Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Change address'), 'Change address');
  assert(document.getElementById('addr-search') || /Saved addresses|Edit address|Add address/.test(bodyText()), '"Change address" leads to changing the address');
  // switching address resets the result
  const OTHER = { id: 1760000000009, label: 'Rental', isPrimary: false, street: '9 Pine Ave', unit: '', city: 'Winter Garden', state: 'FL', zip: '34787', accessNotes: '', propertyType: 'House', yearBuilt: '2001', sqft: '1500', beds: '3', baths: '2', geo: { ...GEO, lat: 28.5653, lng: -81.5862, mapboxId: 'b3RoZXI' } };
  setGeo('away'); await openBooking([CONF, OTHER]); await runCheck();
  await tap(Array.from(document.querySelectorAll('[role="button"]')).find(e => e.textContent.trim() === 'Change'), 'Change');
  await tap(Array.from(document.querySelectorAll('[role="button"]')).find(e => /^Rental/.test(e.textContent.trim())), 'Rental');
  assert(checkBtn() && !/appears to be about/.test(bodyText()), 'choosing another address clears the old result (not reused for a different address)');
  // (3) unconfirmed
  setGeo('near'); await openBooking([UNCONF]); await runCheck();
  assert(geoCalls === 0 && /Confirm this address on the map first/.test(bodyText()) && /You can book either way/.test(bodyText()), 'unconfirmed address: no location request, honest note, booking allowed');
  // (4) denied / timeout / imprecise
  setGeo('denied'); await openBooking([CONF]); await runCheck();
  assert(/Location access is off, so Haven can't compare\. That's fine: you can still book this address\./.test(bodyText()), 'denied: honest note');
  setGeo('timeout'); await openBooking([CONF]); await runCheck();
  assert(/Couldn't get your location right now\. You can still book this address\./.test(bodyText()), 'timeout/unavailable: honest note');
  setGeo('near'); await tap(Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Try again'), 'Try again'); await settle(60);
  assert(/appears to be near this address/.test(bodyText()), 'Try again runs a fresh check');
  setGeo('fuzzy'); await openBooking([CONF]); await runCheck();
  assert(/too imprecise right now \(within about 3\.1 mi\)/.test(bodyText()) && !/near this address/.test(bodyText()), 'imprecise reading (±5 km): no near/away claim');
  Object.defineProperty(global.navigator, 'geolocation', { configurable: true, value: undefined });
  await openBooking([CONF]); await runCheck();
  assert(/Couldn't get your location right now/.test(bodyText()), 'no geolocation support: honest note');
  // (5) never sent or stored
  setGeo('away'); fetchLog.length = 0;
  await openBooking([CONF]); await runCheck();
  const pc = await postJob();
  assert(JSON.stringify(pc) === JSON.stringify(GOLDEN.confirmed), 'job payload after a location check is identical to master\'s (device location not sent)');
  assert(!fetchLog.some(u => UNIQUE.some(x => u.includes(x))) && !fetchLog.some(u => /mapbox/.test(u) && !/geocode\/v6\/forward/.test(u) && !/search\/geocode/.test(u)), 'no request carries the device coordinates; no extra Mapbox request');
  assert(!Object.values(storedData).some(v => ['28.5653', '-81.5862'].some(x => String(v).includes(x))), 'the device location is not saved in storage');
  // (6) old fake paths gone (source)
  const html = fs2.readFileSync('prototype.html', 'utf8');
  assert(!/Location matches this property|Simulate different location|SIMULATED_NEARBY_CITIES|simulateDifferentLocation/.test(html), 'fabricated match text and QA location simulation are gone');
  global.Date = RealDate; global.window.Date = RealDate;
  cleanup();
  console.log(`--- LOC-01 location check: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
