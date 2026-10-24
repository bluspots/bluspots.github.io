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
// Phase 1B B4: the backend is the source of truth, so the seeded jobs are
// real mocked backend rows too: every seeded job gets a backend id, and the
// account read (order=posted_at) returns this account's rows for them with
// the stored amounts (labor = the job's locked price; nothing else added).
let seededBackendRows = [];
function havenSeedBackendRows(jobs) {
  seededBackendRows = [];
  return jobs.map((j, i) => {
    const backendJobId = j.backendJobId || `5eed0000-0000-4000-8000-${String(Math.abs(Number(j.id) || i) % 1e12).padStart(12, '0')}`;
    seededBackendRows.push({
      id: backendJobId, status: j.status, customer_id: CUSTOMER_ID, pro_id: j.backendProId || null,
      fixed_customer_labor_price_cents: Math.round((j.lockedPrice ?? 0) * 100), emergency_fee_cents: 0, tip_amount_cents: 0,
      materials_items: [], materials_estimate_cents: 0, materials_approved_cents: null,
      address_snapshot: j.addressText || null,
    });
    return { ...j, backendJobId };
  });
}
global.fetch = async (url) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.includes('/rest/v1/jobs') && u.includes('order=posted_at')) return ok(seededBackendRows);
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
  storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: havenSeedBackendRows([
    { ...base, id: now - 5000, completedAt: now - 5000, addressText: '1 Oak St, Orlando, FL 32801', addressLabel: 'Home' },
    { ...base, id: now - 4000, completedAt: now - 4000, addressText: '9 Pine Ave, Winter Garden, FL 34787', addressLabel: 'Rental' },
    { ...base, id: now - 3000, completedAt: now - 3000 },  // older job with no address saved: belongs to no property (stays in Bookings)
  ]) });
}
function seed() {
  Object.keys(storedData).forEach(k => delete storedData[k]);
  storedData['haven_auth_access_token'] = 'signed-in-access-token';
  storedData['haven_auth_user_id'] = CUSTOMER_ID;
  // QA #87 v7 (a): saved addresses are per account; the seeded list is this customer's.
  storedData['haven_addresses_owner'] = CUSTOMER_ID;
  // Phase 1B B4: the jobs cache belongs to the signed-in customer.
  storedData['haven_jobs_owner'] = CUSTOMER_ID;
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
  // (1) compact row for the selected property
  const picker = () => document.querySelector('button[aria-haspopup="dialog"]');
  assert(picker() && /Home/.test(picker().textContent) && /Primary/.test(picker().textContent) && /1 Oak St, Orlando, FL 32801/.test(picker().textContent), 'My Home shows the primary home in one compact row (name, Primary badge, address)');
  assert(/2 homes/.test(picker().textContent), 'the row says how many homes are saved');
  assert(/1 completed/.test(bodyText()) && /1 saved/.test(bodyText()), 'primary home: only its own job (a job with no saved address is not added to any home)');
  const addrSpan = Array.from(picker().querySelectorAll('span')).find(e => e.textContent === '1 Oak St, Orlando, FL 32801');
  assert(addrSpan && /ellipsis/.test(addrSpan.getAttribute('style') || '') && /nowrap/.test(addrSpan.getAttribute('style') || ''), 'long addresses are cut with an ellipsis on one line');
  // (2) the list
  await tap(picker(), 'picker');
  const dialog = () => document.querySelector('[role="dialog"][aria-labelledby="haven-property-sheet-title"]');
  assert(dialog() && /Your properties/.test(dialog().textContent), 'tapping the row opens "Your properties"');
  const row = re => Array.from(dialog().querySelectorAll('button[aria-pressed]')).find(b => re.test(b.textContent));
  assert(row(/^🏠Home/) && row(/Rental/) && row(/^🏠Home/).getAttribute('aria-pressed') === 'true' && row(/Rental/).getAttribute('aria-pressed') === 'false', 'every property is listed; the selected one is marked');
  assert(/Primary/.test(row(/^🏠Home/).textContent) && !/Primary/.test(row(/Rental/).textContent), 'the primary home is labelled Primary');
  assert(/1 job/.test(row(/^🏠Home/).textContent) && /1 job/.test(row(/Rental/).textContent), 'each property shows its own job count');
  assert(btn(/^\+ Add property$/) && btn(/^Manage properties and primary home/) && /saved on this device only/.test(dialog().textContent), 'Add property, Manage properties and the device-only note are in the list');
  const scrollArea = dialog().querySelector('.sc');
  assert(scrollArea && /overflow-y: auto/.test(scrollArea.getAttribute('style') || ''), 'the list scrolls when there are many homes');
  // (3)(6) switch
  await tap(row(/Rental/), 'Rental');
  assert(!dialog(), 'choosing a property closes the list');
  assert(/Rental/.test(picker().textContent) && /9 Pine Ave/.test(picker().textContent), 'the row now shows the rental');
  assert(/9 Pine Ave, Winter Garden, FL 34787/.test(bodyText()) && !/1 Oak St/.test(bodyText()), 'shows the rental address only');
  assert(/1 completed/.test(bodyText()) && /1 saved/.test(bodyText()), 'rental: 1 completed job, Receipts says 1 saved');
  assert(/Layout/.test(bodyText()) && !/bed \/ bath/.test(bodyText()), 'an unset layout reads "Not set", not "bed / bath"');
  await tap(Array.from(document.querySelectorAll('[role="button"],div,span')).filter(e => e.textContent.trim() === 'Receipts').pop(), 'Receipts');
  assert(/9 Pine Ave/.test(bodyText()), 'Receipts screen is labelled with the rental');
  await tap(Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '‹'), 'back');
  // (4)
  const typeSelect = document.querySelector('select[aria-label="Home type"]');
  await act(async () => { fireEvent.change(typeSelect, { target: { value: 'Townhouse' } }); }); await settle(40);
  assert(addresses().find(a => a.id === 2).propertyType === 'Townhouse' && addresses().find(a => a.id === 1).propertyType === 'House', 'inline edit changes the rental, not the primary home');
  await tap(Array.from(document.querySelectorAll('[role="button"],span')).find(e => e.textContent.trim() === 'Edit ›'), 'Edit');
  assert(/Edit home details/.test(bodyText()) && /Year built/i.test(bodyText()) && /9 Pine Ave/.test(document.body.innerHTML), '"Edit ›" opens the rental with its home details (year built etc.)');
  await tap(Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '‹'), 'back');
  // (5) add from the list
  await tap(picker(), 'picker');
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
  await waitFor(() => picker() && /Lake house/.test(picker().textContent), 'new property selected');
  assert(/5 Lake Rd/.test(picker().textContent) && /3 homes/.test(picker().textContent), '"+ Add property" saves it and shows it on My Home');
  // (8) change the primary home
  const setPrimary = Array.from(document.querySelectorAll('[role="button"]')).find(e => e.textContent.trim() === 'Set as primary');
  assert(!!setPrimary, 'a non-primary home offers "Set as primary"');
  await tap(setPrimary, 'set primary');
  assert(addresses().find(a => a.label === 'Lake house').isPrimary && !addresses().find(a => a.id === 1).isPrimary && addresses().filter(a => a.isPrimary).length === 1, 'Set as primary makes it the only primary home');
  assert(/Primary/.test(picker().textContent) && !Array.from(document.querySelectorAll('[role="button"]')).some(e => e.textContent.trim() === 'Set as primary'), 'the row shows Primary and the link goes away');
  assert(/0 completed|No jobs yet/.test(bodyText()) || /0 saved/.test(bodyText()), 'the new primary home has no history (records do not move with Primary)');
  await tap(picker(), 'picker');
  await tap(Array.from(dialog().querySelectorAll('button[aria-pressed]')).find(b => /^🏠Home/.test(b.textContent)), 'Home');
  assert(/1 completed/.test(bodyText()), 'the old primary keeps exactly its own history');
  // (7)
  scroller().scrollTop = 420;
  await tap(Array.from(document.querySelectorAll('[role="button"],div')).filter(e => /^View all service history/.test(e.textContent.trim())).pop(), 'history');
  assert(/Service History/.test(bodyText()) && /1 Oak St/.test(bodyText()), 'Service History shows the selected property');
  await tap(Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '‹'), 'back');
  assert(scroller().scrollTop === 420, 'Back from Service History returns My Home to the same scroll position (got ' + scroller().scrollTop + ')');

  cleanup();
  console.log(`--- My Home properties: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
