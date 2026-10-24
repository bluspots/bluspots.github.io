/**
 * UI-03 (Customer): message-thread header contrast, light and dark.
 * "● Active job", "Chat closed", and the job strip (title + subtitle) meet
 * WCAG AA 4.5:1 in both themes; light mode keeps the amber strip.
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
global.fetch = async (url) => {
  const u = String(url);
  fetchLog.push(u);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
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


function rgb(c) {
  c = String(c).trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  throw new Error('unparsed color ' + c);
}
function lum([r, g, b]) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function ratio(a, b) { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

const now = Date.now();
const JOB = (status) => ({
  id: now - 5000, taskId: 1, tpId: 2, lockedPrice: 65, status, acceptedAt: now - 600000, completedAt: status === 'complete' ? now - 1000 : undefined,
  backendJobId: JOB_UUID, backendProId: PRO_UUID, backendProName: 'Grace Hopper',
  pro: { i: 'GH', n: 'Grace Hopper', s: 'Haven Pro', col: '#134E4A', r: null, j: null, memberSince: null, trustScore: null, proId: PRO_UUID, real: true },
  workPerformed: [], materials: [], proNotes: '', msgs: [], photos: [], desc: '', addressText: '1 Oak St, Orlando, FL 32801', addressLabel: 'Home',
});
async function openThread(theme, status) {
  remoteRows = [{ id: JOB_UUID, status, customer_id: CUSTOMER_ID, pro_id: PRO_UUID }];
  await mount(() => { setAddrs([{ ...REAL, isPrimary: true }]); setJobs([JOB(status)]); if (theme === 'dark') storedData['haven_theme'] = JSON.stringify({ __v: 1, data: 'dark' }); });
  await tap(screen.getAllByText('Bookings').pop(), 'Bookings tab');
  for (let i = 0; i < 80 && !screen.queryAllByText(/Assemble furniture/).length; i++) await settle(25);
  await tap(screen.queryAllByText(/Assemble furniture/).pop(), 'job card');
  await waitFor(() => /← Bookings/.test(bodyText()), 'tracking');
  await tap(Array.from(document.querySelectorAll('button')).find(x => /💬/.test(x.textContent)), 'message entry');
  await waitFor(() => /Active job|Chat closed/.test(bodyText()), 'thread');
}
const leaf = re => Array.from(document.querySelectorAll('div,span')).find(d => d.children.length === 0 && re.test(d.textContent));
const bg = el => { let e = el; while (e) { const c = e.style && (e.style.background || e.style.backgroundColor); if (c && !/transparent/.test(c)) return c.match(/#[0-9a-f]{6}|rgba?\([^)]*\)/i)[0]; e = e.parentElement; } return '#FFFFFF'; };
(async () => {
  for (const theme of ['light', 'dark']) {
    await openThread(theme, 'en_route');
    const act1 = leaf(/^● Active job$/);
    assert(act1 && ratio(act1.style.color, bg(act1)) >= 4.5, theme + ': "Active job" ≥ 4.5:1 (got ' + (act1 ? ratio(act1.style.color, bg(act1)).toFixed(2) : '-') + ')');
    const title = leaf(/^Assemble furniture$/);
    assert(title && ratio(title.style.color, bg(title)) >= 4.5, theme + ': job strip title ≥ 4.5:1 (got ' + (title ? ratio(title.style.color, bg(title)).toFixed(2) : '-') + ')');
    const sub = title && title.nextElementSibling;
    assert(sub && ratio(sub.style.color, bg(sub)) >= 4.5, theme + ': job strip subtitle ≥ 4.5:1 (got ' + (sub ? ratio(sub.style.color, bg(sub)).toFixed(2) : '-') + ')');
    if (theme === 'light') assert(rgb(bg(title)).join() === '254,243,199' && rgb(title.style.color).join() === '146,64,14', 'light: job strip keeps its amber background and title color');
    await openThread(theme, 'complete');
    const closed = leaf(/^Chat closed$/);
    assert(closed && ratio(closed.style.color, bg(closed)) >= 4.5, theme + ': "Chat closed" ≥ 4.5:1 (got ' + (closed ? ratio(closed.style.color, bg(closed)).toFixed(2) : '-') + ')');
    // Closed-chat banner (founder 2026-10-23: include this small accessibility fix in #84).
    const banner = leaf(/^🔒 Chat closed — job completed successfully\.$/);
    assert(banner && ratio(banner.style.color, bg(banner)) >= 4.5, theme + ': closed-chat banner ≥ 4.5:1 (got ' + (banner ? ratio(banner.style.color, bg(banner)).toFixed(2) : '-') + ')');
    if (theme === 'dark') assert(banner && rgb(bg(banner)).join() !== '255,241,242', 'dark: closed-chat banner is not a light-pink block');
  }
  remoteRows = [];
  cleanup();
  console.log(`--- UI-03 thread header contrast: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
