/**
 * Scroll restore (Customer). Mounts the SHIPPED prototype.html script in
 * jsdom with a mocked backend (no network).
 * - Opening a screen starts at the top (it used to restore that screen's
 *   old position).
 * - Back (‹ or backFrom) returns the previous screen to where it was.
 * - Tapping a tab goes to that tab's top; Home/Bookings/Profile no longer
 *   share one saved position.
 * - Returning to a tab whose deeper screen is remembered restores it.
 * The edge-swipe Back uses the same backFrom() path.
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

function seed() {
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
function lastByText(re) {
  const all = screen.queryAllByText(re);
  return all.length ? all[all.length - 1] : null;
}
async function clickText(re, label) {
  for (let i = 0; i < 80 && !lastByText(re); i++) await settle(25);
  const el = lastByText(re);
  if (!el) throw new Error('No element for ' + (label || re) + '\n' + bodyText().slice(0, 400));
  await act(async () => { fireEvent.click(el); });
  await settle();
}
async function step(label, fn) {
  const before = fail;
  try { await fn(); console.log((fail === before ? '✓ ' : '✗ ') + label); }
  catch (e) { fail++; console.error('✗ ' + label + '\n   ' + ((e && e.stack) || e)); }
}
function mainScroller() {
  return Array.from(document.querySelectorAll('.sc')).find(el => {
    const oy = getComputedStyle(el).overflowY;
    return oy === 'auto' || oy === 'scroll';
  }) || null;
}
function pos() { const el = mainScroller(); return el ? el.scrollTop : null; }
function setPos(v) { mainScroller().scrollTop = v; }
async function tapTab(label) {
  const btn = Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label') || '').startsWith(label) && b.closest('div') && (b.textContent || '').includes(label));
  if (!btn) throw new Error('no tab ' + label);
  await act(async () => { fireEvent.click(btn); });
  await settle();
}
async function headerBack() {
  const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === '‹');
  if (!btn) throw new Error('no ‹ back button\n' + bodyText().slice(0, 300));
  await act(async () => { fireEvent.click(btn); });
  await settle();
}

(async () => {
  await step('Opening a screen starts at the top; Back restores the previous spot', async () => {
    await mount();
    await tapTab('Profile');
    await waitFor(() => /Payment Methods/.test(bodyText()), 'profile');
    setPos(250);
    await clickText(/^Settings$/, 'Settings row');
    await waitFor(() => /Signed in/.test(bodyText()), 'settings');
    assert(pos() === 0, 'Settings opens at the top (got ' + pos() + ')');
    setPos(400);
    await headerBack();
    await waitFor(() => /Payment Methods/.test(bodyText()) && !/Signed in/.test(bodyText()), 'back on profile');
    assert(pos() === 250, 'Back (‹) returns Profile to where it was (250, got ' + pos() + ')');
    await clickText(/^Settings$/, 'Settings row again');
    await waitFor(() => /Signed in/.test(bodyText()), 'settings again');
    assert(pos() === 0, 'Re-opening Settings starts at the top, not its old spot (got ' + pos() + ')');
  });

  await step('Back between nested screens restores (Settings → Job Preferences → Back)', async () => {
    setPos(300);
    const jp = lastByText(/Job Preferences/);
    if (!jp) { assert(true, 'no Job Preferences entry in this build (skipped)'); return; }
    await act(async () => { fireEvent.click(jp); });
    await settle();
    await waitFor(() => !/Signed in/.test(bodyText()), 'job preferences');
    assert(pos() === 0, 'Job Preferences opens at the top (got ' + pos() + ')');
    await headerBack();
    await waitFor(() => /Signed in/.test(bodyText()), 'back on settings');
    assert(pos() === 300, 'Back returns Settings to 300 (got ' + pos() + ')');
  });

  await step('Tabs: a tab tap goes to that tab\'s top; returning to a remembered screen restores it', async () => {
    await mount();
    setPos(120);
    await tapTab('Profile');
    await waitFor(() => /Payment Methods/.test(bodyText()), 'profile');
    assert(pos() === 0, 'Profile tab opens at the top, not Home\'s 120 (got ' + pos() + ')');
    await clickText(/^Settings$/, 'Settings row');
    await waitFor(() => /Signed in/.test(bodyText()), 'settings');
    setPos(180);
    await tapTab('Home');
    await waitFor(() => /What do you/.test(bodyText()), 'home');
    assert(pos() === 0, 'Home tab tap goes to the top (got ' + pos() + ')');
    await tapTab('Profile');
    await waitFor(() => /Signed in/.test(bodyText()), 'profile tab reopens Settings (remembered)');
    assert(pos() === 180, 'Returning to the Profile tab restores Settings where you left it (180, got ' + pos() + ')');
  });

  cleanup();
  console.log(`--- Scroll restore: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})();
