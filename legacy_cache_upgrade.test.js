/**
 * QA #87 v3: upgrading a master device (jobs cache with no haven_jobs_owner).
 * Mounts the SHIPPED prototype.html script in jsdom with a mocked backend whose
 * rows match what the real backend stores: address_snapshot null, city_label
 * only (postJob never writes a street address), and only the signed-in
 * customer's rows (customer_id = auth.uid()).
 *
 * (1) Ownerless upgrade: the master job's street address links it to the saved
 *     address again (My Home "1 completed", Receipts "1 saved"); messages,
 *     photos, description, rating and time window come back; the local job id
 *     (notifications) is kept; backend values (status, price) win.
 * (2) Reload: the sample address and the link are both kept; nothing changes.
 * (3) A 503 on the first read: nothing is lost, the sample survives reloads,
 *     and the next successful read links them.
 * (4) Signed out on first open, then signed in: linked.
 * (5) Shared device: X's set-aside details are never applied to Y and stay
 *     for X; X then claims them.
 * (6) A cache owned by another account is never set aside or applied.
 * (7) Backend data and later local data are never overwritten.
 * (8) Idempotence, storage quota (nothing dropped; untouched + retried when
 *     the set-aside cannot be written), id collisions.
 * Messages use the app's real shapes: only the customer's own (f:"cu") come
 * back; scripted pre-A2 pro replies (f:"pro") stay set aside, never shown.
 * Ownerless notifications are set aside too and come back only with a job
 * this account's read returned.
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
global.localStorage = {
  getItem: (k) => (k in storedData ? storedData[k] : null),
  setItem: (k, v) => {
    if (refuseSet && refuseSet(k, String(v))) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    storedData[k] = String(v);
  },
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

// ── Mocked backend (no network), real-shaped rows ──
const X_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const Y_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const B_ID = 'cccccccc-dddd-4eee-8fff-000000000000';
const JX = '5eed0000-0000-4000-8000-00000000000a'; // X's completed job at the sample address
const JX2 = '5eed0000-0000-4000-8000-00000000000b'; // X's completed job at a real address
const JY = '5eed0000-0000-4000-8000-00000000000c'; // Y's job
let backendDown = false;
let readCount = 0;
let rowsByCustomer = {};
let forgedRowsInRead = []; // rows another customer owns, returned anyway (the adapter must drop them)
function realRow(id, customer, extra) {
  return {
    id, status: 'complete', customer_id: customer, pro_id: null,
    category: 'Assembly', title: 'Assemble furniture', requires_diagnosis: false,
    city_label: 'San Francisco, CA', address_snapshot: null, emergency: false,
    posted_at: '2025-09-27T19:06:40Z', accepted_at: '2025-09-27T19:10:00Z', completed_at: '2025-09-27T21:00:00Z', cancelled_at: null,
    customer_preferences_snapshot: [], fixed_customer_labor_price_cents: 6500, emergency_fee_cents: 0, tip_amount_cents: 0,
    materials_items: [], materials_estimate_cents: 0, materials_approved_cents: null,
    ...extra,
  };
}
global.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.endsWith('/auth/v1/health')) return ok({});
  if (u.includes('/rest/v1/rpc/is_qa_tester')) return ok(false);
  if (u.includes('/rest/v1/jobs')) {
    const m = u.match(/customer_id=eq\.([0-9a-f-]+)/i);
    const mine = m ? (rowsByCustomer[m[1]] || []) : [];
    if (u.includes('order=posted_at')) {
      readCount++;
      if (backendDown) return { ok: false, status: 503, json: async () => ({}), text: async () => 'unavailable' };
      return ok(mine.concat(forgedRowsInRead));
    }
    const ids = (u.match(/[?&]id=in\.\(([^)]*)\)/) || [, ''])[1].split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
    if (ids.length) return ok(mine.filter(r => ids.includes(r.id)));
    return ok([]);
  }
  if (u.includes('/rest/v1/')) return ok([]);
  return { ok: false, status: 404, json: async () => [], text: async () => 'not found' };
};
global.window.fetch = global.fetch;
let authCb = null;
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
  }),
};

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); }
}
function bodyText() { return Array.from(document.body.children).filter(el => el.tagName !== 'STYLE').map(el => el.textContent).join(' '); }
async function delay(ms) { await new Promise(r => setTimeout(r, ms)); }
async function settle(ms = 40) { await act(async () => { await delay(ms); }); }
// Timeouts and missing controls fail a NAMED assertion (never a crash), so
// every mutant shows which rule broke; the run then continues.
async function waitFor(check, label, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { let ok = false; try { ok = !!check(); } catch { ok = false; } if (ok) return true; await settle(25); }
  assert(false, 'timed out waiting: ' + label);
  return false;
}
function btn(re) { return Array.from(document.querySelectorAll('button')).find(b => re.test(b.textContent.trim())); }
async function tap(el, label) { if (!el) { assert(false, 'missing control: ' + label); return false; } await act(async () => { fireEvent.click(el); }); await settle(60); return true; }

const SAMPLE_HOME = { id: 1, label: 'Home', isPrimary: true, street: '123 Market Street', unit: 'Apt 4B', city: 'San Francisco', state: 'CA', zip: '94103', accessNotes: '', propertyType: 'Apartment', yearBuilt: '1998', sqft: '1,150', beds: '2', baths: '1' };
const SAMPLE_WORK = { id: 2, label: 'Work', isPrimary: false, street: '500 Folsom Street', unit: '', city: 'San Francisco', state: 'CA', zip: '94105', accessNotes: '', propertyType: '', yearBuilt: '', sqft: '', beds: '', baths: '' };
const SAMPLE_HOME_TEXT = '123 Market Street, Apt 4B, San Francisco, CA 94103';
const REAL = { id: 1760000000000, label: 'Cabin', isPrimary: false, street: '1 Oak St', unit: '', city: 'Orlando', state: 'FL', zip: '32801', accessNotes: '', propertyType: 'House', yearBuilt: '1990', sqft: '1800', beds: '3', baths: '2' };
const REAL_TEXT = '1 Oak St, Orlando, FL 32801';
const PHOTO = 'data:image/png;base64,' + 'A'.repeat(400);
// The app's real chat message shapes. Customer: {id, f:"cu", m, t} (addMsg).
// Before Phase 1B A2 (96c4b4e) every customer message got a scripted reply
// {id, f:"pro", m: PRO_REPLIES[...], t}; it never came from a real Pro.
const CU_MSG = { id: 1759000100000, f: 'cu', m: 'Gate code is 4411', t: '2:05 PM' };
const PRO_REPLY = { id: 1759000100001, f: 'pro', m: 'Got it! 👍', t: '2:05 PM' };
const PRO_REPLY2 = { id: 1759000100002, f: 'pro', m: 'On it!', t: '2:06 PM' };
const MSGS = [CU_MSG, PRO_REPLY, PRO_REPLY2];
// A master-era job as master saved it: local id, street address, device-only details.
const LOCAL_ID = 1759000012345;
const masterJob = (extra) => ({
  id: LOCAL_ID, taskId: 1, custom: null, tpId: 2, reqWindow: null, photos: [PHOTO, PHOTO], desc: 'Drips under the sink',
  status: 'en_route', pro: { i: 'MT', n: 'Marcus T.', s: 'Pro', col: '#1E40AF' }, msgs: MSGS, surge: 0, justAccepted: false,
  emergency: false, emergencyFee: 0, addressText: SAMPLE_HOME_TEXT, addressLabel: 'Home', paymentBrand: 'Visa', paymentLast4: '4242',
  completedAt: null, rated: true, stars: 4.5, reviewTxt: 'Quick and tidy', hireAgain: true,
  cancelStatus: null, cancellationRequestedAt: null, tipAmount: 0, tipStatus: 'notAdded', tippedAt: null,
  acceptedAt: null, jobPreferences: [], workPerformed: [], materials: [], proNotes: '', lockedPrice: 999,
  requiresDiagnosis: false, materialsRequest: null, backendJobId: JX, ...extra,
});
const masterJob2 = () => ({ ...masterJob({ id: LOCAL_ID + 1, backendJobId: JX2, addressText: REAL_TEXT, addressLabel: 'Cabin', msgs: [], photos: [], desc: '', rated: false, stars: 0, reviewTxt: '', hireAgain: null }) });
const masterLocalOnly = () => ({ ...masterJob({ id: LOCAL_ID + 2, backendJobId: null, desc: 'LOCALONLY never a booking' }) });
// The app's real notification shape (makeNotification).
const notif = (id, jobId, title, body, extra) => ({ id, type: 'JOB_UPDATE', title, body, createdAt: 1759000200000 + (typeof id === 'string' ? id.length : 0), isRead: false, jobId, conversationId: null, propertyId: null, receiptId: null, destination: jobId == null ? null : { screen: 'tracking', jobId }, priority: 'normal', count: 1, ...extra });
const X_NOTIF = notif('n1759000200000_1', LOCAL_ID, 'Pro accepted your job', 'X private notification body');
const UNLINKED_NOTIF = notif('n1759000200000_9', null, 'Old account notice', 'Unlinked old notice body', { type: 'ACCOUNT' });

function signInStorage(uid) {
  storedData['haven_auth_access_token'] = 'signed-in-access-token-' + uid.slice(0, 4);
  storedData['haven_auth_user_id'] = uid;
  storedData['haven_auth_email'] = uid.slice(0, 4) + '@example.com';
  storedData['haven_auth_role'] = 'customer';
}
function signOutStorage() { ['haven_auth_access_token', 'haven_auth_user_id', 'haven_auth_email', 'haven_auth_role'].forEach(k => delete storedData[k]); }
// Master-era storage: no haven_jobs_owner, the master jobs cache and notifications, the sample + a real address.
function seedMaster(uid, jobs, notifs) {
  Object.keys(storedData).forEach(k => delete storedData[k]);
  if (uid) signInStorage(uid);
  storedData['haven_notifications'] = JSON.stringify({ __v: 1, data: notifs || [X_NOTIF] });
  storedData['haven_addresses'] = JSON.stringify({ __v: 1, data: [SAMPLE_HOME, SAMPLE_WORK, REAL] });
  storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: jobs || [masterJob(), masterJob2(), masterLocalOnly()] });
}
async function boot() {
  cleanup();
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { render(React.createElement(App), container); });
  await settle(60);
  await waitFor(() => /What do you|Sign in|Welcome/i.test(bodyText()), 'app shell after boot');
  await settle(150);
}
async function signInInTab(uid) {
  signInStorage(uid);
  await act(async () => { authCb && authCb('SIGNED_IN', storedSession()); });
  await settle(200);
}
async function signOutInTab() {
  signOutStorage();
  await act(async () => { authCb && authCb('SIGNED_OUT', null); });
  await settle(150);
}
const parsed = (k) => { try { const p = storedData[k] ? JSON.parse(storedData[k]) : null; return p ? (Array.isArray(p) ? p : p.data) : null; } catch { return null; } };
const jobs = () => parsed('haven_jobs') || [];
const jobBy = (bid) => jobs().find(j => j.backendJobId === bid);
const legacy = () => parsed('haven_jobs_unowned_legacy');
const legacyNotifs = () => parsed('haven_notifications_unowned_legacy');
const notifs = () => parsed('haven_notifications') || [];
// Entries still waiting to be restored (not the retained, never-restored replies).
const pending = () => (legacy() || []).filter(e => !e.retainedOnly);
const retainedFor = (bid) => (legacy() || []).find(e => e.backendJobId === bid && e.retainedOnly);
const addrIds = () => { const a = parsed('haven_addresses') || []; return a.map(x => x.id).sort((p, q) => p - q); };
// Every "Profile…" aria-label (the tab bar carries the unread count).
const profileAria = () => Array.from(document.querySelectorAll('[aria-label]')).map(e => e.getAttribute('aria-label')).filter(a => /^Profile/.test(a)).join(' | ');
async function goHomeTab() { const h = Array.from(document.querySelectorAll('button')).find(b => /^🏠\s*Home$/.test(b.textContent.trim()) || b.getAttribute('aria-label') === 'Home'); if (h) await tap(h, 'Home tab'); }
async function myHomeCounts() {
  const onMyHome = () => /Service history/.test(bodyText()) && /Receipts\s*\d+ saved/.test(bodyText());
  if (!onMyHome()) {
    const prof = screen.queryAllByText('Profile').pop();
    if (await tap(prof, 'Profile tab')) await tap(btn(/^🏡\s*My Home/), 'My Home');
  }
  const t = bodyText();
  return { completed: (t.match(/(\d+) completed/) || [, '?'])[1], saved: (t.match(/(\d+) saved/) || [, '?'])[1], text: t };
}
async function openJobDetail(titleRe) {
  const tab = screen.queryAllByText(/^Bookings$/).pop();
  if (!(await tap(tab, 'Bookings tab'))) return '';
  await waitFor(() => screen.queryAllByText(titleRe).length, 'job card in Bookings');
  const card = screen.queryAllByText(titleRe).pop();
  await tap(card, 'job card');
  return bodyText();
}
const xRows = () => [realRow(JX, X_ID), realRow(JX2, X_ID, { posted_at: '2025-09-28T19:06:40Z', city_label: 'Orlando, FL' })];
const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  // ── (1) ownerless upgrade, signed in, read OK ──
  rowsByCustomer = { [X_ID]: xRows() };
  seedMaster(X_ID);
  await boot();
  await waitFor(() => jobBy(JX), '(1) account read lands');
  let j = jobBy(JX);
  assert(storedData['haven_jobs_owner'] === X_ID, '(1) the cache is now owned by the signed-in account');
  assert(j?.addressText === SAMPLE_HOME_TEXT && j?.addressLabel === 'Home', '(1) the master street address is back on the job (backend has only the city)');
  assert(jobBy(JX2)?.addressText === REAL_TEXT, '(1) a real (non-sample) address gets its job back too');
  assert(sameJSON(j?.msgs, [CU_MSG]), '(1) only the customer\'s own message is restored (f:"cu"); the scripted pro replies are not');
  assert(sameJSON(retainedFor(JX)?.msgs, [PRO_REPLY, PRO_REPLY2]), '(1) the scripted pro replies stay in the set-aside key, untouched');
  assert(j?.photos?.length === 2 && j?.photos?.[0] === PHOTO && j?.desc === 'Drips under the sink', '(1) photos and description are preserved');
  assert(j?.rated === true && j?.stars === 4.5 && j?.reviewTxt === 'Quick and tidy' && j?.hireAgain === true && j?.tpId === 2, '(1) rating, review and time window are preserved');
  assert(sameJSON((j?.restoredDeviceOnly || []).slice().sort(), ['desc', 'photos', 'rating']), '(1) restored rating, photos and description are marked device-only');
  assert(j?.id === LOCAL_ID, '(1) the master local job id is kept');
  assert(j?.status === 'complete' && j?.lockedPrice === 65 && j?.paymentLast4 !== '4242' && !(j?.pro && j.pro.n === 'Marcus T.'), '(1) backend values win: status, price; no local card or local pro restored');
  assert(!jobs().some(x => /LOCALONLY/.test(x.desc || '')), '(1) a master entry with no backend id is still not a booking');
  assert(pending().length === 0, '(1) every claimed entry is released (only the never-restored replies remain set aside)');
  await waitFor(() => notifs().some(n => n.id === X_NOTIF.id), '(1) the job\'s notification is restored');
  const rn = notifs().find(n => n.id === X_NOTIF.id);
  assert(rn?.jobId === j?.id && rn?.destination?.jobId === j?.id && !('legacyBackendJobId' in (rn || {})), '(1) the restored notification points at the claimed job');
  await waitFor(() => legacyNotifs() === null, '(1) the notification leaves the set-aside key once saved');
  let c = await myHomeCounts();
  assert(c.completed === '1' && c.saved === '1', `(1) My Home shows 1 completed and Receipts 1 saved at 123 Market Street (got ${c.completed}/${c.saved})`);
  assert(/123 Market Street/.test(c.text), '(1) the sample address is shown on My Home');
  await goHomeTab();
  let t = await openJobDetail(/Assemble furniture/);
  assert(/Review submitted/.test(t) && /Saved on this phone only/.test(t), '(1) the restored rating is labelled "Saved on this phone only"');
  assert(/2 shared · Saved on this phone only|2 added · Saved on this phone only/.test(t), '(1) the restored photos are labelled "Saved on this phone only"');
  assert(/Drips under the sink\s*"?\s*Saved on this phone only/.test(t), '(1) the restored description is labelled "Saved on this phone only"');
  const msgBtn = Array.from(document.querySelectorAll('button')).find(b => /Chat|Message/.test(b.textContent));
  if (await tap(msgBtn, 'Chat button')) {
    t = bodyText();
    assert(/Gate code is 4411/.test(t), '(1) the customer\'s own message shows in the thread');
    assert(!/Got it! 👍|On it!/.test(t), '(1) no scripted pro reply is shown in the thread');
  }
  const afterFirst = { jobs: storedData['haven_jobs'], legacy: storedData['haven_jobs_unowned_legacy'], notifs: storedData['haven_notifications'] };

  // ── (2) reload: the sample and the link are kept; a second run changes nothing ──
  const reads0 = readCount;
  await boot();
  await waitFor(() => readCount > reads0 && jobBy(JX), '(2) read after reload');
  await settle(150);
  assert(sameJSON(addrIds(), [1, REAL.id]), '(2) after a reload the sample address with a job at it is still kept (the unused sample is removed)');
  c = await myHomeCounts();
  assert(c.completed === '1' && c.saved === '1', `(2) after a reload My Home still shows 1 completed / 1 saved (got ${c.completed}/${c.saved})`);
  assert(storedData['haven_jobs'] === afterFirst.jobs, '(2) idempotent: the jobs cache is byte-identical after a second load and read');
  assert(storedData['haven_jobs_unowned_legacy'] === afterFirst.legacy, '(2) idempotent: the retained replies are byte-identical');
  assert(storedData['haven_notifications'] === afterFirst.notifs, '(2) idempotent: notifications are byte-identical');

  // ── (3) 503 on the first read, then success ──
  seedMaster(X_ID); backendDown = true;
  await boot();
  assert(jobs().length === 0 && pending().length === 2, '(3) the master cache is cleared but its two backend-linked entries are set aside');
  assert(!(legacy() || []).some(e => /LOCALONLY/.test(e.desc || '')), '(3) the entry with no backend id is not set aside');
  assert((legacy() || []).every(e => !('lockedPrice' in e) && !('pro' in e) && !('status' in e) && !('paymentLast4' in e)), '(3) only device-only fields are set aside (nothing the backend stores)');
  assert(sameJSON(legacy()?.find(e => e.backendJobId === JX)?.msgs, MSGS), '(3) the set-aside keeps every message exactly as stored');
  assert(notifs().length === 0 && legacyNotifs()?.length === 1 && legacyNotifs()?.[0]?.legacyBackendJobId === JX, '(3) the ownerless notification is set aside (tagged with its job), not shown');
  await boot(); // reload while still down
  assert(sameJSON(addrIds(), [1, REAL.id]), '(3) a reload with the backend still down keeps the sample address (the set-aside job is at it)');
  assert(pending().length === 2 && legacyNotifs()?.length === 1, '(3) a failed read releases nothing');
  backendDown = false;
  await boot();
  await waitFor(() => jobBy(JX), '(3) read after recovery');
  c = await myHomeCounts();
  assert(c.completed === '1' && c.saved === '1' && jobBy(JX)?.stars === 4.5, `(3) after the backend recovers the job is linked with its details (got ${c.completed}/${c.saved})`);
  assert(pending().length === 0, '(3) released after the successful read');

  // ── (4) signed out on first open, then signed in ──
  seedMaster(null);
  await boot();
  assert(jobs().length === 0 && pending().length === 2 && notifs().length === 0, '(4) signed out: the master store is set aside, nothing shown');
  rowsByCustomer = { [X_ID]: xRows() };
  await signInInTab(X_ID);
  await waitFor(() => jobBy(JX), '(4) read after sign-in');
  await settle(100);
  c = await myHomeCounts();
  assert(c.completed === '1' && c.saved === '1' && jobBy(JX)?.addressText === SAMPLE_HOME_TEXT, `(4) after signing in the job is linked (got ${c.completed}/${c.saved})`);
  assert(pending().length === 0 && notifs().some(n => n.id === X_NOTIF.id), '(4) released after the sign-in read; the notification is back');

  // ── (5) shared device: X and Y both used master; Y signs in first ──
  const LY = LOCAL_ID + 50;
  const yMaster = { ...masterJob({ id: LY, backendJobId: JY, desc: 'Y gutter note', msgs: [{ id: 1759000300000, f: 'cu', m: 'Y own note', t: '3:00 PM' }], photos: [], rated: false, stars: 0, reviewTxt: '', hireAgain: null }) };
  const Y_NOTIF = notif('n1759000300000_2', LY, 'Job completed', 'Y notification body');
  const JY2 = '5eed0000-0000-4000-8000-00000000000d'; // a Y job this device never saw (no master entry)
  rowsByCustomer = { [X_ID]: xRows(), [Y_ID]: [realRow(JY, Y_ID, { posted_at: '2025-10-01T10:00:00Z' }), realRow(JY2, Y_ID, { posted_at: '2025-10-02T10:00:00Z' })] };
  forgedRowsInRead = [realRow(JX, X_ID)]; // X's row returned in Y's read anyway: the adapter drops it
  seedMaster(null, [masterJob(), masterJob2(), yMaster], [X_NOTIF, Y_NOTIF, UNLINKED_NOTIF]);
  await boot();
  await signInInTab(Y_ID);
  await waitFor(() => jobBy(JY), '(5) Y read');
  await waitFor(() => notifs().some(n => n.id === Y_NOTIF.id), '(5) Y\'s own notification is restored');
  await settle(100);
  assert(jobs().length === 2 && jobBy(JY) && jobBy(JY2) && !jobBy(JX) && !jobBy(JX2), '(5) Y sees only Y\'s backend jobs');
  const y2 = jobBy(JY2);
  assert(y2?.addressText === 'San Francisco, CA' && y2?.msgs?.length === 0 && y2?.photos?.length === 0 && !y2?.rated && y2?.desc === '', '(5) a Y job with no master entry gets nothing from anyone else\'s entries');
  const yJob = jobBy(JY);
  assert(yJob?.desc === 'Y gutter note' && sameJSON(yJob?.msgs, [yMaster.msgs[0]]), '(5) Y\'s own master details are restored');
  assert(!/Gate code is 4411|Quick and tidy|Drips under the sink|X private notification body/.test(storedData['haven_jobs'] + storedData['haven_notifications']), '(5) Y\'s cache and notifications hold nothing of X\'s');
  assert(!notifs().some(n => n.id === X_NOTIF.id || n.id === UNLINKED_NOTIF.id), '(5) X\'s notification and the unlinked one are not shown to Y');
  assert(/1 unread/.test(profileAria()), `(5) Y\'s unread badge counts only Y\'s own notification (got "${profileAria()}")`);
  assert(sameJSON((legacyNotifs() || []).map(n => n.id).sort(), [UNLINKED_NOTIF.id, X_NOTIF.id].sort()), '(5) X\'s notification and the unlinked one stay set aside');
  assert(sameJSON(pending().map(e => e.backendJobId).sort(), [JX, JX2].sort()), '(5) X\'s set-aside job entries stay for X');
  await tap(screen.queryAllByText('Profile').pop(), 'Profile tab');
  await tap(Array.from(document.querySelectorAll('button')).find(b => /^Notifications/.test(b.getAttribute('aria-label') || '')), 'Notifications');
  t = bodyText();
  assert(/Y notification body/.test(t) && !/X private notification body|Unlinked old notice body/.test(t), '(5) the Notifications screen shows only Y\'s notification');
  c = await myHomeCounts();
  assert(!/Gate code|Quick and tidy/.test(c.text), '(5) Y\'s My Home shows nothing of X\'s');
  await signOutInTab();
  assert(pending().length === 2 && (legacyNotifs() || []).length === 2, '(5) signing out does not clear the set-aside entries or notifications');
  forgedRowsInRead = [];
  await signInInTab(X_ID);
  await waitFor(() => jobBy(JX), '(5) X read');
  await waitFor(() => notifs().some(n => n.id === X_NOTIF.id), '(5) X\'s notification is restored for X');
  await settle(100);
  j = jobBy(JX);
  assert(j?.addressText === SAMPLE_HOME_TEXT && j?.stars === 4.5 && j?.photos?.length === 2 && !jobBy(JY) && !jobBy(JY2), '(5) X then claims them: address, rating, photos; Y\'s jobs are gone');
  assert(notifs().find(n => n.id === X_NOTIF.id)?.jobId === j?.id && !notifs().some(n => n.id === Y_NOTIF.id), '(5) X sees X\'s notification (pointing at X\'s job), not Y\'s');
  assert(sameJSON((legacyNotifs() || []).map(n => n.id), [UNLINKED_NOTIF.id]) && !notifs().some(n => n.id === UNLINKED_NOTIF.id), '(5) a notification with no job link stays set aside and is never shown');
  c = await myHomeCounts();
  assert(c.completed === '1' && c.saved === '1', `(5) X sees 1 completed / 1 saved (got ${c.completed}/${c.saved})`);
  assert(pending().length === 0, '(5) released once X claimed them');

  // ── (6) a cache owned by another account is never set aside or applied ──
  rowsByCustomer = { [X_ID]: xRows() };
  seedMaster(X_ID);
  storedData['haven_jobs_owner'] = B_ID; // B's cache (same backend id, forged)
  await boot();
  await waitFor(() => jobBy(JX), '(6) X read over B cache');
  assert(legacy() === null && legacyNotifs() === null, '(6) another account\'s cache is not set aside');
  j = jobBy(JX);
  assert(j?.addressText === 'San Francisco, CA' && j?.msgs?.length === 0 && !j?.rated && j?.photos?.length === 0, '(6) nothing from another account\'s cache is applied');

  // ── (7) the backend and later local data win ──
  rowsByCustomer = { [X_ID]: [realRow(JX, X_ID, { address_snapshot: '9 Backend Way, San Francisco, CA 94110' }), xRows()[1]] };
  seedMaster(X_ID);
  await boot();
  await waitFor(() => jobBy(JX), '(7) read with snapshot');
  j = jobBy(JX);
  assert(j?.addressText === '9 Backend Way, San Francisco, CA 94110', '(7) a stored address_snapshot wins over the set-aside street');
  assert(j?.stars === 4.5 && sameJSON(j?.msgs, [CU_MSG]), '(7) other device-only details are still restored');
  // owned cache already has newer local details, with an entry still set aside
  rowsByCustomer = { [X_ID]: xRows() };
  seedMaster(X_ID, [], []);
  storedData['haven_jobs_owner'] = X_ID;
  storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: [{ ...masterJob({ status: 'complete', stars: 2, reviewTxt: 'Later review', rated: true, msgs: [], addressText: '77 Newer Rd, San Francisco, CA 94110', desc: '' }) }] });
  storedData['haven_jobs_unowned_legacy'] = JSON.stringify({ __v: 1, data: [{ backendJobId: JX, id: LOCAL_ID, addressText: SAMPLE_HOME_TEXT, addressLabel: 'Home', msgs: [CU_MSG], photos: [PHOTO], desc: 'Old desc', rated: true, stars: 5, reviewTxt: 'Old review', hireAgain: false, tpId: 3 }] });
  await boot();
  await waitFor(() => readCount && jobBy(JX)?.msgs?.length, '(7) merge over owned');
  j = jobBy(JX);
  assert(j?.stars === 2 && j?.reviewTxt === 'Later review' && j?.addressText === '77 Newer Rd, San Francisco, CA 94110' && j?.tpId === 2, '(7) a later local rating, address and time window are not overwritten');
  assert(sameJSON(j?.msgs, [CU_MSG]) && j?.desc === 'Old desc', '(7) only empty fields are filled (messages, description)');
  assert(!(j?.restoredDeviceOnly || []).includes('rating'), '(7) a rating that was not restored is not labelled as restored');
  assert(legacy() === null, '(7) released when nothing is left to restore');
  // owned cache entry without an address, backend has address_snapshot: the set-aside street is not applied over it
  rowsByCustomer = { [X_ID]: [realRow(JX, X_ID, { address_snapshot: '9 Backend Way, San Francisco, CA 94110' })] };
  seedMaster(X_ID, [], []);
  storedData['haven_jobs_owner'] = X_ID;
  storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: [{ ...masterJob({ status: 'complete', addressText: '—', addressLabel: '' }) }] });
  storedData['haven_jobs_unowned_legacy'] = JSON.stringify({ __v: 1, data: [{ backendJobId: JX, id: LOCAL_ID, addressText: SAMPLE_HOME_TEXT, addressLabel: 'Home' }] });
  await boot();
  await waitFor(() => readCount && jobBy(JX), '(7) snapshot over owned');
  await settle(100);
  assert(jobBy(JX) && jobBy(JX).addressText !== SAMPLE_HOME_TEXT, '(7) where the backend row has an address_snapshot, the set-aside street is never applied');

  // ── (8) idempotence of the set-aside, storage quota, id collisions ──
  rowsByCustomer = {};
  seedMaster(null, [masterJob({ desc: 'second copy' }), masterJob2()]);
  storedData['haven_jobs_unowned_legacy'] = JSON.stringify({ __v: 1, data: [{ backendJobId: JX, id: LOCAL_ID, addressText: SAMPLE_HOME_TEXT, desc: 'first copy' }] });
  await boot();
  assert(legacy()?.length === 2 && legacy()?.find(e => e.backendJobId === JX)?.desc === 'first copy', '(8) an entry already set aside is kept as it is; only new ids are added');
  await boot();
  assert(legacy()?.length === 2 && legacyNotifs()?.length === 1, '(8) booting again adds nothing');
  // the set-aside write is refused: nothing is dropped, the old store stays untouched and hidden, retried next load
  rowsByCustomer = { [X_ID]: xRows() };
  seedMaster(X_ID);
  const rawJobsBefore = storedData['haven_jobs'], rawNotifsBefore = storedData['haven_notifications'];
  refuseSet = (k) => k === 'haven_jobs_unowned_legacy' || k === 'haven_notifications_unowned_legacy';
  await boot();
  await waitFor(() => readCount && /Bookings/.test(bodyText()), '(8) app loads with the set-aside refused');
  await settle(200);
  assert(storedData['haven_jobs'] === rawJobsBefore && storedData['haven_notifications'] === rawNotifsBefore, '(8) when the set-aside cannot be written, the old jobs cache and notifications stay byte-identical');
  assert(!('haven_jobs_owner' in storedData) && legacy() === null && legacyNotifs() === null, '(8) the owner is not saved, so the next load tries again');
  c = await myHomeCounts();
  assert(!/Gate code|Quick and tidy|X private notification body/.test(bodyText()) && !/unread/.test(profileAria()), '(8) the untouched old store is never displayed');
  refuseSet = null;
  await boot();
  await waitFor(() => jobBy(JX), '(8) retry on the next load');
  await waitFor(() => notifs().some(n => n.id === X_NOTIF.id), '(8) notification restored on the retry');
  assert(jobBy(JX)?.addressText === SAMPLE_HOME_TEXT && jobBy(JX)?.photos?.length === 2 && sameJSON(jobBy(JX)?.msgs, [CU_MSG]), '(8) the retry sets aside and restores everything (address, photos, own messages)');
  // a nearly full storage: the master cache fits, a second copy would not. The
  // cache is removed before the copy is written, so photos still fit.
  const BIG = 'data:image/jpeg;base64,' + 'B'.repeat(60000);
  seedMaster(null, [masterJob({ photos: [BIG, BIG] })]);
  const used = () => Object.entries(storedData).reduce((n, [k, v]) => n + k.length + v.length, 0);
  const LIMIT = used() + 4000;
  const overLimit = (lim) => (k, v) => Object.entries(storedData).filter(([kk]) => kk !== k).reduce((n, [kk, vv]) => n + kk.length + vv.length, 0) + k.length + v.length > lim;
  refuseSet = overLimit(LIMIT);
  await boot();
  refuseSet = null;
  const big = legacy()?.find(e => e.backendJobId === JX);
  assert(big?.photos?.length === 2 && big?.photos?.[0] === BIG, '(8) near the storage quota the photos are still set aside (no second copy is needed)');
  // signed in near the quota: the claimed photos cannot be saved in the jobs
  // cache yet, so nothing is released; once space allows, the next read saves
  // and releases them
  rowsByCustomer = { [X_ID]: [realRow(JX, X_ID)] };
  seedMaster(X_ID, [masterJob({ photos: [BIG, BIG] })]);
  refuseSet = overLimit(used() + 4000);
  await boot();
  await waitFor(() => readCount && pending().length === 1, '(8) quota claim');
  await settle(150);
  assert(pending()[0]?.photos?.length === 2, '(8) when the jobs cache cannot be saved with the claimed photos, the set-aside entry is kept');
  refuseSet = null;
  await boot();
  await waitFor(() => jobBy(JX)?.photos?.length === 2, '(8) claim after space');
  await settle(100);
  assert(jobBy(JX)?.photos?.length === 2 && pending().length === 0, '(8) with space again the photos are saved on the job and then released');
  // a master local id that collides with another job: the backend-derived id is used, nothing dropped
  rowsByCustomer = { [X_ID]: [realRow(JX, X_ID), realRow(JX2, X_ID, { posted_at: '2025-09-28T19:06:40Z', city_label: 'Orlando, FL' })] };
  seedMaster(X_ID, [masterJob(), { ...masterJob2(), id: LOCAL_ID }]); // both master entries carry the same local id
  await boot();
  await waitFor(() => jobBy(JX) && jobBy(JX2), '(8) collision read');
  const ids = jobs().map(x => x.id);
  assert(jobs().length === 2 && new Set(ids).size === 2 && ids.includes(LOCAL_ID), '(8) two master entries with the same local id: both jobs kept, ids stay unique');

  cleanup();
  console.log(`--- Master cache upgrade (QA #87 v3/v4): ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); assert(false, 'harness error: ' + (e && e.message)); console.log(`--- Master cache upgrade (QA #87 v3/v4): ${pass} passing, ${fail} failing ---`); process.exit(1); });
