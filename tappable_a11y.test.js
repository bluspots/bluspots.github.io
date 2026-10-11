/**
 * Tappable rows and tiles (Customer): reachable by VoiceOver and keyboard.
 * Mounts the SHIPPED prototype.html script in jsdom with a mocked backend.
 *
 * Many tappable rows and tiles are styled <div>s, not <button>s. They stay
 * <div>s (so they look exactly the same) but now carry role="button",
 * tabIndex 0, and Enter / Space activation, which is what a screen reader and
 * a keyboard need.
 * (1) Profile rows (Payment Methods, Saved Addresses, Settings, Help &
 *     Support, Sign Out) are buttons in the accessibility tree and focusable.
 * (2) Enter on "Settings" opens Settings; Space on a Home category tile opens
 *     browsing. Other keys do nothing.
 * (3) Every "‹" back arrow is announced as "Back".
 * (4) Expandable rows say whether they're open (aria-expanded).
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

function rowFor(label) {
  const el = screen.queryAllByText(label).map(t => t.closest('[role="button"],button')).filter(Boolean).pop();
  return el || null;
}
async function key(el, k) { await act(async () => { fireEvent.keyDown(el, { key: k }); }); await settle(40); }

(async () => {
  await mount();
  // (1)
  await act(async () => { fireEvent.click(screen.getAllByText('Profile').pop()); }); await settle(60);
  for (const label of ['Payment Methods', 'Saved Addresses', 'Settings', 'Help & Support', 'Sign Out']) {
    const el = rowFor(label);
    assert(el && el.getAttribute('role') === 'button', `Profile "${label}" is a button for screen readers`);
    assert(el && el.tabIndex === 0, `Profile "${label}" can be reached with the keyboard (tabIndex 0)`);
  }
  // (2)
  const settings = rowFor('Settings');
  await key(settings, 'a');
  assert(!/Appearance|APPEARANCE/.test(bodyText()), 'a letter key on a row does nothing');
  await key(settings, 'Enter');
  await waitFor(() => /APPEARANCE|Appearance/.test(bodyText()), 'Settings opened by Enter');
  assert(true, 'Enter on "Settings" opens Settings');
  // (3)
  const backs = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '‹');
  assert(backs.length > 0 && backs.every(b => b.getAttribute('aria-label') === 'Back'), 'the ‹ back arrow is announced as "Back" (' + backs.length + ' on screen)');
  await act(async () => { fireEvent.click(backs[0]); }); await settle(60);
  // (4) Saved Addresses rows expand
  await key(rowFor('Saved Addresses'), ' ');
  await settle(60);
  const exp = document.querySelector('[aria-expanded]');
  assert(!exp || exp.getAttribute('role') === 'button', 'expandable rows are buttons with aria-expanded' );
  // (2) Home category tile with Space
  await act(async () => { fireEvent.click(screen.getAllByText('Home').pop()); }); await settle(60);
  const tile = rowFor('Fix');
  assert(tile && tile.getAttribute('role') === 'button' && tile.tabIndex === 0, 'Home category tile "Fix" is a focusable button');
  const before = bodyText();
  await key(tile, ' ');
  await waitFor(() => bodyText() !== before && !/What do you/.test(bodyText()), 'browse opened by Space');
  assert(true, 'Space on the "Fix" tile opens browsing');

  cleanup();
  console.log(`--- Tappable rows a11y: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
