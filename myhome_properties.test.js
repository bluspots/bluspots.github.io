/**
 * My Home property switching (Customer). Mounts the SHIPPED prototype.html
 * script in jsdom with a mocked backend.
 *
 * Every saved address already keeps its own home details and every job its
 * address, but My Home only ever showed the primary home. Now:
 * (1) My Home lists each saved property (+ "Add property"); the primary is
 *     shown first and selected.
 * (2) Choosing another property shows its address, details, service history
 *     and receipts. Jobs saved before addresses were recorded on jobs stay
 *     with the primary home.
 * (3) The Receipts count matches the property shown (it counted every
 *     property before), and so does the Receipts screen.
 * (4) Inline edits and "Edit ›" change the property shown, not the primary;
 *     its year built / size / layout are editable there too.
 * (5) "+ Add property" saves a new property and shows it.
 * (6) An unset layout reads "Not set" (it read "bed / bath").
 * (7) Back from Service History returns My Home to where it was scrolled.
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
  storedData['haven_addresses'] = JSON.stringify({ __v: 1, data: [
    { id: 1, label: 'Home', isPrimary: true, street: '1 Oak St', unit: '', city: 'Orlando', state: 'FL', zip: '32801', accessNotes: '', propertyType: 'House', yearBuilt: '1990', sqft: '1800', beds: '3', baths: '2' },
    { id: 2, label: 'Rental', isPrimary: false, street: '9 Pine Ave', unit: '', city: 'Winter Garden', state: 'FL', zip: '34787', accessNotes: '', propertyType: '', yearBuilt: '', sqft: '', beds: '', baths: '' },
  ] });
  const now = Date.now();
  const base = { status: 'complete', taskId: 1, tpId: 2, lockedPrice: 65, acceptedAt: now - 7200000, workPerformed: ['Done'], materials: [], proNotes: '', msgs: [], photos: [], desc: '', paymentBrand: 'Visa', paymentLast4: '4242',
    pro: { i: 'MT', n: 'Marcus T.', s: 'Pro', col: '#1E40AF' } };
  storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: [
    { ...base, id: now - 5000, completedAt: now - 5000, addressText: '1 Oak St, Orlando, FL 32801', addressLabel: 'Home' },
    { ...base, id: now - 4000, completedAt: now - 4000, addressText: '9 Pine Ave, Winter Garden, FL 34787', addressLabel: 'Rental' },
    { ...base, id: now - 3000, completedAt: now - 3000 },  // older job with no address saved: belongs to the primary home
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
function addresses() { return JSON.parse(storedData['haven_addresses']).data; }
function scroller() { return Array.from(document.querySelectorAll('.sc')).pop(); }

(async () => {
  await mount();
  await tap(screen.getAllByText('Profile').pop(), 'Profile');
  await tap(btn(/^🏡\s*My Home/), 'My Home');
  // (1)
  const home = btn(/^Home · Primary$/), rental = btn(/^Rental$/);
  assert(home && rental && btn(/^\+ Add property$/), 'My Home lists both properties and "+ Add property"');
  assert(home.getAttribute('aria-pressed') === 'true' && rental.getAttribute('aria-pressed') === 'false', 'the primary home is selected first');
  assert(/1 Oak St, Orlando, FL 32801/.test(bodyText()), 'shows the primary home address');
  assert(/2 completed/.test(bodyText()), 'primary home: 2 completed jobs (its own + the older job with no address)');
  assert(/2 saved/.test(bodyText()), 'primary home: Receipts says 2 saved');
  // (2)(3)(6)
  await tap(rental, 'Rental');
  assert(btn(/^Rental$/).getAttribute('aria-pressed') === 'true', 'Rental is now selected');
  assert(/9 Pine Ave, Winter Garden, FL 34787/.test(bodyText()) && !/1 Oak St/.test(bodyText()), 'shows the rental address only');
  assert(/1 completed/.test(bodyText()) && /1 saved/.test(bodyText()), 'rental: 1 completed job, Receipts says 1 saved (it counted all 3 before)');
  assert(/Layout/.test(bodyText()) && !/bed \/ bath/.test(bodyText()), 'an unset layout reads "Not set", not "bed / bath"');
  await tap(Array.from(document.querySelectorAll('[role="button"],div,span')).filter(e => e.textContent.trim() === 'Receipts').pop(), 'Receipts');
  assert(/9 Pine Ave/.test(bodyText()) && document.querySelectorAll('button').length >= 1, 'Receipts screen is labelled with the rental');
  const receiptCards = (bodyText().match(/View receipt|Share|Print/g) || []).length;
  await tap(Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '‹'), 'back');
  // (4)
  const typeSelect = document.querySelector('select[aria-label="Home type"]');
  await act(async () => { fireEvent.change(typeSelect, { target: { value: 'Townhouse' } }); }); await settle(40);
  assert(addresses().find(a => a.id === 2).propertyType === 'Townhouse' && addresses().find(a => a.id === 1).propertyType === 'House', 'inline edit changes the rental, not the primary home');
  await tap(Array.from(document.querySelectorAll('[role="button"],span')).find(e => e.textContent.trim() === 'Edit ›'), 'Edit');
  assert(/Edit home details/.test(bodyText()) && /Year built/i.test(bodyText()) && /9 Pine Ave/.test(document.body.innerHTML), '"Edit ›" opens the rental with its home details (year built etc.)');
  await tap(Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '‹'), 'back');
  // (5)
  await tap(btn(/^\+ Add property$/), 'add');
  const inputs = Array.from(document.querySelectorAll('input'));
  const byPh = ph => inputs.find(i => (i.placeholder || '') === ph);
  for (const [ph, v] of [["e.g. Work, Parents' house", 'Lake house'], ['123 Main Street', '5 Lake Rd'], ['City', 'Clermont'], ['ZIP code', '34711']]) {
    const el = byPh(ph); if (!el) throw new Error('no input ' + ph);
    await act(async () => { fireEvent.change(el, { target: { value: v } }); });
  }
  const st = Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.value === 'FL'));
  if (st) await act(async () => { fireEvent.change(st, { target: { value: 'FL' } }); });
  await settle(30);
  await tap(Array.from(document.querySelectorAll('button')).find(b => /^Save/.test(b.textContent.trim())), 'save');
  await waitFor(() => !!btn(/^Lake house$/), 'new property chip');
  assert(btn(/^Lake house$/).getAttribute('aria-pressed') === 'true' && /5 Lake Rd/.test(bodyText()), '"+ Add property" saves it and shows it on My Home');
  // (7)
  await tap(btn(/^Home · Primary$/), 'Home');
  scroller().scrollTop = 420;
  await tap(Array.from(document.querySelectorAll('[role="button"],div')).filter(e => /^View all service history/.test(e.textContent.trim())).pop(), 'history');
  assert(/Service History/.test(bodyText()) && /1 Oak St/.test(bodyText()), 'Service History shows the selected property');
  await tap(Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '‹'), 'back');
  assert(scroller().scrollTop === 420, 'Back from Service History returns My Home to the same scroll position (got ' + scroller().scrollTop + ')');

  cleanup();
  console.log(`--- My Home properties: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
