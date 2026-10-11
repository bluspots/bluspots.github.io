/**
 * Star rating (Customer): touch drag, keyboard and VoiceOver. Mounts the
 * SHIPPED prototype.html script in jsdom with a mocked backend.
 *
 * On a phone, dragging a finger across the stars set no rating at all: the
 * touch is captured by the row, so the per-star targets never heard the
 * drag. The row now reads the value from the pointer's position. And the
 * stars had no role, focus or label.
 * (1) Pressing on the left half of star 1 gives 0.5; dragging to the left
 *     half of star 4 gives 3.5 live; after lifting, moving changes nothing.
 * (2) The stars are a slider for screen readers (label, value, value text).
 * (3) Arrow keys change the rating by half a star; Home / End jump to 0.5 / 5;
 *     it never goes below 0.5 or above 5.
 * (jsdom has no layout, so each star is given a 40px box, 4px apart.)
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

function seedExtra() {
  const now = Date.now();
  storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: [
    { status: 'complete', taskId: 1, tpId: 2, lockedPrice: 65, acceptedAt: now - 7200000, completedAt: now - 3600000, id: now - 3600000,
      workPerformed: ['Done'], materials: [], proNotes: '', msgs: [], photos: [], desc: '', paymentBrand: 'Visa', paymentLast4: '4242',
      addressText: '123 Market Street, Apt 4B, San Francisco, CA 94103', pro: { i: 'MT', n: 'Marcus T.', s: 'Pro', col: '#1E40AF', r: 4.9 } },
  ] });
}
function seed() {
  Object.keys(storedData).forEach(k => delete storedData[k]);
  storedData['haven_auth_access_token'] = 'signed-in-access-token';
  storedData['haven_auth_user_id'] = CUSTOMER_ID;
  storedData['haven_auth_email'] = 'qa-customer@example.com';
  storedData['haven_auth_role'] = 'customer';
  storedData['haven_notifications'] = JSON.stringify({ __v: 1, data: [] });
  seedExtra();
}
async function delay(ms) { await new Promise(r => setTimeout(r, ms)); }
async function settle(ms = 40) { await act(async () => { await delay(ms); }); }
async function waitFor(check, label, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (check()) return true; await settle(25); }
  throw new Error('Timed out: ' + label + '\n' + bodyText().slice(0, 400));
}
async function mount() {
  cleanup();
  seed();
  authMock.signOutCalls = 0;
  authMock.signOutImpl = null;
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { render(React.createElement(App), container); });
  await settle(60);
  await waitFor(() => /What do you/.test(bodyText()), 'signed-in home');
  return container;
}


function btn(re) { return Array.from(document.querySelectorAll('button')).find(b => re.test(b.textContent.trim())); }
async function tap(el, label) { if (!el) throw new Error('missing ' + label + '\n' + bodyText().slice(0, 300)); await act(async () => { fireEvent.click(el); }); await settle(60); }
function shown() { const m = bodyText().match(/([\d.]+)★ · /); return m ? Number(m[1]) : 0; }

(async () => {
  await mount();
  await tap(screen.getAllByText('Profile').pop(), 'Profile');
  await tap(btn(/My Home/), 'My Home');
  await tap(btn(/^View details$/), 'View details');
  await tap(btn(/Rate Marcus/), 'Rate');
  const row = document.querySelector('[role="slider"]');
  assert(!!row, 'the stars are a slider for screen readers');
  Array.from(row.children).forEach((star, i) => { star.getBoundingClientRect = () => ({ left: i * 44, right: i * 44 + 40, width: 40, top: 0, bottom: 40, height: 40, x: i * 44, y: 0 }); });
  // (1)
  await act(async () => { fireEvent.pointerDown(row, { clientX: 10, pointerId: 1 }); }); await settle(20);
  assert(shown() === 0.5, 'press on the left half of star 1 → 0.5 (got ' + shown() + ')');
  for (const x of [50, 90, 130, 140]) { await act(async () => { fireEvent.pointerMove(row, { clientX: x, pointerId: 1 }); }); }
  await settle(20);
  assert(shown() === 3.5, 'dragging to the left half of star 4 → 3.5, live (got ' + shown() + ')');
  await act(async () => { fireEvent.pointerUp(row, { clientX: 140, pointerId: 1 }); }); await settle(20);
  await act(async () => { fireEvent.pointerMove(row, { clientX: 210, pointerId: 1 }); }); await settle(20);
  assert(shown() === 3.5, 'after lifting the finger, moving changes nothing');
  // (2)
  assert(row.getAttribute('aria-label') === 'Your rating' && row.tabIndex === 0, 'slider has a label and keyboard focus');
  assert(row.getAttribute('aria-valuenow') === '3.5' && /3\.5 stars, Good/.test(row.getAttribute('aria-valuetext')), 'slider reports "3.5 stars, Good" (got ' + row.getAttribute('aria-valuetext') + ')');
  // (3)
  const key = async k => { await act(async () => { fireEvent.keyDown(row, { key: k }); }); await settle(10); };
  await key('ArrowRight'); assert(shown() === 4, 'ArrowRight → 4');
  await key('End'); assert(shown() === 5, 'End → 5');
  await key('ArrowUp'); assert(shown() === 5, 'never above 5');
  await key('Home'); assert(shown() === 0.5, 'Home → 0.5');
  await key('ArrowLeft'); assert(shown() === 0.5, 'never below 0.5');
  await key('ArrowRight'); await key('ArrowRight'); assert(shown() === 1.5, 'two ArrowRights → 1.5');
  assert(!btn(/Submit review/).disabled, 'a keyboard rating enables Submit review');

  cleanup();
  console.log(`--- Star rating: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
