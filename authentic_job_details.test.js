/**
 * Authentic job details (Customer). Mounts the SHIPPED prototype.html script
 * in jsdom with a mocked backend.
 * (1) HB-03: when the backend says a job is complete, the app no longer
 *     invents "work performed", materials or Pro notes. It keeps only what
 *     the job really has (nothing yet; the backend doesn't send notes).
 * (2) HB-09: a materials request with no item list shows a plain "the list
 *     hasn't arrived yet" note: no made-up items or prices, no Approve.
 * (3) A real item list from the Pro still shows with Approve / Decline.
 * (4) The random generator and its templates are gone from the source.
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


// ── Mocked backend: one assigned job whose row the test controls ──
const CUSTOMER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const JOB_UUID = 'cccccccc-1111-4222-8333-444444444444';
const PRO_UUID = 'dddddddd-1111-4222-8333-555555555555';
let remoteRow = null;
global.fetch = async (url) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.endsWith('/auth/v1/health')) return ok({});
  if (u.includes('/rest/v1/rpc/is_qa_tester')) return ok(false);
  if (u.includes('/rest/v1/jobs?id=in.') && remoteRow) return ok([remoteRow]);
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


const now = Date.now();
const job = {
  id: now - 5000, taskId: 1, tpId: 2, lockedPrice: 65, status: 'arrived', acceptedAt: now - 3600000,
  backendJobId: JOB_UUID, backendProId: PRO_UUID, backendProName: 'Grace Hopper',
  pro: { i: 'GH', n: 'Grace Hopper', s: 'Haven Pro', col: '#134E4A', r: null, j: null, memberSince: null, trustScore: null, proId: PRO_UUID, real: true },
  workPerformed: [], materials: [], proNotes: '', msgs: [], photos: [], desc: '',
  addressText: '1 Test Street, Orlando, FL 32801',
};
function seed() {
  Object.keys(storedData).forEach(k => delete storedData[k]);
  storedData['haven_auth_access_token'] = 'signed-in-access-token';
  storedData['haven_auth_user_id'] = CUSTOMER_ID;
  storedData['haven_auth_email'] = 'qa-customer@example.com';
  storedData['haven_auth_role'] = 'customer';
  storedData['haven_notifications'] = JSON.stringify({ __v: 1, data: [] });
  storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: [job] });
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
async function openJob(row) {
  cleanup(); remoteRow = row; seed();
  const container = document.createElement('div'); document.body.appendChild(container);
  await act(async () => { render(React.createElement(App), container); });
  await settle(60);
  await waitFor(() => /What do you/.test(bodyText()), 'signed-in home');
  await clickText(/^Bookings$/, 'Bookings tab');
  await clickText(/Assemble furniture/, 'job card');
}
const storedJob = () => JSON.parse(storedData['haven_jobs']).data[0];
const approveBtn = () => Array.from(document.querySelectorAll('button')).find(b => /Approve materials/.test(b.textContent));

(async () => {
  // (2) materials_requested with no item list
  await openJob({ id: JOB_UUID, status: 'materials_requested', customer_id: CUSTOMER_ID, pro_id: PRO_UUID });
  await waitFor(() => /The list hasn't arrived yet/.test(bodyText()), 'materials waiting note');
  assert(/Your Pro asked to buy materials\. The list hasn't arrived yet\./.test(bodyText()), 'a request with no list says the list has not arrived');
  assert(!approveBtn() && !/Estimated total/.test(bodyText()) && !/Decline and end job/.test(bodyText()), 'no invented items, prices, Approve or Decline');
  assert(!(storedJob().materialsRequest && storedJob().materialsRequest.items && storedJob().materialsRequest.items.length), 'nothing invented is saved on the job');

  // (3) a real list from the Pro
  await openJob({ id: JOB_UUID, status: 'materials_requested', customer_id: CUSTOMER_ID, pro_id: PRO_UUID,
    materials_items: [{ name: 'Wall anchors', qty: 2, cost_cents: 450 }], materials_estimate_cents: 900 });
  await waitFor(() => /Wall anchors/.test(bodyText()), 'real materials list');
  assert(/Wall anchors/.test(bodyText()) && /\$9\.00/.test(bodyText()) && !!approveBtn(), 'the Pro\'s real list shows with its total and Approve');

  // (1) backend completion keeps only real details
  await openJob({ id: JOB_UUID, status: 'complete', customer_id: CUSTOMER_ID, pro_id: PRO_UUID });
  await waitFor(() => storedJob().status === 'complete', 'job completes from the backend');
  const j = storedJob();
  assert(Array.isArray(j.workPerformed) && j.workPerformed.length === 0, 'no invented "work performed"');
  assert(Array.isArray(j.materials) && j.materials.length === 0, 'no invented materials');
  assert(j.proNotes === '', 'no invented Pro notes');

  // (4) source
  const srcAll = ['home_services_app.jsx', 'pure_helpers.js', 'catalog_seeds.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
  assert(!/getCompletionDetails|COMPLETION_TEMPLATES|DEFAULT_COMPLETION_TEMPLATE|computeFallback/.test(srcAll), 'the completion-detail generator, its templates and the materials fallback are gone');
  assert(!/Math\.random/.test(fs.readFileSync('pure_helpers.js', 'utf8')), 'no random values in the shared helpers');
  cleanup();
  console.log(`--- Authentic job details: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
