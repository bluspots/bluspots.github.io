/**
 * Edge swipe on touch screens (Customer). The swipe-back gesture uses pointer
 * events; on a touch screen the browser cancels them (pointercancel) as soon
 * as it decides a drag is a pan, so the swipe stopped or snapped back
 * partway. Vertical screen scrollers now declare touch-action: pan-y, so the
 * browser handles vertical scrolling and leaves sideways drags to the app.
 * Sideways rows (.sc inside .sc) keep touch-action: auto.
 *
 * jsdom can't run the browser's touch handling; the PR includes a Chromium
 * run with real touch input (edge swipe fails on the previous master and
 * completes here; vertical scrolling and sideways rows unchanged). This test
 * pins the CSS rule and the nesting assumption it relies on.
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
async function step(label, fn) {
  const before = fail;
  try { await fn(); console.log((fail === before ? '✓ ' : '✗ ') + label); }
  catch (e) { fail++; console.error('✗ ' + label + '\n   ' + ((e && e.stack) || e)); }
}
function cssText() { return Array.from(document.querySelectorAll('style')).map(s => s.textContent).join('\n'); }
function sidewaysRows() {
  return Array.from(document.querySelectorAll('.sc')).filter(el => el.style.overflowX === 'auto' && !el.style.overflowY);
}
function checkRowsNested(where) {
  const rows = sidewaysRows();
  rows.forEach((row, i) => {
    const parent = row.parentElement && row.parentElement.closest('.sc');
    const vertical = parent && (parent.style.overflowY === 'auto' || parent.style.overflowY === 'scroll');
    assert(!!vertical, `${where}: sideways row ${i + 1} sits inside a vertical .sc (so it keeps touch-action:auto)`);
  });
  return rows.length;
}

(async () => {
  await step('CSS: vertical screens allow vertical pans only; nested sideways rows keep normal touch', async () => {
    await mount();
    const css = cssText().replace(/\s+/g, '');
    assert(css.includes('.sc{touch-action:pan-y;touch-action:pan-ypinch-zoom}'), '.sc has touch-action: pan-y (browser never claims a sideways edge swipe), plus pan-y pinch-zoom so pinch-to-zoom stays available');
    assert(css.includes('.sc.sc{touch-action:auto}'), '.sc .sc resets to touch-action: auto (sideways rows still scroll)');
  });

  await step('Every sideways row is nested inside a vertical screen scroller', async () => {
    let total = checkRowsNested('Home');
    const search = Array.from(document.querySelectorAll('input')).find(i => /^Search/.test(i.getAttribute('placeholder') || ''));
    if (search) { await act(async () => { fireEvent.focus(search); }); await settle(); total += checkRowsNested('Browse'); }
    assert(total >= 2, 'found the Home and Browse sideways rows (' + total + ')');
  });

  await step('Edge swipe still listens to pointer events and arms only within 24px of the left edge', async () => {
    const src = require('fs').readFileSync('home_services_app.jsx', 'utf8');
    assert(/const EDGE_ZONE_PX=24;/.test(src), 'edge zone unchanged (24px)');
    assert(/addEventListener\("pointerdown",onDown\)/.test(src) && /addEventListener\("pointercancel",onUp\)/.test(src), 'pointer listeners unchanged');
  });

  cleanup();
  console.log(`--- Edge swipe touch: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})();
