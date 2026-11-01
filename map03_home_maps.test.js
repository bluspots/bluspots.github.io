/**
 * MAP-03 (Customer): real property maps + no sample addresses.
 * Mounts the SHIPPED prototype.html script in jsdom with a mocked backend.
 *
 * Slice 1. Sample addresses:
 * (1) A new device starts with no saved addresses (no "123 Market Street").
 * (2) An existing device loses the two old sample addresses only while each is
 *     still exactly the sample: same id, every field unchanged, no map
 *     confirmation, and no job saved at that address.
 * (3) Edited samples, map-confirmed samples, samples with jobs, and real
 *     addresses are kept exactly as stored; jobs are never changed.
 *
 * Slices 2-3. Real maps:
 * (4) My Home shows a real Mapbox map (light/dark) of a property whose location
 *     the customer confirmed; approximate locations say so; loading and error
 *     states; an unconfirmed property offers "Confirm on map" instead.
 * (5) Tracking no longer draws a map with a moving car. It shows the job's
 *     property map only when the job's address is one of the customer's own
 *     confirmed addresses, captioned as the address and not the Pro's live
 *     location. No match, no map. Coordinates come only from the customer's own
 *     saved address, never from the job row.
 * (6) Nothing map-related renders or is requested at startup.
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
// Phase 1B B4: the backend is the source of truth, so the seeded jobs are
// real mocked backend rows too: every seeded job gets a backend id, and the
// account read (order=posted_at) returns this account's rows for them with
// the stored amounts (labor = the job's locked price; nothing else added).
let seededBackendRows = [];
function havenSeedBackendRows(jobs) {
  seededBackendRows = [];
  return jobs.map((j, i) => {
    const backendJobId = j.backendJobId || `5eed0000-0000-4000-8000-${String(Math.abs(Number(j.id) || i) % 1e12).padStart(12, '0')}`;
    seededBackendRows.push({
      id: backendJobId, status: j.status, customer_id: CUSTOMER_ID, pro_id: j.backendProId || null,
      fixed_customer_labor_price_cents: Math.round((j.lockedPrice ?? 0) * 100), emergency_fee_cents: 0, tip_amount_cents: 0,
      materials_items: [], materials_estimate_cents: 0, materials_approved_cents: null,
      address_snapshot: j.addressText || null,
    });
    return { ...j, backendJobId };
  });
}
global.fetch = async (url) => {
  const u = String(url);
  fetchLog.push(u);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.includes('/rest/v1/jobs') && u.includes('order=posted_at')) return ok(seededBackendRows);
  if (u.endsWith('/auth/v1/health')) return ok({});
  if (u.includes('/rest/v1/rpc/is_qa_tester')) return ok(false);
  if (u.includes('/rest/v1/jobs?id=in.') && remoteRows.length) return ok(remoteRows);
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
  // QA #87 v7 (a): saved addresses are per account; the seeded list is this customer's.
  storedData['haven_addresses_owner'] = CUSTOMER_ID;
  // Phase 1B B4: the jobs cache belongs to the signed-in customer.
  storedData['haven_jobs_owner'] = CUSTOMER_ID;
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
const setJobs = list => { storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: havenSeedBackendRows(list) }); };
async function openMyHome() {
  await tap(screen.getAllByText('Profile').pop(), 'Profile');
  await tap(btn(/^🏡\s*My Home/), 'My Home');
}

(async () => {
  // ── Slice 1: sample addresses ──
  // (1) new device
  await mount();
  assert(Array.isArray(saved()) && saved().length === 0, 'new device: no addresses are created');
  assert(!/Market Street|Folsom/.test(bodyText()), 'new device: no sample address text anywhere on the home screen');
  await openMyHome();
  assert(/No property saved yet/.test(bodyText()) && btn(/Add a property/), 'new device: My Home asks to add a property');

  // (2) existing device, both samples untouched, no jobs
  await mount(() => setAddrs([SAMPLE_HOME, SAMPLE_WORK]));
  assert(saved().length === 0, 'both untouched samples are removed from an existing device');

  // isPrimary alone changing is not an edit (the customer only re-ordered)
  await mount(() => setAddrs([{ ...SAMPLE_HOME, isPrimary: false }, { ...SAMPLE_WORK, isPrimary: true }, { ...REAL }]));
  assert(JSON.stringify(ids()) === JSON.stringify([REAL.id]), 'samples whose only change is which one is primary are still removed; the real address stays');
  assert(saved()[0].isPrimary === true, 'the remaining real address becomes the primary home');
  assert(saved()[0].accessNotes === REAL.accessNotes && saved()[0].sqft === REAL.sqft, 'the real address keeps every field exactly');

  // (3) edited samples are kept, field by field
  for (const [field, value] of [['label', 'Mom\'s place'], ['street', '124 Market Street'], ['unit', 'Apt 5C'], ['zip', '94104'], ['accessNotes', 'Ring twice'], ['sqft', '1,200'], ['beds', '3'], ['propertyType', 'Condo']]) {
    await mount(() => setAddrs([{ ...SAMPLE_HOME, [field]: value }, SAMPLE_WORK]));
    assert(JSON.stringify(ids()) === '[1]' && saved()[0][field] === value, `a sample whose ${field} was edited is kept (and the untouched one is removed)`);
  }
  // map-confirmed sample kept
  await mount(() => setAddrs([{ ...SAMPLE_HOME, geo: GEO }, SAMPLE_WORK]));
  assert(JSON.stringify(ids()) === '[1]' && saved()[0].geo && saved()[0].geo.mapboxId === GEO.mapboxId, 'a sample the customer confirmed on the map is kept with its location');

  // sample with a job at it: kept, history intact; jobs never changed
  const jobAtSample = doneJob(1759000000000, { addressText: SAMPLE_HOME_TEXT, addressLabel: 'Home' });
  const jobElsewhere = doneJob(1759100000000, { addressText: '1 Oak St, Orlando, FL 32801', addressLabel: 'Home' });
  const activeAtSample = { ...doneJob(1759200000000, { addressText: SAMPLE_HOME_TEXT, addressLabel: 'Home' }), status: 'scheduled', completedAt: undefined };
  await mount(() => { setAddrs([SAMPLE_HOME, SAMPLE_WORK, REAL]); setJobs([jobAtSample, jobElsewhere]); });
  const jobsBefore = JSON.stringify([jobAtSample, jobElsewhere]);
  assert(JSON.stringify(ids()) === JSON.stringify([1, REAL.id]), 'a sample with a completed job at it is kept; the unused sample is removed');
  assert(JSON.stringify(JSON.parse(storedData['haven_jobs']).data.map(j => ({ id: j.id, addressText: j.addressText, addressLabel: j.addressLabel, status: j.status }))) === JSON.stringify(JSON.parse(jobsBefore).map(j => ({ id: j.id, addressText: j.addressText, addressLabel: j.addressLabel, status: j.status }))), 'jobs are unchanged (ids, addresses, labels, statuses)');
  await openMyHome();
  assert(/123 Market Street/.test(bodyText()) && /1 completed/.test(bodyText()), 'the kept sample still shows its service history on My Home');
  await mount(() => { setAddrs([SAMPLE_HOME, SAMPLE_WORK]); setJobs([activeAtSample]); });
  assert(JSON.stringify(ids()) === '[1]', 'a sample with an open (not yet complete) job at it is also kept');
  // MAP-03 upgrade from master: master caches have no haven_jobs_owner; the sample with a job is still kept
  await mount(() => { delete storedData['haven_jobs_owner']; setAddrs([SAMPLE_HOME, SAMPLE_WORK]); setJobs([jobAtSample]); });
  assert(JSON.stringify(ids()) === '[1]' && saved()[0].street === '123 Market Street', 'master-style storage (no jobs owner): a sample with a completed job at it is kept');
  // The same upgrade with backend rows shaped like the real backend: postJob
  // never stores a street address (address_snapshot null, city_label only).
  // The link and the sample must survive the upgrade and a reload.
  await mount(() => {
    delete storedData['haven_jobs_owner']; setAddrs([SAMPLE_HOME, SAMPLE_WORK]); setJobs([jobAtSample]);
    seededBackendRows = seededBackendRows.map(r => ({ ...r, address_snapshot: null, city_label: 'San Francisco, CA', posted_at: '2025-09-27T19:00:00Z' }));
  });
  await settle(150);
  assert(JSON.stringify(ids()) === '[1]', 'master-style storage, real-shaped backend rows: the sample with a completed job at it is kept');
  await openMyHome();
  assert(/123 Market Street/.test(bodyText()) && /1 completed/.test(bodyText()) && /1 saved/.test(bodyText()), 'master-style storage, real-shaped backend rows: My Home shows 1 completed and Receipts 1 saved at the sample');
  cleanup();
  { const c = document.createElement('div'); document.body.appendChild(c); await act(async () => { render(React.createElement(App), c); }); }
  await settle(60);
  await waitFor(() => /What do you/.test(bodyText()), 'reload');
  await settle(150);
  assert(JSON.stringify(ids()) === '[1]', 'master-style storage, real-shaped backend rows: after a reload the sample is still kept');
  await openMyHome();
  assert(/1 completed/.test(bodyText()), 'master-style storage, real-shaped backend rows: after a reload the job is still linked');

  // a real address that happens to match the sample text but is the customer's own (different id) is kept
  await mount(() => setAddrs([{ ...SAMPLE_HOME, id: 1761000000000 }]));
  assert(saved().length === 1 && saved()[0].id === 1761000000000, 'an address with the sample text but a different id (customer-created) is kept');

  // removal persists and does not repeat-delete anything new
  await mount(() => setAddrs([SAMPLE_HOME, SAMPLE_WORK, REAL]));
  const afterFirst = storedData['haven_addresses'];
  await mount(() => { storedData['haven_addresses'] = afterFirst; });
  assert(storedData['haven_addresses'] === afterFirst && ids().length === 1, 'reopening the app keeps the result stable');

  // ── Slices 2-3: real maps ──
  const mapImgs = () => Array.from(document.querySelectorAll('img')).filter(i => /api\.mapbox\.com\/styles\/v1\/mapbox\//.test(i.getAttribute('src') || ''));
  const CONFIRMED = { ...REAL, isPrimary: true, geo: GEO };
  const CONFIRMED_TEXT = '1 Oak St, Orlando, FL 32801';

  // (6) startup: nothing map-related
  fetchLog.length = 0;
  await mount(() => setAddrs([CONFIRMED]));
  assert(mapImgs().length === 0, 'startup (home screen): no map image is rendered');
  assert(!fetchLog.some(u => /mapbox/.test(u)), 'startup: no Mapbox request is made');

  // (4) My Home, confirmed, light
  await openMyHome();
  let imgs = mapImgs();
  assert(imgs.length === 1, 'My Home shows one map for a confirmed property');
  const src = imgs[0] ? imgs[0].getAttribute('src') : '';
  assert(/\/streets-v12\/static\/pin-l\+F59E0B\(-81\.379200,28\.538300\)\/-81\.379200,28\.538300,16,0\//.test(src), 'the map is centered on and pins the confirmed location (light style)');
  assert(imgs[0] && imgs[0].getAttribute('loading') === 'lazy' && imgs[0].getAttribute('decoding') === 'async', 'the map image loads lazily');
  assert(imgs[0] && /Map of Home at 1 Oak St, Orlando/.test(imgs[0].getAttribute('alt')), 'the map has a descriptive alt text');
  assert(/The location you confirmed for this address\./.test(bodyText()) && !/approximate/i.test(bodyText()), 'precise location: caption says it is the confirmed location, no approximate note');
  assert(/Loading map…/.test(bodyText()), 'loading state shows until the image loads');
  await act(async () => { fireEvent.load(imgs[0]); }); await settle(20);
  assert(!/Loading map…/.test(bodyText()) && mapImgs()[0].style.opacity === '1', 'loaded: the map is shown and the loading text is gone');
  assert(!/isn't confirmed on the map/.test(bodyText()), 'a confirmed property does not ask to confirm');
  assert(!/🚗/.test(bodyText()), 'no car or live-tracking imagery on My Home');
  const addrBefore = storedData['haven_addresses'];
  await act(async () => { fireEvent.error(mapImgs()[0]); }); await settle(20);
  assert(/The map couldn't load right now\. Your saved address is unchanged\./.test(bodyText()) && mapImgs().length === 0, 'error state: a clear message replaces the broken image');
  assert(storedData['haven_addresses'] === addrBefore, 'a map error changes no saved data');

  // dark
  await mount(() => { setAddrs([CONFIRMED]); storedData['haven_theme'] = JSON.stringify({ __v: 1, data: 'dark' }); });
  await openMyHome();
  assert(mapImgs()[0] && /\/dark-v11\/static\//.test(mapImgs()[0].getAttribute('src')), 'dark mode uses the dark map style');

  // approximate
  await mount(() => setAddrs([{ ...CONFIRMED, geo: { ...GEO, accuracy: 'street' } }]));
  await openMyHome();
  assert(mapImgs().length === 1 && /It's approximate: placed near the street, not on the exact building\./.test(bodyText()), 'an approximate location is labeled approximate');

  // unconfirmed
  await mount(() => setAddrs([{ ...REAL, isPrimary: true }]));
  await openMyHome();
  assert(mapImgs().length === 0 && !document.querySelector('svg[viewBox="0 0 350 185"]'), 'an unconfirmed property shows no map and no drawn map');
  assert(/This address isn't confirmed on the map yet\./.test(bodyText()), 'an unconfirmed property says it is not confirmed');
  await tap(btn(/Confirm on map/), 'Confirm on map');
  assert(document.getElementById('addr-search') && /1 Oak St/.test(document.body.innerHTML), '"Confirm on map" opens this address in the form with address search');
  assert(fetchLog.filter(u => /permanent=true/.test(u)).length === 0, 'opening the form makes no paid lookup');

  // (5) Tracking
  const now = Date.now();
  const trackJob = (addressText) => ({
    id: now - 5000, taskId: 1, tpId: 2, lockedPrice: 65, status: 'en_route', acceptedAt: now - 600000,
    backendJobId: JOB_UUID, backendProId: PRO_UUID, backendProName: 'Grace Hopper',
    pro: { i: 'GH', n: 'Grace Hopper', s: 'Haven Pro', col: '#134E4A', r: null, j: null, memberSince: null, trustScore: null, proId: PRO_UUID, real: true },
    workPerformed: [], materials: [], proNotes: '', msgs: [], photos: [], desc: '', addressText, addressLabel: 'Home',
  });
  // the job row carries other coordinates; the map must not use them
  remoteRows = [{ id: JOB_UUID, status: 'en_route', customer_id: CUSTOMER_ID, pro_id: PRO_UUID, lat: 40.1111, lng: -75.2222, service_lat: 40.1111, service_lng: -75.2222 }];
  async function openTracking() {
    await tap(screen.getAllByText('Bookings').pop(), 'Bookings tab');
    for (let i = 0; i < 80 && !screen.queryAllByText(/Assemble furniture/).length; i++) await settle(25);
    await tap(screen.queryAllByText(/Assemble furniture/).pop(), 'job card');
    await waitFor(() => /← Bookings/.test(bodyText()), 'tracking screen');
  }
  await mount(() => { setAddrs([CONFIRMED]); setJobs([trackJob(CONFIRMED_TEXT)]); });
  await openTracking();
  imgs = mapImgs();
  assert(imgs.length === 1 && /pin-l\+F59E0B\(-81\.379200,28\.538300\)/.test(imgs[0].getAttribute('src')), 'tracking shows the confirmed property map for the job address');
  assert(!/40\.11|75\.22/.test(imgs[0] ? imgs[0].getAttribute('src') : ''), 'tracking map uses the customer\'s own saved location, not coordinates from the job row');
  assert(/Your property · Home/.test(bodyText()) && /This map shows your address, not your Pro's live location\./.test(bodyText()), 'tracking map is captioned as the address, not live Pro location');
  // (the 🚗 status icon beside "Pro is on the way" is the existing status icon, not a map)
  assert(!document.querySelector('svg[viewBox="0 0 350 185"]') && !Array.from(document.querySelectorAll('figure')).some(f => /🚗|🏠/.test(f.textContent.replace('📍', ''))), 'the drawn map with a moving car and house is gone; the map area has no car');
  assert(imgs[0] && imgs[0].getAttribute('loading') === 'lazy', 'tracking map loads lazily');

  await mount(() => { setAddrs([{ ...REAL, isPrimary: true }]); setJobs([trackJob(CONFIRMED_TEXT)]); });
  await openTracking();
  assert(mapImgs().length === 0 && !document.querySelector('svg[viewBox="0 0 350 185"]') && !document.querySelector('figure'), 'tracking at an unconfirmed address shows no map at all');
  await mount(() => { setAddrs([CONFIRMED]); setJobs([trackJob('77 Elsewhere Rd, Tampa, FL 33601')]); });
  await openTracking();
  assert(mapImgs().length === 0, 'tracking for an address that is not one of the customer\'s saved addresses shows no map');
  assert(/is on the way/.test(bodyText()), 'the real job status is still shown on tracking');
  remoteRows = [];

  cleanup();
  console.log(`--- MAP-03 home maps: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
