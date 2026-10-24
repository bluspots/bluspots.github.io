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
 * (9) Phone-only bookings (no backend id): an account's own are kept under it
 *     and shown to it, labelled; master ones stay set aside, shown to nobody;
 *     never given to another account; a refused write is retried.
 * (10) Per-account device data, X/Y/X/Y on one device (also low storage):
 *     each sees only its own data with the exact label, badges are right,
 *     sign-out clears the screen, nothing is lost, no card data or secrets.
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
function bodyText() { const c = document.body.cloneNode(true); c.querySelectorAll('style,script').forEach(e => e.remove()); return c.textContent; }
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
const masterLocalOnly = () => ({ ...masterJob({ id: LOCAL_ID + 2, backendJobId: null, desc: 'LOCALONLY never a booking', addressText: REAL_TEXT, addressLabel: 'Cabin' }) });
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
const inStorage = (title) => Object.values(storedData).some(v => v.includes(title));
const bookingsText = async () => { const tab = screen.queryAllByText(/^Bookings$/).pop(); await tap(tab, 'Bookings tab'); await settle(100); return bodyText(); };
const localOnlyStore = () => { try { return JSON.parse(storedData['haven_jobs_local_only'] || 'null')?.data || null; } catch { return null; } };

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
  assert(!jobs().some(x => /LOCALONLY/.test(x.desc || '')) && !/LOCALONLY/.test(bodyText()), '(1) a master entry with no backend id is not shown as a booking');
  assert(sameJSON((localOnlyStore()?.ownerless || []).filter(e => /LOCALONLY/.test(e.desc || '')), [masterLocalOnly()]), '(1) a master entry with no backend id is kept, byte-for-byte, in the ownerless phone-only set-aside (not deleted)');
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
    assert(t.includes('2:05 PM · Saved on this phone only · not synced'), '(1) the restored own message carries the exact label "Saved on this phone only · not synced"');
    assert(!/not delivered|not sent/.test(t), '(1) no "not delivered" / "not sent" label variant is shown');
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
  assert(!(legacy() || []).some(e => /LOCALONLY/.test(e.desc || '')) && sameJSON((localOnlyStore()?.ownerless || []).filter(e => /LOCALONLY/.test(e.desc || '')), [masterLocalOnly()]), '(3) the entry with no backend id is set aside as it is in the phone-only key (not in the claimable set-aside)');
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
  // QA v5 F3: the set-aside fits but the owner key does not. The account
  // read's bookings still show this session; storage is not changed further;
  // the next load saves the owner and links everything.
  rowsByCustomer = { [X_ID]: xRows() };
  seedMaster(X_ID);
  refuseSet = (k) => k === 'haven_jobs_owner';
  const r3 = readCount;
  await boot();
  await waitFor(() => readCount > r3, '(8) owner refused: account read');
  await settle(200);
  let bt = await bookingsText();
  assert(/Assemble furniture/.test(bt) && !/No bookings yet/.test(bt), '(8) when the owner key cannot be saved, Bookings still shows the account read\'s bookings (no false "No bookings yet")');
  assert(!('haven_jobs_owner' in storedData) && jobs().length === 0 && pending().length === 2 && legacyNotifs()?.length === 1, '(8) when the owner key cannot be saved, nothing is dropped: the set-aside entries and notification stay, no cache is written');
  refuseSet = null;
  await boot();
  await waitFor(() => jobBy(JX) && storedData['haven_jobs_owner'] === X_ID, '(8) owner refused: saved on the next load');
  await waitFor(() => notifs().some(n => n.id === X_NOTIF.id), '(8) owner refused: notification restored on the next load');
  assert(jobBy(JX)?.addressText === SAMPLE_HOME_TEXT && pending().length === 0, '(8) after the owner key is saved on the next load, the job is linked and the entries released');
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

  // ── (9) phone-only bookings (no backend id): never deleted, never given to another account ──
  // A per-user cache entry stays with that user (kept under that account and
  // shown to it, labelled); an ownerless (master) one is set aside with no
  // owner and shown to nobody, because no backend id can prove whose it is.
  // Only Reset Prototype Data clears them.
  const phoneOnly = (id, title) => ({ ...masterJob({ id, taskId: null, custom: { title, price: '80', cat: 'Handyman' }, backendJobId: null, status: 'posted', addressText: REAL_TEXT, addressLabel: 'Cabin', rated: false, stars: 0, reviewTxt: '', hireAgain: null, msgs: [CU_MSG] }) });
  const PHONE_X = { ...phoneOnly(LOCAL_ID + 50, 'Phone-only shelf fix'), status: 'en_route', msgs: [CU_MSG, PRO_REPLY] };
  const PHONE_M = { ...phoneOnly(LOCAL_ID + 60, 'Master phone-only gutter job'), addressText: '500 Folsom Street, San Francisco, CA 94105', addressLabel: 'Work' };
  const localOnly = () => { try { return JSON.parse(storedData['haven_jobs_local_only'] || 'null')?.data || null; } catch { return null; } };
  const bucketOf = (uid) => (localOnly()?.owners || {})[uid.toLowerCase()] || [];
  const ownerlessBucket = () => localOnly()?.ownerless || [];
  const holds = (list, job) => list.filter(e => JSON.stringify(e) === JSON.stringify(job)).length;
  // per-account copies never hold card/payment/tip fields (QA v6 item 5)
  const NO_STORE = /payment|card|token|secret|password|auth|^tip/i;
  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !NO_STORE.test(k)));
  const PHONE_X_STORED = strip(PHONE_X);
  const phoneShown = (t) => /Phone-only shelf fix/.test(t) && t.includes('Saved on this phone only · not synced');
  // per-user cache: X's own cache holds a backend job and a phone-only one
  const seedOwned = () => {
    Object.keys(storedData).forEach(k => delete storedData[k]);
    signInStorage(X_ID);
    storedData['haven_jobs_owner'] = X_ID;
    storedData['haven_addresses'] = JSON.stringify({ __v: 1, data: [REAL] });
    storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: [masterJob({ id: LOCAL_ID, backendJobId: JX }), PHONE_X] });
  };
  rowsByCustomer = { [X_ID]: [realRow(JX, X_ID)], [Y_ID]: [realRow(JY, Y_ID)] };
  seedOwned();
  await boot();
  await waitFor(() => readCount && jobBy(JX), '(9) per-user: X read lands');
  await settle(150);
  assert(inStorage('Phone-only shelf fix'), '(9) per-user: the phone-only booking still exists in storage after the read lands (not deleted)');
  assert(holds(bucketOf(X_ID), PHONE_X_STORED) === 1, '(9) per-user: X\'s phone-only booking is kept for X, as it was minus card/payment fields');
  let bt9 = await bookingsText();
  assert(phoneShown(bt9), '(9) per-user: X\'s own phone-only booking is shown to X, labelled "Saved on this phone only · not synced"');
  assert(holds(ownerlessBucket(), PHONE_X) === 0 && Object.keys(localOnly()?.owners || {}).length === 1, '(9) per-user: it is kept only under X (not ownerless, no other account)');
  await tap(screen.queryAllByText(/Phone-only shelf fix/).pop(), 'phone-only card');
  bt9 = bodyText();
  assert(bt9.includes('Saved on this phone only · not synced') && !/Looking for a pro|Marcus T\.|Cancel job|On the way|Got it! 👍/i.test(bt9), '(9) per-user: the phone-only detail shows the label, no pro, no simulated progress, no scripted reply, no cancel');
  let snapLocal = storedData['haven_jobs_local_only'];
  for (const n of ['reload', 'second load']) {
    const r0 = readCount;
    await boot();
    await waitFor(() => readCount > r0 && jobBy(JX), `(9) per-user: read after ${n}`);
    await settle(150);
    assert(storedData['haven_jobs_local_only'] === snapLocal && holds(bucketOf(X_ID), PHONE_X_STORED) === 1, `(9) per-user: after a ${n} the phone-only booking is still stored, unchanged, once`);
    assert(phoneShown(await bookingsText()), `(9) per-user: after a ${n} it is still shown to X with the label`);
  }
  // backend down on two loads in a row: the cache keeps the entry, the set-aside holds it once
  seedOwned(); backendDown = true;
  await boot(); await boot();
  assert(holds(bucketOf(X_ID), PHONE_X_STORED) === 1 && bucketOf(X_ID).length === 1 && Object.keys(localOnly()?.owners || {}).length === 1, '(9) per-user: two loads with the backend down store the phone-only booking once (no second copy)');
  assert(sameJSON(jobs().map(x => x.id), [LOCAL_ID, PHONE_X.id]), '(9) per-user: a failed read leaves both entries in X\'s stored cache');
  backendDown = false;
  await boot();
  await waitFor(() => jobBy(JX), '(9) per-user: read after the backend recovers');
  assert(holds(bucketOf(X_ID), PHONE_X_STORED) === 1, '(9) per-user: after the backend recovers it is still stored once');
  // Y signs in on the same device: X's phone-only booking is never Y's
  await signOutInTab();
  rowsByCustomer[Y_ID] = [realRow(JY, Y_ID)];
  await signInInTab(Y_ID);
  await waitFor(() => jobBy(JY), '(9) per-user: Y read');
  await settle(150);
  assert(!/Phone-only shelf fix/.test(await bookingsText()) && !jobs().some(x => x.id === PHONE_X.id), '(9) per-user: Y never sees X\'s phone-only booking');
  assert(holds(bucketOf(X_ID), PHONE_X_STORED) === 1 && bucketOf(Y_ID).length === 0, '(9) per-user: after Y signs in it is still stored under X only');
  seedOwned();
  await boot();
  await signOutInTab();
  assert(holds(bucketOf(X_ID), PHONE_X_STORED) === 1, '(9) per-user: signing out before the read lands keeps the phone-only booking for X');
  // the set-aside write is refused: X's stored cache stays byte-identical, retried next load
  seedOwned();
  const ownedBefore = storedData['haven_jobs'];
  refuseSet = (k) => k === 'haven_jobs_local_only';
  await boot();
  await waitFor(() => readCount && /Bookings/.test(bodyText()), '(9) per-user: app loads with the phone-only set-aside refused');
  await settle(200);
  assert(storedData['haven_jobs'] === ownedBefore && localOnly() === null, '(9) per-user: when the phone-only set-aside cannot be written, X\'s stored cache stays byte-identical');
  assert(phoneShown(await bookingsText()), '(9) per-user: ... and X still sees the phone-only booking (from memory), labelled');
  refuseSet = null;
  await boot();
  await waitFor(() => holds(bucketOf(X_ID), PHONE_X_STORED) === 1, '(9) per-user: the set-aside is retried and succeeds on the next load');

  // old master cache: an ownerless phone-only booking
  rowsByCustomer = { [X_ID]: xRows(), [Y_ID]: [realRow(JY, Y_ID)] };
  seedMaster(X_ID, [masterJob(), PHONE_M]);
  await boot();
  await waitFor(() => jobBy(JX), '(9) master: X read lands');
  await settle(150);
  assert(inStorage('Master phone-only gutter job'), '(9) master: the phone-only booking still exists in storage after the read lands (not deleted)');
  assert(holds(ownerlessBucket(), PHONE_M) === 1, '(9) master: the ownerless phone-only booking is set aside, byte-for-byte');
  assert(bucketOf(X_ID).length === 0 && !jobs().some(x => x.id === PHONE_M.id), '(9) master: it is not given to the signed-in account (no backend id proves an owner)');
  assert(!/Master phone-only gutter job/.test(await bookingsText()), '(9) master: it is not shown');
  snapLocal = storedData['haven_jobs_local_only'];
  for (const n of ['reload', 'second load']) {
    const r0 = readCount;
    await boot();
    await waitFor(() => readCount > r0 && jobBy(JX), `(9) master: read after ${n}`);
    await settle(150);
    assert(storedData['haven_jobs_local_only'] === snapLocal && holds(ownerlessBucket(), PHONE_M) === 1, `(9) master: after a ${n} it is still stored byte-for-byte, once`);
    assert(!/Master phone-only gutter job/.test(await bookingsText()), `(9) master: after a ${n} it is still not shown`);
    assert(addrIds().includes(2), `(9) master: after a ${n} the sample address the phone-only booking is at is kept`);
  }
  await signOutInTab();
  await signInInTab(Y_ID);
  await waitFor(() => jobBy(JY), '(9) master: Y read');
  await settle(150);
  assert(!/Master phone-only gutter job/.test(await bookingsText()) && holds(ownerlessBucket(), PHONE_M) === 1 && bucketOf(Y_ID).length === 0, '(9) master: another account never sees it or gets it; it stays set aside');
  // the master set-aside write is refused: nothing is dropped, retried next load
  seedMaster(X_ID, [masterJob(), PHONE_M]);
  const masterBefore = storedData['haven_jobs'];
  refuseSet = (k) => k === 'haven_jobs_local_only';
  await boot();
  await settle(200);
  assert(storedData['haven_jobs'] === masterBefore && localOnly() === null && !('haven_jobs_owner' in storedData), '(9) master: when the phone-only set-aside cannot be written, the old cache stays byte-identical and ownerless');
  refuseSet = null;
  await boot();
  await waitFor(() => holds(ownerlessBucket(), PHONE_M) === 1 && jobBy(JX), '(9) master: retried on the next load');
  assert(/"haven_jobs_local_only"/.test(fs.readFileSync('persistence.js', 'utf8').match(/PERSISTED_KEYS\s*=\s*\[[^\]]*\]/)?.[0] || ''), '(9) Reset Prototype Data clears the phone-only set-aside (it is in PERSISTED_KEYS)');
  assert(/"haven_account_device_data"/.test(fs.readFileSync('persistence.js', 'utf8').match(/PERSISTED_KEYS\s*=\s*\[[^\]]*\]/)?.[0] || ''), '(10) Reset Prototype Data clears the per-account store (it is in PERSISTED_KEYS)');

  // ── (10) per-account device data (founder decision, QA v6): X, Y, X, Y on one device ──
  // Each account's descriptions, photos, ratings, own messages, real street
  // addresses, notifications and phone-only bookings are kept under its own
  // id, cleared from the screen on sign-out/switch, never shown to the other
  // account, and restored on its next sign-in. Low storage loses nothing.
  const LABEL = 'Saved on this phone only · not synced';
  const JX3 = '5eed0000-0000-4000-8000-00000000000d';
  const X_NOTIF2 = notif('n1759000400000_1', LOCAL_ID, 'Pro accepted your job', 'X private alert');
  const DEVICE_NOTICE = notif('n1759000400000_7', null, 'Welcome', 'Device notice', { type: 'ACCOUNT', isRead: true });
  const Y_ACCT_NOTIF = { ...notif('n1759000500000_1', LOCAL_ID + 900, 'Job completed', 'Y private alert'), accountBackendJobId: JY };
  const Y_STREET = '9 Elm St, Austin, TX 78701';
  const seedXY = () => {
    Object.keys(storedData).forEach(k => delete storedData[k]);
    signInStorage(X_ID);
    storedData['haven_jobs_owner'] = X_ID;
    storedData['haven_addresses'] = JSON.stringify({ __v: 1, data: [REAL] });
    storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: [
      masterJob({ id: LOCAL_ID, backendJobId: JX, addressText: REAL_TEXT, addressLabel: 'Cabin', msgs: [CU_MSG, PRO_REPLY], photos: [PHOTO], desc: 'X private desc', rated: true, stars: 5, reviewTxt: 'X private review', hireAgain: true, status: 'complete' }),
      masterJob({ id: LOCAL_ID + 3, backendJobId: JX3, addressText: 'Orlando, FL', addressLabel: '', msgs: [], photos: [], desc: '', rated: false, stars: 0, reviewTxt: '', hireAgain: null, tpId: null }),
      PHONE_X,
    ] });
    storedData['haven_notifications'] = JSON.stringify({ __v: 1, data: [X_NOTIF2, DEVICE_NOTICE] });
    storedData['haven_account_device_data'] = JSON.stringify({ __v: 1, data: { [Y_ID.toLowerCase()]: {
      jobs: [{ backendJobId: JY, id: LOCAL_ID + 900, addressText: Y_STREET, addressLabel: 'Y home', msgs: [{ id: 1759000500001, f: 'cu', m: 'Y own note', t: '3:00 PM' }], photos: [PHOTO], desc: 'Y private desc', rated: true, stars: 4, reviewTxt: 'Y private review', hireAgain: true }],
      notifications: [Y_ACCT_NOTIF] } } });
  };
  const acctStore = () => { try { return JSON.parse(storedData['haven_account_device_data'] || 'null')?.data || null; } catch { return null; } };
  const acctOf = (uid) => (acctStore() || {})[uid.toLowerCase()] || null;
  const X_TEXT = /X private desc|X private review|X private alert|Gate code is 4411|Phone-only shelf fix/;
  const Y_TEXT = /Y private desc|Y private review|Y private alert|Y own note/;
  const onNotifScreen = () => !!document.querySelector('[aria-label="Back"]') && /^\s*‹?\s*Notifications/.test(bodyText().trim());
  const notifScreen = async () => {
    if (!onNotifScreen()) {
      await tap(screen.queryAllByText('Profile').pop(), 'Profile tab');
      await tap(Array.from(document.querySelectorAll('button')).find(b => /^Notifications/.test(b.getAttribute('aria-label') || '')), 'Notifications');
    }
    const t = bodyText();
    await tap(document.querySelector('[aria-label="Back"]'), 'Back from Notifications');
    return t;
  };
  const toTabs = async () => {
    for (let i = 0; i < 3 && !screen.queryAllByText(/^Bookings$/).length; i++) {
      const back = Array.from(document.querySelectorAll('button')).find(b => /^(‹|←|<)?\s*Back/.test(b.textContent.trim()) || /^Back/.test(b.getAttribute('aria-label') || ''));
      if (!back) break;
      await tap(back, 'Back');
    }
  };
  const openRated = async (step) => {
    await toTabs();
    await tap(screen.queryAllByText(/^Bookings$/).pop(), 'Bookings tab');
    const card = Array.from(document.querySelectorAll('[role="button"]')).find(el => /Reviewed/.test(el.textContent));
    if (!card) { assert(false, `missing control: (10) ${step} rated booking card`); return ''; }
    await tap(card, 'rated card');
    return bodyText();
  };
  const noBareLabel = (t) => !/Saved on this phone only(?! · not synced)/.test(t) && !/not delivered|not sent/.test(t);
  async function viewX(step) {
    await toTabs();
    await waitFor(() => jobBy(JX)?.desc === 'X private desc', `(10) ${step}: X's details restored`);
    await settle(150);
    const b = await bookingsText();
    assert(/Phone-only shelf fix/.test(b) && b.includes('Reviewed · ' + LABEL) && b.includes(LABEL), `(10) ${step}: X's Bookings show X's rating and phone-only booking, labelled`);
    assert(!Y_TEXT.test(b), `(10) ${step}: X's Bookings show nothing of Y's`);
    assert(/1 unread/.test(profileAria()), `(10) ${step}: X's badge counts only X's alert (got "${profileAria()}")`);
    const d = await openRated(step);
    assert(/X private desc/.test(d) && /Review submitted/.test(d) && jobBy(JX)?.reviewTxt === 'X private review' && jobBy(JX)?.stars === 5, `(10) ${step}: X's description and rating are back`);
    assert(/1 (shared|added) · Saved on this phone only · not synced/.test(d) && (d.match(new RegExp(LABEL, 'g')) || []).length >= 3, `(10) ${step}: photos, description and rating carry the exact label`);
    assert(noBareLabel(b) && noBareLabel(d) && !Y_TEXT.test(d), `(10) ${step}: no other label wording; nothing of Y's on X's detail`);
    assert(jobBy(JX)?.addressText === REAL_TEXT && jobBy(JX3)?.addressText === 'Orlando, FL', `(10) ${step}: X's real street address is back (the city fallback stays a fallback)`);
    const n = await notifScreen();
    assert(/X private alert/.test(n) && !/Y private alert/.test(n), `(10) ${step}: X's Notifications show X's alert only`);
  }
  async function viewY(step) {
    await toTabs();
    await tap(screen.queryAllByText(/^Bookings$/).pop(), 'Bookings tab');
    await waitFor(() => /Reviewed/.test(bodyText()), `(10) ${step}: Y's details restored`);
    await settle(150);
    const b = await bookingsText();
    assert(!X_TEXT.test(b) && b.includes('Reviewed · ' + LABEL), `(10) ${step}: Y's Bookings show Y's rating, labelled, and nothing of X's`);
    assert(/1 unread/.test(profileAria()), `(10) ${step}: Y's badge counts only Y's alert (got "${profileAria()}")`);
    const d = await openRated(step);
    assert(/Y private desc/.test(d) && /Review submitted/.test(d) && !X_TEXT.test(d) && noBareLabel(d), `(10) ${step}: Y's description and review are shown with the exact label, nothing of X's`);
    const n = await notifScreen();
    assert(/Y private alert/.test(n) && !/X private alert/.test(n), `(10) ${step}: Y's Notifications show Y's alert only`);
  }
  const nothingLost = (step) => {
    const all = Object.values(storedData).join(' ');
    assert(['X private desc', 'X private review', 'X private alert', 'Gate code is 4411', 'Phone-only shelf fix', 'Y private desc', 'Y private review', 'Y private alert', 'Y own note', Y_STREET, REAL_TEXT].every(x => all.includes(x)), `(10) ${step}: nothing of X's or Y's is lost from storage`);
  };
  const noSecrets = (step) => {
    const keys = ['haven_account_device_data'];
    const perAcct = keys.map(k => storedData[k] || '').join(' ') + JSON.stringify(localOnly()?.owners || {});
    const tokens = [storedData['haven_auth_access_token'], 'signed-in-access-token'].filter(Boolean);
    assert(!/payment|card|last4|"tip|token|secret|password|"auth|4242|Visa/i.test(perAcct) && !tokens.some(t => perAcct.includes(t)), `(10) ${step}: the per-account store holds no card/payment/tip details, tokens or secrets`);
  };
  rowsByCustomer = { [X_ID]: [realRow(JX, X_ID, { city_label: 'Orlando, FL' }), realRow(JX3, X_ID, { status: 'posted', city_label: 'Orlando, FL', completed_at: null, accepted_at: null })], [Y_ID]: [realRow(JY, Y_ID, { city_label: 'Austin, TX' })] };
  seedXY();
  await boot();
  await viewX('X first');
  // the chat: the customer's own message with the exact label, never a scripted reply
  await openRated('chat');
  if (await tap(Array.from(document.querySelectorAll('button')).find(b => /Chat|Message/.test(b.textContent)), 'Chat button (10)')) {
    const ct = bodyText();
    assert(ct.includes('2:05 PM · ' + LABEL) && !/Got it! 👍|On it!/.test(ct) && noBareLabel(ct), '(10) X\'s own message carries the exact label; no scripted pro reply');
  }
  // ── exact label, every item type: each text that says "Saved on this phone"
  // is exactly "Saved on this phone only · not synced" (message, rating,
  // photos, description, phone-only booking card and its detail).
  {
    const labelTexts = () => Array.from(document.body.querySelectorAll('*'))
      .filter(el => !['STYLE', 'SCRIPT'].includes(el.tagName) && Array.from(el.childNodes).some(c => c.nodeType === 3 && /Saved on this phone/.test(c.textContent)))
      .map(el => el.textContent.trim());
    const exact = (t) => t.endsWith(LABEL) && t.split('Saved on this phone').length === 2;
    const chatL = labelTexts();
    const msgOk = chatL.some(t => /2:05 PM · /.test(t) && t.endsWith(LABEL));
    await toTabs();
    await bookingsText();
    const listL = labelTexts();
    const ratingOk = listL.some(t => /Reviewed · /.test(t) && t.endsWith(LABEL));
    const cardOk = listL.some(t => t === LABEL);
    await openRated('exact label');
    const detL = labelTexts();
    const photosOk = detL.some(t => /^1 (shared|added) · /.test(t) && t.endsWith(LABEL));
    const descEl = Array.from(document.body.querySelectorAll('div')).find(el => el.children.length === 0 && /X private desc/.test(el.textContent));
    const descOk = !!descEl && Array.from(descEl.parentElement.children).some(el => el.textContent === LABEL);
    const ratingDetOk = detL.filter(t => t === LABEL).length >= 2;
    await toTabs();
    await tap(screen.queryAllByText(/^Bookings$/).pop(), 'Bookings tab');
    const phoneCard = Array.from(document.querySelectorAll('[role="button"]')).find(el => /Phone-only shelf fix/.test(el.textContent));
    let phoneDetL = [];
    if (await tap(phoneCard, 'phone-only booking card (10)')) phoneDetL = labelTexts();
    const phoneDetOk = phoneDetL.some(t => t === LABEL);
    const all = chatL.concat(listL, detL, phoneDetL);
    assert(msgOk && ratingOk && cardOk && photosOk && descOk && ratingDetOk && phoneDetOk && all.length > 0 && all.every(exact),
      `(10) exact label on every item type (message ${msgOk}, rating ${ratingOk}/${ratingDetOk}, photos ${photosOk}, description ${descOk}, phone-only card ${cardOk}, phone-only detail ${phoneDetOk}; every label exact ${all.every(exact)})`);
    await toTabs();
  }
  await toTabs();
  await signOutInTab();
  let so = bodyText();
  assert(!X_TEXT.test(so) && !X_TEXT.test(bodyText()) && !/unread/.test(profileAria()), '(10) sign-out: the screen shows nothing of X\'s and no badge');
  assert(!X_TEXT.test(String(storedData['haven_jobs'] || '') + String(storedData['haven_notifications'] || '')), '(10) sign-out: X\'s data is out of the visible cache and notifications');
  const xe = (acctOf(X_ID)?.jobs || []).find(e => e.backendJobId === JX);
  assert(xe?.addressText === REAL_TEXT && xe?.desc === 'X private desc' && xe?.photos?.length === 1 && xe?.stars === 5 && sameJSON(xe?.msgs, [CU_MSG]), '(10) sign-out: X\'s street address, description, photos, rating and own messages are kept under X');
  assert(!(acctOf(X_ID)?.jobs || []).some(e => e.backendJobId === JX3 && 'addressText' in e), '(10) sign-out: the city fallback is never stored as an address');
  assert((acctOf(X_ID)?.notifications || []).some(n => n.id === X_NOTIF2.id && n.accountBackendJobId === JX), '(10) sign-out: X\'s alert is kept under X, linked to its job');
  noSecrets('sign-out');
  nothingLost('sign-out');
  await signInInTab(Y_ID);
  await viewY('then Y');
  nothingLost('then Y');
  await signInInTab(X_ID); // account switch without signing out
  await viewX('X again');
  noSecrets('X again');
  nothingLost('X again');
  // low storage: the per-account store cannot be written at the switch
  refuseSet = (k) => k === 'haven_account_device_data';
  const rawXBefore = storedData['haven_jobs'];
  await signInInTab(Y_ID);
  await viewY('Y with low storage');
  assert(storedData['haven_jobs'] === rawXBefore && storedData['haven_jobs_owner'] === X_ID, '(10) low storage: X\'s cache stays in storage untouched (owner X), nothing moved half-way');
  nothingLost('Y with low storage');
  refuseSet = null;
  await boot(); // reload as Y: the move is retried
  await viewY('Y after reload');
  assert(!X_TEXT.test(String(storedData['haven_jobs'] || '')) && (acctOf(X_ID)?.jobs || []).some(e => e.desc === 'X private desc'), '(10) retry: X\'s data moved to X\'s store on the next load');
  nothingLost('Y after reload');
  await signInInTab(X_ID);
  await viewX('X last');
  nothingLost('X last');
  noSecrets('end');


  cleanup();
  console.log(`--- Master cache upgrade (QA #87 v3/v4): ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); assert(false, 'harness error: ' + (e && e.message)); console.log(`--- Master cache upgrade (QA #87 v3/v4): ${pass} passing, ${fail} failing ---`); process.exit(1); });
