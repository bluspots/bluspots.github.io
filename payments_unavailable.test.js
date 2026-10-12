/**
 * Payments unavailable (Customer, HB-07). Mounts the SHIPPED prototype.html
 * script in jsdom with a mocked backend.
 * (1) A new device has no cards; Payment methods says payments aren't
 *     available, with no card form and no "securely processed" claim.
 * (2) On an existing device only the two unedited sample cards are removed;
 *     an edited sample and a card the customer typed stay stored untouched.
 * (3) Booking says payment isn't collected in the app and offers no card.
 * (4) A posted job carries the existing "no card" placeholder, never a card.
 */
process.env.TZ = 'America/New_York';
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


// ── Mocked backend: records the job insert ──
const CUSTOMER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
let inserted = null;
global.fetch = async (url, opts) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.endsWith('/auth/v1/health')) return ok({});
  if (u.includes('api.mapbox.com')) return ok({ features: [{ geometry: { coordinates: [-81.379, 28.538] } }] });
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


let cardsSeed = null;
function seed() {
  Object.keys(storedData).forEach(k => delete storedData[k]);
  storedData['haven_auth_access_token'] = 'signed-in-access-token';
  storedData['haven_auth_user_id'] = CUSTOMER_ID;
  storedData['haven_auth_email'] = 'qa-customer@example.com';
  storedData['haven_auth_role'] = 'customer';
  storedData['haven_notifications'] = JSON.stringify({ __v: 1, data: [] });
  if (cardsSeed) storedData['haven_cards'] = JSON.stringify({ __v: 1, data: cardsSeed });
}
async function delay(ms) { await new Promise(r => setTimeout(r, ms)); }
async function settle(ms = 40) { await act(async () => { await delay(ms); }); }
async function waitFor(check, label, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (check()) return true; await settle(25); }
  throw new Error('Timed out: ' + label + '\n' + bodyText().slice(0, 400));
}
function lastByText(re) { const all = screen.queryAllByText(re); return all.length ? all[all.length - 1] : null; }
async function clickText(re, label) {
  for (let i = 0; i < 80 && !lastByText(re); i++) await settle(25);
  const el = lastByText(re);
  if (!el) throw new Error('No element for ' + label + '\n' + bodyText().slice(0, 500));
  await act(async () => { fireEvent.click(el); });
  await settle(60);
}
function lastByText(re) { const all = screen.queryAllByText(re); return all.length ? all[all.length - 1] : null; }
async function clickText(re, label) {
  for (let i = 0; i < 80 && !lastByText(re); i++) await settle(25);
  const el = lastByText(re);
  if (!el) throw new Error('No element for ' + label + '\n' + bodyText().slice(0, 500));
  await act(async () => { fireEvent.click(el); });
  await settle(60);
}
async function mount() {
  cleanup(); seed(); inserted = null;
  const container = document.createElement('div'); document.body.appendChild(container);
  await act(async () => { render(React.createElement(App), container); });
  await settle(80);
  await waitFor(() => /What do you/.test(bodyText()), 'signed-in home');
}
const storedCards = () => { const raw = storedData['haven_cards']; return raw ? JSON.parse(raw).data : []; };

(async () => {
  // (1) new device
  cardsSeed = null;
  await mount();
  await clickText(/^Profile$/, 'Profile tab');
  await clickText(/^Payment Methods$/, 'Payment Methods');
  await waitFor(() => /Payments aren't available yet/.test(bodyText()), 'payments unavailable');
  const t1 = bodyText();
  assert(/Haven doesn't take card payments in the app yet/.test(t1), 'Payment methods says plainly that the app does not take payments');
  assert(!/4242|8821|Visa|Mastercard/.test(t1), 'no sample cards on a new device');
  assert(!/Add payment method|Card number|CVV/.test(t1) && !document.querySelector('input[placeholder="123"]'), 'no card form asks for a card number or CVV');
  assert(!/securely processed/.test(t1), 'no "payments are securely processed" claim');
  assert(storedCards().length === 0, 'nothing card-like is stored on a new device');

  // (2) existing device: unedited samples go, everything else stays
  cardsSeed = [
    { id: 1, brand: 'Visa', last4: '4242', exp: '08/28', isDefault: true },
    { id: 2, brand: 'Mastercard', last4: '8821', exp: '02/27', isDefault: false },
    { id: 777, brand: 'Card', last4: '1234', exp: '11/29', isDefault: false },
    { id: 778, brand: 'Visa', last4: '4242', exp: '09/29', isDefault: false },
  ];
  await mount();
  await settle(100);
  const kept = storedCards();
  assert(!kept.some(c => c.last4 === '8821') && !kept.some(c => c.id === 1), 'the two unedited sample cards are removed');
  assert(kept.some(c => c.id === 777 && c.last4 === '1234') && kept.some(c => c.id === 778 && c.exp === '09/29'), 'cards that are not the unedited samples stay stored, untouched');

  // (3) + (4) booking and the posted job
  cardsSeed = null;
  await mount();
  await clickText(/^Mount TV$/, 'Mount TV');
  await waitFor(() => /Payment isn't collected in the app yet/.test(bodyText()), 'booking payment row');
  assert(!/•••• \d{4}/.test(bodyText()) && !/No card saved/.test(bodyText()), 'booking offers no card');
  const win = document.querySelector('[role="group"][aria-label="Arrival window"] button');
  if (win) { await act(async () => { fireEvent.click(win); }); await settle(60); }
  const post = Array.from(document.querySelectorAll('button')).find(b => /Post Job/.test(b.textContent) && !b.disabled);
  assert(!!post, 'Post Job is available without a card');
  await act(async () => { fireEvent.click(post); });
  await waitFor(() => inserted !== null, 'job insert');
  assert(inserted.payment_snapshot && inserted.payment_snapshot.brand === 'Card' && inserted.payment_snapshot.last4 === '----', 'the job carries the existing "no card" placeholder (got ' + JSON.stringify(inserted.payment_snapshot) + ')');
  const posted = JSON.parse(storedData['haven_jobs']).data.slice(-1)[0];
  assert(posted.paymentLast4 === '----', 'the saved job has no card digits');
  // #73 tightening: no card-entry form exists in the app at all.
  const appSrc = fs.readFileSync('home_services_app.jsx', 'utf8');
  assert(!/newCardNum|newCardCvv|placeholder="1234 5678 9012 3456"|placeholder="123"/.test(appSrc) && !/securely processed/.test(appSrc), 'the app has no card-number or CVV field and no "securely processed" claim');
  cleanup();
  console.log(`--- Payments unavailable: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
