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
global.fetch = async (url) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.endsWith('/auth/v1/health')) return ok({});
  if (u.includes('/rest/v1/rpc/is_qa_tester')) return ok(false);
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

  // a real address that happens to match the sample text but is the customer's own (different id) is kept
  await mount(() => setAddrs([{ ...SAMPLE_HOME, id: 1761000000000 }]));
  assert(saved().length === 1 && saved()[0].id === 1761000000000, 'an address with the sample text but a different id (customer-created) is kept');

  // removal persists and does not repeat-delete anything new
  await mount(() => setAddrs([SAMPLE_HOME, SAMPLE_WORK, REAL]));
  const afterFirst = storedData['haven_addresses'];
  await mount(() => { storedData['haven_addresses'] = afterFirst; });
  assert(storedData['haven_addresses'] === afterFirst && ids().length === 1, 'reopening the app keeps the result stable');

  cleanup();
  console.log(`--- MAP-03 home maps: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
