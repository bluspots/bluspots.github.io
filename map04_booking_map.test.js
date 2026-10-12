/**
 * MAP-04 (Customer): the confirmed property map on the booking review screen.
 * Mounts the SHIPPED prototype.html script in jsdom with a mocked backend.
 * (1) A confirmed address shows a real Mapbox map of exactly the confirmed
 *     point (light/dark styles, lazy image, alt text, caption); approximate
 *     points say so; nothing about a Pro, arrival or route on the map.
 * (2) An unconfirmed address shows no map and a "Confirm on map" prompt that
 *     opens that address with address search; no address: unchanged.
 * (3) Switching the booking address switches the map.
 * (4) The job sent to Supabase is byte-identical to what master sends for the
 *     same booking (golden payload captured from master: test_fixtures/
 *     map04_master_job_payload.json), with a confirmed and an unconfirmed address.
 * (5) Nothing map-related at startup. Pricing is covered by (4): the price
 *     fields in the payload must equal master's.
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
const GOLDEN = 'test_fixtures/map04_master_job_payload.json';
const VOLATILE = ['id', 'created_at', 'updated_at', 'client_job_id', 'local_id', 'requested_at', 'posted_at'];
function normalize(p) { const o = JSON.parse(JSON.stringify(p)); for (const k of Object.keys(o)) if (VOLATILE.includes(k) || /_at$/.test(k)) o[k] = '<volatile>'; return o; }
const mapImgs = () => Array.from(document.querySelectorAll('img')).filter(i => /api\.mapbox\.com\/styles\/v1\/mapbox\//.test(i.getAttribute('src') || ''));
const CONF = { ...REAL, isPrimary: true, geo: GEO };
const OTHER = { id: 1760000000009, label: 'Rental', isPrimary: false, street: '9 Pine Ave', unit: '', city: 'Winter Garden', state: 'FL', zip: '34787', accessNotes: '', propertyType: 'House', yearBuilt: '2001', sqft: '1500', beds: '3', baths: '2', geo: { ...GEO, lat: 28.5653, lng: -81.5862, mapboxId: 'b3RoZXI' } };
const RealDate = Date;
function fixClock() { const d = new RealDate(); d.setDate(d.getDate() + 1); d.setHours(9, 30, 0, 0); const t = d.getTime(); global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } }; global.window.Date = global.Date; }
async function openBooking(addrs, theme) {
  fixClock();
  await mount(() => { setAddrs(addrs); if (theme === 'dark') storedData['haven_theme'] = JSON.stringify({ __v: 1, data: 'dark' }); });
  await tap(screen.getAllByText('Mount TV')[0], 'Mount TV');
}
const postBtn = () => Array.from(document.querySelectorAll('button')).find(b => /Post Job|to continue/.test(b.textContent));
async function postJob() {
  const win = document.querySelector('[role="group"][aria-label="Arrival window"] button');
  if (win) await tap(win, 'window');
  inserted = null;
  const p = postBtn(); if (!p || p.disabled) throw new Error('post not ready: ' + (p && p.textContent));
  await tap(p, 'Post Job');
  await waitFor(() => inserted !== null, 'job insert');
  return normalize(inserted);
}

(async () => {
  if (process.env.MAP04_CAPTURE) {
    const out = {};
    await openBooking([CONF]); out.confirmed = await postJob();
    await openBooking([{ ...REAL, isPrimary: true }]); out.unconfirmed = await postJob();
    fs2.writeFileSync(process.env.MAP04_CAPTURE, JSON.stringify(out, null, 2) + '\n');
    console.log('captured'); process.exit(0);
  }
  // (5) startup
  fetchLog.length = 0;
  await mount(() => setAddrs([CONF]));
  assert(mapImgs().length === 0 && !fetchLog.some(u => /api\.mapbox\.com\/styles/.test(u)), 'startup: no map image and no map request');

  // (1) confirmed, light
  await openBooking([CONF]);
  let imgs = mapImgs();
  assert(imgs.length === 1, 'booking review shows one map for a confirmed address');
  const src = imgs[0] ? imgs[0].getAttribute('src') : '';
  assert(/\/streets-v12\/static\/pin-l\+F59E0B\(-81\.379200,28\.538300\)\/-81\.379200,28\.538300,16,0\//.test(src), 'the map pins exactly the confirmed point (light style)');
  assert(imgs[0] && imgs[0].getAttribute('loading') === 'lazy' && /Map of Home at 1 Oak St, Orlando/.test(imgs[0].getAttribute('alt')), 'lazy image with descriptive alt text');
  assert(/The location you confirmed for this address\./.test(bodyText()) && !/approximate/i.test(bodyText().slice(bodyText().indexOf('The location you confirmed'), bodyText().indexOf('The location you confirmed') + 120)), 'caption: confirmed location, not approximate');
  const fig = document.querySelector('figure');
  assert(fig && !/Pro|arriv|route|min away|ETA|on the way/i.test(fig.textContent), 'the map says nothing about a Pro, arrival or route');
  assert(/Loading map…/.test(bodyText()), 'loading state');
  await act(async () => { fireEvent.error(mapImgs()[0]); }); await settle(20);
  assert(/The map couldn't load right now\. Your saved address is unchanged\./.test(bodyText()), 'error state');
  const price = (bodyText().match(/Post Job — \$\d+|Pick a time to continue/) || [''])[0];
  assert(!!price, 'booking still shows its post button');

  // dark
  await openBooking([CONF], 'dark');
  assert(mapImgs()[0] && /\/dark-v11\/static\//.test(mapImgs()[0].getAttribute('src')), 'dark mode uses the dark map style');

  // approximate
  await openBooking([{ ...CONF, geo: { ...GEO, accuracy: 'street' } }]);
  assert(mapImgs().length === 1 && /It's approximate: placed near the street, not on the exact building\./.test(bodyText()), 'approximate point is labeled approximate');

  // (2) unconfirmed
  await openBooking([{ ...REAL, isPrimary: true }]);
  assert(mapImgs().length === 0 && !document.querySelector('figure'), 'unconfirmed address: no map');
  assert(/This address isn't confirmed on the map yet\./.test(bodyText()), 'unconfirmed address: says so');
  await tap(btn(/Confirm on map/), 'Confirm on map');
  assert(document.getElementById('addr-search') && /1 Oak St/.test(document.body.innerHTML), '"Confirm on map" opens this address with address search');
  assert(!fetchLog.some(u => /permanent=true/.test(u)), 'no paid lookup from opening the form');
  // no address at all
  await openBooking([]);
  assert(mapImgs().length === 0 && !/isn't confirmed on the map/.test(bodyText()) && postBtn() && /Add an address to continue/.test(postBtn().textContent), 'no saved address: unchanged (asks for an address, no map)');

  // (3) switching address switches the map
  await openBooking([CONF, OTHER]);
  assert(/-81\.379200,28\.538300/.test(mapImgs()[0].getAttribute('src')), 'primary address map first');
  await tap(Array.from(document.querySelectorAll('[role="button"]')).find(e => e.textContent.trim() === 'Change'), 'Change');
  await tap(Array.from(document.querySelectorAll('[role="button"]')).find(e => /^Rental/.test(e.textContent.trim())), 'Rental');
  assert(mapImgs().length === 1 && /-81\.586200,28\.565300/.test(mapImgs()[0].getAttribute('src')), 'choosing another address shows that address on the map');

  // (4) payload identical to master
  const golden = JSON.parse(fs2.readFileSync(GOLDEN, 'utf8'));
  await openBooking([CONF]);
  const pc = await postJob();
  assert(JSON.stringify(pc) === JSON.stringify(golden.confirmed), 'job sent for a confirmed address is identical to master\'s' + (JSON.stringify(pc) === JSON.stringify(golden.confirmed) ? '' : '\n got ' + JSON.stringify(pc) + '\n want ' + JSON.stringify(golden.confirmed)));
  assert(!JSON.stringify(pc).includes('dXJuOm1ieGFkcjp0ZXN0') && !JSON.stringify(pc).includes('rooftop'), 'the confirmed point\'s Mapbox id and accuracy are not sent');
  await openBooking([{ ...REAL, isPrimary: true }]);
  const pu = await postJob();
  assert(JSON.stringify(pu) === JSON.stringify(golden.unconfirmed), 'job sent for an unconfirmed address is identical to master\'s');

  global.Date = RealDate; global.window.Date = RealDate;
  cleanup();
  console.log(`--- MAP-04 booking map: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
