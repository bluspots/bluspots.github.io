/**
 * Customer app × backend security migrations (0039 status guard; 0026 /
 * 0028 / 0029 materials rules). Directive 2026-11-28, priority 2.
 * Mounts the SHIPPED prototype.html script in jsdom with a mocked backend.
 *
 *  1. Cancel on the Posted screen that loses the race to a Pro's accept: the
 *     server refuses (0039: HTTP 403) or matches no row (today's RLS: 200 []).
 *     The app says so plainly, re-reads the booking, and never marks it
 *     cancelled or asks to "try again".
 *  2. A network failure on that cancel still says "try again".
 *  3. Approve materials on a request already answered: refused → plain copy
 *     + re-read (not the "try again" banner).
 * fetch is mocked; not certification (Codey's matrices + Quagon cover the SQL).
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
// Optional storage refusal, to simulate a full quota for one key.
let refuseSet = null; // (key, value) => true to throw
const draftLog = []; // every write and removal of haven_draft (QA #87 v9: no transient cross-account write)
global.localStorage = {
  getItem: (k) => (k in storedData ? storedData[k] : null),
  setItem: (k, v) => {
    if (refuseSet && refuseSet(k, String(v))) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    if (k === 'haven_draft') draftLog.push({ op: 'set', v: String(v), live: storedData['haven_auth_user_id'] || '' });
    storedData[k] = String(v);
  },
  removeItem: (k) => { if (k === 'haven_draft') draftLog.push({ op: 'remove', prev: storedData[k], live: storedData['haven_auth_user_id'] || '' }); delete storedData[k]; },
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


// ── Mocked backend + Realtime ────────────────────────────────────────────────
const X_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const Y_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const P_ID = 'cccccccc-dddd-4eee-8fff-000000000001';
const JOB = (n) => '5eed0000-0000-4000-8000-0000000000' + String(n).padStart(2, '0');
let rowsByCustomer = {};
let readCount = 0;
let readFail = false;
function row(id, customer, extra) {
  return {
    id, status: 'en_route', customer_id: customer, pro_id: P_ID,
    category: 'Assembly', title: 'Assemble furniture', requires_diagnosis: false,
    city_label: 'Orlando, FL', address_snapshot: null, emergency: false,
    posted_at: '2026-11-10T19:06:40Z', accepted_at: '2026-11-10T19:10:00Z', completed_at: null, cancelled_at: null,
    customer_preferences_snapshot: [], fixed_customer_labor_price_cents: 6500, emergency_fee_cents: 0, tip_amount_cents: 0,
    materials_items: [], materials_estimate_cents: 0, materials_approved_cents: null,
    ...extra,
  };
}
global.fetch = async (url, opts) => {
  const u = decodeURIComponent(String(url));
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.endsWith('/auth/v1/health')) return ok({});
  if (u.includes('/rest/v1/rpc/is_qa_tester')) return ok(false);
  if (u.includes('/rest/v1/rpc/')) return ok({});
  if (u.includes('/rest/v1/jobs')) {
    const m = u.match(/customer_id=eq\.([0-9a-f-]+)/i);
    const mine = m ? (rowsByCustomer[m[1]] || []) : [];
    if (u.includes('order=posted_at')) { readCount++; if (readFail) return { ok: false, status: 503, json: async () => ({}), text: async () => 'unavailable' }; return ok(mine.slice()); }
    const ids = (u.match(/[?&]id=in\.\(([^)]*)\)/) || [, ''])[1].split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
    if (ids.length) return ok(mine.filter(r => ids.includes(r.id)));
    return ok([]);
  }
  if (u.includes('/rest/v1/')) return ok([]);
  return { ok: false, status: 404, json: async () => [], text: async () => 'not found' };
};
global.window.fetch = global.fetch;
let authCb = null;
const rt = { log: [], chans: [] };
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
      onAuthStateChange: (cb) => { authCb = cb; return { data: { subscription: { unsubscribe(){} } } }; },
      signOut: async () => ({ error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    realtime: { async setAuth(t) { rt.log.push('setAuth' + (t == null ? '' : ':explicit')); } },
    channel(topic, opts) {
      const ch = { topic, opts, handlers: [], subCb: null, removed: false,
        on(type, filter, cb) { this.handlers.push({ type, filter, cb }); return this; },
        subscribe(cb) { this.subCb = cb; rt.log.push('subscribe:' + topic); return this; } };
      rt.chans.push(ch); rt.log.push('channel:' + topic); return ch;
    },
    async removeChannel(ch) { ch.removed = true; rt.log.push('remove:' + ch.topic); return 'ok'; },
  }),
};
const liveChan = () => rt.chans.filter(c => !c.removed).pop();
async function emit(payload) { const ch = liveChan(); await act(async () => { ch.handlers.forEach(h => h.cb({ type: 'broadcast', event: 'job_changed', payload })); }); }
async function subscribed() { const ch = liveChan(); await act(async () => { ch.subCb && ch.subCb('SUBSCRIBED'); }); }

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }
function bodyText() { const c = document.body.cloneNode(true); c.querySelectorAll('style,script').forEach(e => e.remove()); return c.textContent; }
async function delay(ms) { await new Promise(r => setTimeout(r, ms)); }
async function settle(ms = 40) { await act(async () => { await delay(ms); }); }
async function waitFor(check, label, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { let ok = false; try { ok = !!check(); } catch { ok = false; } if (ok) return true; await settle(25); }
  assert(false, 'timed out waiting: ' + label + ' | ' + bodyText().slice(0, 300));
  return false;
}
function clickable(re) {
  return Array.from(document.querySelectorAll('button,[role="button"]')).filter(b => re.test((b.textContent || '').trim())).pop();
}
async function tap(el, label) { if (!el) { assert(false, 'missing control: ' + label); return false; } await act(async () => { fireEvent.click(el); }); await settle(80); return true; }
function signInStorage(uid) {
  storedData['haven_auth_access_token'] = 'signed-in-access-token-' + uid.slice(0, 4);
  storedData['haven_auth_user_id'] = uid;
  storedData['haven_auth_email'] = uid.slice(0, 4) + '@example.com';
  storedData['haven_auth_role'] = 'customer';
}
function signOutStorage() { ['haven_auth_access_token', 'haven_auth_user_id', 'haven_auth_email', 'haven_auth_role'].forEach(k => delete storedData[k]); }
async function boot(uid, cache) {
  cleanup();
  Object.keys(storedData).forEach(k => delete storedData[k]);
  if (uid) signInStorage(uid);
  if (cache) { storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: cache }); storedData['haven_jobs_owner'] = uid; }
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { render(React.createElement(App), container); });
  await settle(60);
  await waitFor(() => /What do you|Sign in|Welcome|Bookings/i.test(bodyText()), 'app shell after boot');
  await settle(200);
}
const jobsStored = () => { try { const p = JSON.parse(storedData['haven_jobs'] || 'null'); return p ? (Array.isArray(p) ? p : p.data) : []; } catch { return []; } };
const notifsStored = () => { try { const p = JSON.parse(storedData['haven_notifications'] || 'null'); return p ? (Array.isArray(p) ? p : p.data) : []; } catch { return []; } };
async function openBookings() { await tap(screen.queryAllByText(/^Bookings$/).pop(), 'Bookings tab'); await settle(150); }
async function openTracking() {
  await openBookings();
  await waitFor(() => !!clickable(/Assemble furniture/), 'booking card');
  await tap(clickable(/Assemble furniture/), 'booking card');
  await settle(120);
}


// PATCH answers for these checks (the shared harness answers GETs).
let patchAnswer = null; // () => response | 'throw'
const baseFetch = global.fetch;
const patches = [];
global.fetch = async (url, opts) => {
  if (opts && opts.method === 'PATCH') {
    patches.push({ url: String(url), body: opts.body });
    const a = patchAnswer ? patchAnswer() : null;
    if (a === 'throw') throw new TypeError('Failed to fetch');
    if (a) return a;
  }
  return baseFetch(url, opts);
};
global.window.fetch = global.fetch;
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

async function openPosted() {
  await openBookings();
  await waitFor(() => !!clickable(/Assemble furniture/), 'booking card');
  await tap(clickable(/Assemble furniture/), 'booking card');
  await settle(150);
}
async function cancelOnPosted() {
  await waitFor(() => !!clickable(/^Cancel Job$/), 'Cancel Job');
  await tap(clickable(/^Cancel Job$/), 'Cancel Job');
  await waitFor(() => !!clickable(/^Yes, cancel$/), 'confirm');
  await tap(clickable(/^Yes, cancel$/), 'Yes, cancel');
  await settle(300);
}

(async () => {
  for (const [label, answer] of [['0039 refusal (HTTP 403)', () => resp(403, { code: '42501', message: 'The customer cannot set this job status' })], ['no matching row (200 [], RLS today)', () => resp(200, [])]]) {
    console.log('1. Cancel loses the race to an accept: ' + label);
    rowsByCustomer = { [X_ID]: [row(JOB(1), X_ID, { status: 'posted', pro_id: null, accepted_at: null })] };
    await boot(X_ID);
    await openPosted();
    // A Pro accepts on the server just before the Customer's cancel lands.
    rowsByCustomer[X_ID] = [row(JOB(1), X_ID)];
    patchAnswer = answer;
    const before = readCount;
    await cancelOnPosted();
    await waitFor(() => /can't be cancelled here anymore/.test(bodyText()), 'refusal copy');
    assert(/A Pro may have just accepted it\. Your booking has been refreshed\./.test(bodyText()), 'says plainly that it can no longer be cancelled here');
    assert(!/Couldn't cancel the job — try again/.test(bodyText()), 'does not ask to try again');
    await waitFor(() => readCount > before, 're-read');
    assert(readCount > before, 'the booking is re-read from the server');
    const stored = jobsStored().find(j => j.backendJobId === JOB(1));
    assert(stored && stored.status !== 'cancelled', 'the job is not marked cancelled on this phone');
    patchAnswer = null;
  }

  console.log('2. Cancel on a bad network:');
  rowsByCustomer = { [X_ID]: [row(JOB(2), X_ID, { status: 'posted', pro_id: null, accepted_at: null })] };
  await boot(X_ID);
  await openPosted();
  patchAnswer = () => 'throw';
  await cancelOnPosted();
  await waitFor(() => /Couldn't cancel the job — try again/.test(bodyText()), 'network copy');
  assert(/Couldn't cancel the job — try again/.test(bodyText()), 'a network failure still says try again');
  patchAnswer = null;

  console.log('3. Approve a materials request that was already answered:');
  rowsByCustomer = { [X_ID]: [row(JOB(3), X_ID, { status: 'materials_requested', materials_items: [{ name: 'Part (fixture)', cost_cents: 1500 }], materials_estimate_cents: 1500 })] };
  await boot(X_ID);
  await openPosted();
  await waitFor(() => !!clickable(/^Approve materials$/), 'Approve materials');
  patchAnswer = () => resp(403, { code: '42501', message: 'Only the customer can approve or decline materials on this job' });
  const before3 = readCount;
  await tap(clickable(/^Approve materials$/), 'Approve materials');
  await waitFor(() => /already been answered or has changed/.test(bodyText()), 'materials refusal copy');
  assert(/This materials request has already been answered or has changed\. Your booking has been refreshed\./.test(bodyText()), 'says the request was already answered');
  await waitFor(() => readCount > before3, 're-read (3)');
  assert(readCount > before3, 'the booking is re-read');
  assert(patches.length >= 4, 'every action sent its PATCH (no client-side short cut)');

  cleanup();
  console.log(`\n--- Backend security compatibility: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
