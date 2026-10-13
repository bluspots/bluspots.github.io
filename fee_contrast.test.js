/**
 * UI-02 (Customer): urgent-fee text contrast on the booking timing options.
 * Mounts the SHIPPED prototype.html script in jsdom with a mocked backend.
 * (1) The "+$10" fee on the "As soon as possible" option meets WCAG AA
 *     (4.5:1) in light and dark mode, both unselected and selected.
 * (2) The fee amount shown is unchanged.
 * (3) The job sent when ASAP is chosen (which carries the fee) is identical to
 *     master's (golden: test_fixtures/ui02_master_asap_payload.json), so the
 *     fee, pricing and booking behavior are unchanged.
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
const GOLDEN = 'test_fixtures/ui02_master_asap_payload.json';
function normalize(p) { const o = JSON.parse(JSON.stringify(p)); for (const k of Object.keys(o)) if (/_at$/.test(k) || k === 'id') o[k] = '<volatile>'; return o; }
function rgb(c) { c = String(c).trim(); let m = c.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)); m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i); if (m) return [+m[1], +m[2], +m[3]]; throw new Error('color ' + c); }
function lum([r, g, b]) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function ratio(a, b) { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
const RealDate = Date;
function fixClock() { const d = new RealDate(); d.setDate(d.getDate() + 1); d.setHours(9, 30, 0, 0); const t = d.getTime(); global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } }; global.window.Date = global.Date; }
async function openBooking(theme) {
  fixClock();
  await mount(() => { setAddrs([{ ...REAL, isPrimary: true }]); if (theme === 'dark') storedData['haven_theme'] = JSON.stringify({ __v: 1, data: 'dark' }); });
  await tap(screen.getAllByText('Mount TV')[0], 'Mount TV');
}
const asapBtn = () => Array.from(document.querySelectorAll('button')).find(b => /As soon as possible/.test(b.textContent));
const feeSpan = () => Array.from(asapBtn().querySelectorAll('span')).find(s => /^\+\$\d+$/.test(s.textContent.trim()));
const bgOf = el => { let e = el; while (e) { const c = e.style && (e.style.background || e.style.backgroundColor); if (c && !/transparent/.test(c)) return c.match(/#[0-9a-f]{6}|rgba?\([^)]*\)/i)[0]; e = e.parentElement; } return '#FFFFFF'; };

(async () => {
  if (process.env.UI02_CAPTURE) {
    await openBooking('light'); await tap(asapBtn(), 'ASAP');
    inserted = null; await tap(Array.from(document.querySelectorAll('button')).find(b => /Post Job/.test(b.textContent) && !b.disabled), 'Post');
    await waitFor(() => inserted !== null, 'insert');
    fs2.writeFileSync(process.env.UI02_CAPTURE, JSON.stringify({ asap: normalize(inserted), postLabel: null }, null, 2) + '\n'); console.log('captured'); process.exit(0);
  }
  for (const theme of ['light', 'dark']) {
    await openBooking(theme);
    let fee = feeSpan();
    assert(fee && fee.textContent.trim() === '+$10', theme + ': the fee amount is unchanged (+$10)');
    let r = ratio(fee.style.color, bgOf(asapBtn()));
    assert(r >= 4.5, theme + ': unselected fee text has at least 4.5:1 contrast (got ' + r.toFixed(2) + ')');
    await tap(asapBtn(), 'ASAP');
    fee = feeSpan();
    r = ratio(fee.style.color, bgOf(asapBtn()));
    assert(r >= 4.5, theme + ': selected fee text has at least 4.5:1 contrast (got ' + r.toFixed(2) + ')');
    assert(asapBtn().getAttribute('aria-pressed') === 'true', theme + ': ASAP selection still works');
  }
  // (3) payload with ASAP identical to master's
  const golden = JSON.parse(fs2.readFileSync(GOLDEN, 'utf8'));
  await openBooking('light'); await tap(asapBtn(), 'ASAP');
  inserted = null; await tap(Array.from(document.querySelectorAll('button')).find(b => /Post Job/.test(b.textContent) && !b.disabled), 'Post');
  await waitFor(() => inserted !== null, 'insert');
  const got = normalize(inserted);
  assert(JSON.stringify(got) === JSON.stringify(golden.asap), 'the ASAP job sent (fee, price, emergency) is identical to master\'s' + (JSON.stringify(got) === JSON.stringify(golden.asap) ? '' : '\n got ' + JSON.stringify(got) + '\n want ' + JSON.stringify(golden.asap)));
  global.Date = RealDate; global.window.Date = RealDate;
  cleanup();
  console.log(`--- UI-02 urgent fee contrast: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
