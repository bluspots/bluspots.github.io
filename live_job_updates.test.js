/**
 * Live job updates (founder approved 2026-11-11, draft): realtime job signal,
 * MIG-0036 contract v1 (supabase/contracts/REALTIME_JOB_SIGNAL_CONTRACT.md on
 * Customer PR #97, head 4df74734). Mounts the SHIPPED prototype.html script in
 * jsdom with a mocked backend and a mocked supabase-js Realtime client.
 *
 *  U.  job_signal.js units (topic, payload, debounce, join order, retry,
 *      account switch, sign-out, wake-ups, nothing logged).
 *  1.  After sign-in: setAuth() before a private channel on jobs:user:<id>,
 *      event job_changed; SUBSCRIBED refetches the account's jobs.
 *  2.  Debounce: several signals → exactly one account re-read.
 *  3.  Stale phone data is replaced by server data: a cancelled job no longer
 *      shows "Pending Cancellation", a job the server cancelled no longer
 *      shows "Completed"; a still-active local request is unchanged.
 *  4.  Cancelled on the server while Tracking is open → "Your job was
 *      cancelled.", a cancellation notification, back to Bookings.
 *  5.  Released (Pro unassigned) → "Your Pro is no longer on this job…",
 *      the Posted screen, no Pro shown.
 *  6.  Removed (deleted) → "This job is no longer available.", Bookings.
 *  7.  Foreground and back online re-read; the payload is never trusted
 *      (a signal with a false status changes nothing the server didn't say).
 *  8.  Sign-out removes the channel; another account joins only its own.
 * fetch and Realtime are mocked. A mock is never certification: Quagon
 * certifies against the real backend once 0036 is applied.
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

(async () => {
  console.log('U. job_signal.js units:');
  await require('./tools/job_signal_unit.js')(fs.readFileSync('job_signal.js', 'utf8'), assert);

  console.log('1. Subscribe after sign-in:');
  rowsByCustomer = { [X_ID]: [row(JOB(1), X_ID)] };
  await boot(X_ID);
  await waitFor(() => rt.chans.length >= 1, 'channel joined');
  const iSet = rt.log.indexOf('setAuth'), iChan = rt.log.indexOf('channel:jobs:user:' + X_ID);
  assert(iSet >= 0 && iChan > iSet && !rt.log.includes('setAuth:explicit'), 'setAuth() (session JWT) is awaited before the channel is created');
  const ch = liveChan();
  assert(ch.topic === 'jobs:user:' + X_ID && ch.opts.config.private === true, 'private channel on jobs:user:<own lowercase id>');
  assert(ch.handlers.some(h => h.type === 'broadcast' && h.filter.event === 'job_changed'), 'listens to broadcast job_changed');
  let before = readCount;
  await subscribed();
  await settle(600);
  assert(readCount === before + 1, 'SUBSCRIBED → one account re-read (covers reconnects)');

  console.log('2. Debounce:');
  before = readCount;
  await emit({ v: 1, id: 'a', job_id: JOB(1), status: 'en_route', reason: 'updated', at: '2026-11-11T07:41:05.123Z' });
  await settle(100);
  await emit({ v: 1, id: 'b', job_id: JOB(1), status: 'arrived', reason: 'updated', at: '2026-11-11T07:41:05.223Z' });
  await settle(100);
  await emit({ v: 1, id: 'c', job_id: JOB(1), status: 'arrived', reason: 'updated', at: '2026-11-11T07:41:05.323Z' });
  await settle(150);
  assert(readCount === before, 'no re-read while signals keep arriving (debounce window)');
  await settle(500);
  assert(readCount === before + 1, '3 signals → exactly one account re-read');

  console.log('7a. The payload is never trusted:');
  await emit({ v: 1, id: 'd', job_id: JOB(1), status: 'cancelled', reason: 'removed', at: '2026-11-11T07:42:00.000Z' });
  await settle(700);
  const j1 = jobsStored().find(j => j.backendJobId === JOB(1));
  assert(j1 && j1.status === 'en_route' && !/Your job was cancelled/.test(bodyText()), 'a signal saying "cancelled" changes nothing while the server still says en_route');

  console.log('7b. Foreground and back online:');
  before = readCount;
  await act(async () => { document.dispatchEvent(new window.Event('visibilitychange')); });
  await settle(600);
  assert(readCount === before + 1, 'coming back to the foreground re-reads');
  before = readCount;
  await act(async () => { window.dispatchEvent(new window.Event('online')); });
  await settle(600);
  assert(readCount === before + 1, 'back online re-reads');

  console.log('4. Cancelled on the server while Tracking is open:');
  await openTracking();
  assert(/Pro is on the way/.test(bodyText()), 'Tracking is open for the en_route job');
  readFail = true;
  before = readCount;
  await act(async () => { window.dispatchEvent(new window.Event('online')); });
  await settle(700);
  assert(readCount === before + 1 && /Pro is on the way/.test(bodyText()) && !/Couldn't load|Loading your bookings/.test(bodyText()), 'a failed background re-read keeps the job on screen (no error, no "Loading…")');
  readFail = false;
  rowsByCustomer[X_ID] = [row(JOB(1), X_ID, { status: 'cancelled', pro_id: null, cancelled_at: '2026-11-11T07:45:00Z' })];
  await emit({ v: 1, id: 'e', job_id: JOB(1), status: 'cancelled', reason: 'updated', at: '2026-11-11T07:45:00.000Z' });
  await waitFor(() => /Your job was cancelled\./.test(bodyText()), 'cancel notice');
  assert(/Your job was cancelled\./.test(bodyText()), '"Your job was cancelled." is shown');
  assert(/Bookings/.test(bodyText()) && !/Pro is on the way/.test(bodyText()), 'the app left Tracking for Bookings');
  assert(!clickable(/Assemble furniture/), 'the cancelled job is no longer listed as a booking');
  assert(notifsStored().some(n => n.type === 'CANCELLATION' && n.body === 'Your job was cancelled.'), 'a cancellation notification is saved');
  const j1c = jobsStored().find(j => j.backendJobId === JOB(1));
  assert(j1c && j1c.status === 'cancelled' && !j1c.backendProId, 'stored copy: status cancelled from the server, no Pro kept');

  console.log('5. Released (Pro unassigned):');
  rowsByCustomer = { [X_ID]: [row(JOB(2), X_ID)] };
  await boot(X_ID);
  await openTracking();
  assert(/Pro is on the way/.test(bodyText()), 'Tracking open for the en_route job');
  rowsByCustomer[X_ID] = [row(JOB(2), X_ID, { status: 'posted', pro_id: null, accepted_at: null })];
  await emit({ v: 1, id: 'f', job_id: JOB(2), status: 'posted', reason: 'updated', at: '2026-11-11T07:46:00.000Z' });
  await waitFor(() => /no longer on this job/.test(bodyText()), 'release notice');
  assert(/Your Pro is no longer on this job\. It's waiting for a Pro again\./.test(bodyText()), 'release copy is shown');
  assert(/Cancel Job/.test(bodyText()) && !/Pro is on the way/.test(bodyText()), 'the app moved to the job\'s Posted (waiting) screen');
  const j2 = jobsStored().find(j => j.backendJobId === JOB(2));
  assert(j2 && j2.status === 'posted' && !j2.backendProId && !j2.pro, 'stored copy: posted, the previous Pro is not kept');

  console.log('6. Removed (deleted):');
  rowsByCustomer = { [X_ID]: [row(JOB(3), X_ID)] };
  await boot(X_ID);
  await openTracking();
  rowsByCustomer[X_ID] = [];
  await emit({ v: 1, id: 'g', job_id: JOB(3), status: null, reason: 'removed', at: '2026-11-11T07:47:00.000Z' });
  await waitFor(() => /This job is no longer available\./.test(bodyText()), 'removed notice');
  assert(/Bookings/.test(bodyText()) && !/Pro is on the way/.test(bodyText()), 'the app left Tracking for Bookings');
  assert(!jobsStored().some(j => j.backendJobId === JOB(3)), 'the removed job is gone from this phone\'s cache');

  console.log('3. Stale phone data replaced by server data:');
  const stale = (n, status, extra) => ({ id: 1762800000000 + n, taskId: null, custom: { title: 'Assemble furniture', cat: 'Assembly', price: 65 }, status,
    pro: null, msgs: [], photos: [], desc: '', addressText: 'Orlando, FL', cancelStatus: null, cancellationRequestedAt: null,
    tipAmount: 0, tipStatus: 'notAdded', jobPreferences: [], workPerformed: [], materials: [], proNotes: '', backendJobId: JOB(n), ...extra });
  rowsByCustomer = { [X_ID]: [
    row(JOB(4), X_ID, { status: 'cancelled', pro_id: null, cancelled_at: '2026-11-11T07:00:00Z', posted_at: '2026-11-10T10:00:00Z' }),
    row(JOB(5), X_ID, { status: 'cancelled', pro_id: null, cancelled_at: '2026-11-11T07:00:00Z', posted_at: '2026-11-10T11:00:00Z', title: 'Mount TV', category: 'Assembly' }),
    row(JOB(6), X_ID, { status: 'en_route', posted_at: '2026-11-10T12:00:00Z', title: 'Hang shelves', category: 'Assembly' }),
  ] };
  await boot(X_ID, [
    stale(4, 'en_route', { cancelStatus: 'requested', cancellationRequestedAt: 1762800000000 }),
    stale(5, 'complete', { custom: { title: 'Mount TV', cat: 'Assembly', price: 65 }, completedAt: 1762800000000 }),
    stale(6, 'en_route', { custom: { title: 'Hang shelves', cat: 'Assembly', price: 65 }, cancelStatus: 'requested', cancellationRequestedAt: 1762800000000 }),
  ]);
  await openBookings();
  await waitFor(() => /Hang shelves/.test(bodyText()), 'bookings loaded from the server');
  const s4 = jobsStored().find(j => j.backendJobId === JOB(4));
  const s5 = jobsStored().find(j => j.backendJobId === JOB(5));
  assert(s4 && s4.status === 'cancelled' && s4.cancelStatus == null, 'a job the server cancelled: stored status cancelled, the local cancellation request is dropped');
  assert(!/Assemble furniture/.test(bodyText()), '…and it no longer shows "Pending Cancellation" in Bookings');
  assert(s5 && s5.status === 'cancelled' && !/Mount TV/.test(bodyText()) && !/Completed/.test(bodyText()), 'a job this phone had as "Completed" but the server cancelled: not shown as Completed');
  assert(/Hang shelves/.test(bodyText()) && /Pending Cancellation/.test(bodyText()), 'a still-active job with this phone\'s own request keeps "Pending Cancellation" (unchanged)');

  console.log('8. Sign-out and account switch:');
  const xChan = liveChan();
  signOutStorage();
  await act(async () => { authCb && authCb('SIGNED_OUT', null); });
  await settle(250);
  assert(xChan.removed && rt.log[rt.log.length - 1] === 'remove:jobs:user:' + X_ID, 'sign-out removes the channel');
  before = readCount;
  await act(async () => { window.dispatchEvent(new window.Event('online')); });
  await settle(600);
  assert(readCount === before, 'signed out: wake-ups don\'t read jobs');
  rowsByCustomer[Y_ID] = [];
  signInStorage(Y_ID);
  await act(async () => { authCb && authCb('SIGNED_IN', storedSession()); });
  await waitFor(() => liveChan() && liveChan().topic === 'jobs:user:' + Y_ID, 'Y channel');
  assert(rt.chans.filter(c => !c.removed).length === 1 && liveChan().topic === 'jobs:user:' + Y_ID, 'the next account joins only its own topic');
  // direct switch X → Y without a sign-out in between
  rowsByCustomer[X_ID] = [];
  await boot(X_ID);
  await waitFor(() => liveChan() && liveChan().topic === 'jobs:user:' + X_ID, 'X channel');
  const xc = liveChan();
  signInStorage(Y_ID);
  await act(async () => { authCb && authCb('SIGNED_IN', storedSession()); });
  await waitFor(() => liveChan() && liveChan().topic === 'jobs:user:' + Y_ID, 'Y channel after switch');
  const iRem = rt.log.lastIndexOf('remove:jobs:user:' + X_ID), iY = rt.log.lastIndexOf('channel:jobs:user:' + Y_ID);
  assert(xc.removed && iRem >= 0 && iRem < iY, 'account switch: removeChannel(X) before joining Y');

  cleanup();
  console.log(`\n--- Live job updates: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
