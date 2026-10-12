/**
 * Specific appointment windows (Customer, founder-approved Option 1).
 * Mounts the SHIPPED prototype.html script in jsdom, mocked backend, fixed clock.
 * - "As soon as possible" is separate; then a 7-day strip and two-hour
 *   windows 8–10 AM … 4–6 PM. A window is offered only until it starts;
 *   a day with none left reads "No times left" and the next day opens.
 * - Nothing is pre-selected; Post asks the customer to pick a time.
 * - The pick reads "Requested". The backend doesn't receive the time yet
 *   (GROKBOT_BACKEND_HANDOFF HB-01), so the note says so, and "Confirmed"
 *   never shows without a backend confirmation.
 * - Emergency keeps its own options.
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

function seedExtra() {}
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


const RealDate = Date;
function setClock(hh, mm) {
  const d = new RealDate(); d.setHours(hh, mm, 0, 0); const fixed = d.getTime();
  global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(fixed); } static now() { return fixed; } };
  global.window.Date = global.Date;
}
const buttons = () => Array.from(document.querySelectorAll('button'));
const windowGroup = () => document.querySelector('[role="group"][aria-label="Arrival window"]');
const dayGroup = () => document.querySelector('[role="group"][aria-label="Day"]');
const windows = () => windowGroup() ? Array.from(windowGroup().querySelectorAll('button')).map(b => b.textContent.trim()) : [];
const days = () => dayGroup() ? Array.from(dayGroup().querySelectorAll('button')) : [];
const postBtn = () => buttons().find(b => /Post Job|to continue/.test(b.textContent));
async function click(el, label) { if (!el) throw new Error('missing ' + label + '\n' + bodyText().slice(0, 400)); await act(async () => { fireEvent.click(el); }); await settle(60); }
async function openBooking(hh, mm) { setClock(hh, mm); await mount(); await click(screen.getAllByText('Mount TV')[0], 'Mount TV'); }
(async () => {
  // 9:30 AM: 8–10 has started; the rest of today is offered.
  await openBooking(9, 30);
  assert(!!buttons().find(b => /As soon as possible/.test(b.textContent)), 'ASAP is its own option');
  assert(days().length === 7 && /Today/.test(days()[0].textContent) && /Tomorrow/.test(days()[1].textContent), 'a 7-day strip: Today, Tomorrow, then dates');
  assert(JSON.stringify(windows()) === JSON.stringify(['10 AM–12 PM', '12–2 PM', '2–4 PM', '4–6 PM']), '9:30 AM: today offers only windows that have not started (got ' + windows().join(', ') + ')');
  assert(!buttons().some(b => b.getAttribute('aria-pressed') === 'true' && (windowGroup().contains(b) || /As soon as possible/.test(b.textContent))), 'nothing is pre-selected');
  assert(postBtn() && postBtn().disabled && /Pick a time to continue/.test(postBtn().textContent), 'Post asks for a time first');
  assert(!/This morning|This afternoon|This evening|Tomorrow AM/.test(bodyText()), 'the vague Morning/Afternoon/Evening choices are gone');
  await click(days()[1], 'Tomorrow');
  assert(JSON.stringify(windows()) === JSON.stringify(['8–10 AM', '10 AM–12 PM', '12–2 PM', '2–4 PM', '4–6 PM']), 'tomorrow offers all five windows');
  await click(windowGroup().querySelectorAll('button')[1], '10–12');
  assert(windowGroup().querySelectorAll('button')[1].getAttribute('aria-pressed') === 'true', 'the chosen window is marked selected');
  assert(/Requested: Tomorrow · 10 AM–12 PM/.test(bodyText()), 'the pick reads "Requested: Tomorrow · 10 AM–12 PM"');
  assert(/a Pro won't see this time yet/.test(bodyText()) && !/Pro confirms the time/.test(bodyText()), 'says plainly that Pros cannot see the time yet (backend pending)');
  assert(!postBtn().disabled && /Post Job/.test(postBtn().textContent), 'Post is ready once a time is chosen');
  await click(buttons().find(b => /As soon as possible/.test(b.textContent)), 'ASAP');
  assert(!/Requested:/.test(bodyText()) && buttons().find(b => /As soon as possible/.test(b.textContent)).getAttribute('aria-pressed') === 'true', 'ASAP replaces the requested window');
  // 3:15 PM: only 4–6 is left today.
  await openBooking(15, 15);
  assert(JSON.stringify(windows()) === JSON.stringify(['4–6 PM']), '3:15 PM: only 4–6 PM left today (got ' + windows().join(', ') + ')');
  // 8:30 PM: nothing left today; Tomorrow opens.
  await openBooking(20, 30);
  assert(days()[0].disabled && /No times left/.test(days()[0].textContent), '8:30 PM: Today reads "No times left" and is disabled');
  assert(days()[1].getAttribute('aria-pressed') === 'true' && windows().length === 5, '8:30 PM: Tomorrow opens with all five windows');
  global.Date = RealDate; global.window.Date = RealDate;
  // Bookings: Requested, never Confirmed without a backend confirmation.
  const src = fs.readFileSync('home_services_app.jsx', 'utf8');
  assert((src.match(/\{emergency\?timeChips\(EMERGENCY_TIME_PREFS,true\):apptPicker\(\)\}/g) || []).length === 2, 'emergency bookings keep their own options; normal bookings use the window picker');
  assert(/const HAVEN_REQUESTED_TIME_SHARED_WITH_PROS=false;/.test(src), 'requested times are flagged as not shared with Pros yet');
  assert(/const jobTimeConfirmed=j=>!!\(j&&j\.confirmedWindow\);/.test(src) && !/confirmedWindow\s*[:=]/.test(src.replace('const jobTimeConfirmed=j=>!!(j&&j.confirmedWindow);', '')), '"Confirmed" only from a backend confirmation field the app never sets itself');
  assert(/reqWindow:tpid===APPT_TIME_PREF_ID&&reqWindowValid\(reqWindow\)\?reqWindow:null/.test(src), 'the job keeps the requested window only if it is still valid');
  cleanup();
  console.log(`--- Appointment windows: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
