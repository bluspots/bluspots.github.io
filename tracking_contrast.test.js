/**
 * UI-01 (Customer): dark-mode contrast on the job tracking screen.
 * Mounts the SHIPPED prototype.html script in jsdom with a mocked backend.
 * (1) Dark mode: the step labels ("En Route" etc.), the current-step dot,
 *     the ✓ on completed steps and the Message button are readable
 *     (WCAG AA: 4.5:1 text, 3:1 graphics/outline).
 * (2) Light mode: those elements keep exactly their previous colors.
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
  // Phase 1B B4: the account read is unavailable here, so the seeded jobs
  // cache stays as it is. Cross-device loading is covered in audit.test.js.
  if (u.includes('/rest/v1/jobs') && u.includes('order=posted_at')) return { ok: false, status: 503, json: async () => ({}), text: async () => 'unavailable' };
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
const setJobs = list => { storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: list }); };
async function openMyHome() {
  await tap(screen.getAllByText('Profile').pop(), 'Profile');
  await tap(btn(/^🏡\s*My Home/), 'My Home');
}


// ── UI-01 helpers ──
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
const NAVY = '#1C2B3A', CARD_LIGHT = '#FFFFFF', CARD_DARK = '#1B242E';
const now = Date.now();
const job = status => ({
  id: now - 5000, taskId: 1, tpId: 2, lockedPrice: 65, status, acceptedAt: now - 600000,
  backendJobId: JOB_UUID, backendProId: PRO_UUID, backendProName: 'Grace Hopper',
  pro: { i: 'GH', n: 'Grace Hopper', s: 'Haven Pro', col: '#134E4A', r: null, j: null, memberSince: null, trustScore: null, proId: PRO_UUID, real: true },
  workPerformed: [], materials: [], proNotes: '', msgs: [], photos: [], desc: '', addressText: '1 Oak St, Orlando, FL 32801', addressLabel: 'Home',
});
async function openTracking(theme, status) {
  remoteRows = [{ id: JOB_UUID, status, customer_id: CUSTOMER_ID, pro_id: PRO_UUID }];
  await mount(() => { setJobs([job(status)]); if (theme === 'dark') storedData['haven_theme'] = JSON.stringify({ __v: 1, data: 'dark' }); });
  await tap(screen.getAllByText('Bookings').pop(), 'Bookings tab');
  for (let i = 0; i < 80 && !screen.queryAllByText(/Assemble furniture/).length; i++) await settle(25);
  await tap(screen.queryAllByText(/Assemble furniture/).pop(), 'job card');
  await waitFor(() => /← Bookings/.test(bodyText()), 'tracking screen');
}
const stepLabel = t => Array.from(document.querySelectorAll('span')).find(s => s.textContent === t);
const msgBtn = () => Array.from(document.querySelectorAll('button')).find(b => /💬\s*Message/.test(b.textContent));

(async () => {
  // Dark mode: readable (WCAG AA 4.5:1 for the 9px labels and the button text)
  await openTracking('dark', 'en_route');
  let el = stepLabel('En Route');
  assert(el && ratio(el.style.color, CARD_DARK) >= 4.5, 'dark: current step label "En Route" has at least 4.5:1 contrast (got ' + (el ? ratio(el.style.color, CARD_DARK).toFixed(2) : 'none') + ')');
  const future = stepLabel('Done');
  assert(future && ratio(future.style.color, CARD_DARK) >= 4.5, 'dark: upcoming step labels stay readable');
  const b = msgBtn();
  assert(b && ratio(b.style.color, CARD_DARK) >= 4.5, 'dark: Message button text has at least 4.5:1 contrast (got ' + (b ? ratio(b.style.color, CARD_DARK).toFixed(2) : 'none') + ')');
  assert(b && ratio(b.style.borderColor || b.style.borderTopColor, CARD_DARK) >= 3, 'dark: Message button outline has at least 3:1 contrast');
  const dots = Array.from(el.parentElement.previousElementSibling.querySelectorAll('div')).filter(d => parseInt(d.style.width) >= 16 && d.style.width === d.style.height && d.style.borderRadius === (parseInt(d.style.width) / 2) + 'px');
  assert(dots.length >= 4 && ratio(dots[0].style.backgroundColor, CARD_DARK) >= 3, 'dark: the current step dot has at least 3:1 contrast');
  await openTracking('dark', 'in_progress');
  const pastLabel = stepLabel('Arrived');
  assert(pastLabel && ratio(pastLabel.style.color, CARD_DARK) >= 4.5, 'dark: completed step labels are readable');
  const check = Array.from(document.querySelectorAll('span')).find(s => s.textContent === '✓' && s.parentElement && parseInt(s.parentElement.style.width) === 16);
  assert(check && ratio(check.style.color, check.parentElement.style.backgroundColor) >= 3, 'dark: the ✓ on completed steps is visible on its dot');

  // Light mode: exactly the colors it had before
  await openTracking('light', 'en_route');
  el = stepLabel('En Route');
  assert(el && rgb(el.style.color).join() === rgb(NAVY).join(), 'light: step label color unchanged (navy)');
  const lb = msgBtn();
  assert(lb && rgb(lb.style.color).join() === rgb(NAVY).join() && /rgba\(28,\s*43,\s*58,\s*0?\.06\)/.test(lb.style.background || lb.style.backgroundColor), 'light: Message button colors unchanged');
  const ldots = Array.from(el.parentElement.previousElementSibling.querySelectorAll('div')).filter(d => parseInt(d.style.width) >= 16 && d.style.width === d.style.height && d.style.borderRadius === (parseInt(d.style.width) / 2) + 'px');
  assert(ldots[0] && rgb(ldots[0].style.backgroundColor).join() === rgb(NAVY).join(), 'light: step dots unchanged (navy)');
  await openTracking('light', 'in_progress');
  const lcheck = Array.from(document.querySelectorAll('span')).find(s => s.textContent === '✓' && s.parentElement && parseInt(s.parentElement.style.width) === 16);
  assert(lcheck && rgb(lcheck.style.color).join() === '255,255,255', 'light: ✓ stays white');

  remoteRows = [];
  cleanup();
  console.log(`--- UI-01 tracking contrast: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
