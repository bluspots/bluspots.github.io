/**
 * Phase 1B C — verification claims. Mounts the SHIPPED prototype.html script
 * in jsdom with a mocked backend and checks that no identity / background /
 * license / insured / "verified" trust claim reaches a Customer surface:
 * receipts (in-app, PDF text, share text) and Customer-facing Pro surfaces
 * (tracking, Pro profile, posted screen, chat header, rate screen, Home
 * header, Help). The backend mock deliberately reports "verified" everywhere
 * it could (the Pro's pro_workspace from a Dev Testing simulation, extra
 * fields on the 0022 label RPC, verified contact taps) to prove the Customer
 * app shows nothing from it. No genuine completion signal exists in the
 * backend today, so there is no positive case.
 */
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
Object.defineProperty(global.window, 'innerWidth', { value: 390, configurable: true });
global.window.matchMedia = global.window.matchMedia || ((q) => ({ matches: false, media: q, addListener(){}, removeListener(){} }));
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
let clipboardText = null;
global.navigator.clipboard = { writeText: (t) => { clipboardText = String(t); return Promise.resolve(); } };

// Capture every string the receipt PDF draws.
const RealJsPDF = require('jspdf').jsPDF;
let pdfStrings = [];
// jsPDF's constructor returns its own API object, so wrap the instance.
function CapturingPDF(...args) {
  const doc = new RealJsPDF(...args);
  const realText = doc.text.bind(doc);
  doc.text = (t, ...rest) => { pdfStrings.push(Array.isArray(t) ? t.join('\n') : String(t)); return realText(t, ...rest); };
  doc.save = () => doc;
  return doc;
}
global.window.jspdf = { jsPDF: CapturingPDF };

const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
const { act } = require('react-dom/test-utils');
const babel = require('@babel/core');
const fs = require('fs');
const React = require('react');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); }
}

// Every customer-facing trust claim the founder rule covers.
const CLAIM_RE = /verified|background[ -]?check|licen[sc]ed|insured|vetted|bonded|screened|trust ?& ?safety verified|identity check/i;
function claimsIn(text) {
  const m = String(text || '').match(new RegExp(CLAIM_RE.source, 'gi'));
  return m ? Array.from(new Set(m)) : [];
}
function bodyText() { return Array.from(document.body.children).filter(el => el.tagName !== 'STYLE').map(el => el.textContent).join(' '); }

// ── Load the shipped script block (same approach as boot_check.js) ──
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

// ── Mocked backend ──
const CUSTOMER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PRO_UUID = 'cccccccc-dddd-4eee-8fff-000000000c0c';
const BACKEND_JOB = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
// What a Dev Testing simulation leaves in the Pro's row (pro_workspace is
// Pro-writable; 0021 grants update on it to the owner).
const SIMULATED_PRO_WORKSPACE = {
  identityVerification: { provider: 'persona', status: 'verified', verifiedAt: 1 },
  backgroundCheck: { provider: 'checkr', status: 'clear', clearedAt: 1 },
  payoutAccount: { provider: 'stripe', status: 'enabled', payoutsEnabled: true },
  taxProfile: { status: 'verified' },
  emailVerifyStatus: 'verified',
  phoneVerifyStatus: 'verified',
  credentials: [{ id: 1, type: 'license', name: 'Master Plumber', status: 'verified' }],
};
const requests = [];
global.fetch = async (url, init) => {
  const u = String(url);
  requests.push(u);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.includes('/rest/v1/rpc/job_assigned_pro_labels')) {
    return ok([{
      job_id: BACKEND_JOB, display_name: 'Grace Hopper',
      // Fields a future RPC might add; the Customer must not turn them into claims.
      identity_verified: true, background_checked: true, verified: true,
      pro_workspace: SIMULATED_PRO_WORKSPACE,
    }]);
  }
  if (u.includes('/rest/v1/profiles')) {
    return ok([{ id: PRO_UUID, role: 'pro', display_name: 'Grace Hopper', pro_workspace: SIMULATED_PRO_WORKSPACE }]);
  }
  if (u.includes('/rest/v1/jobs')) {
    return ok([{ id: BACKEND_JOB, status: 'complete', customer_id: CUSTOMER_ID, pro_id: PRO_UUID, verified_pro: true }]);
  }
  return { ok: false, status: 404, json: async () => [], text: async () => 'not found' };
};
global.window.fetch = global.fetch;

function seed(jobs) {
  Object.keys(storedData).forEach(k => delete storedData[k]);
  storedData['haven_supabase_url'] = 'https://example.supabase.co';
  storedData['haven_supabase_anon_key'] = 'test-anon-key';
  storedData['haven_auth_access_token'] = 'signed-in-access-token';
  storedData['haven_auth_user_id'] = CUSTOMER_ID;
  storedData['haven_auth_email'] = 'qa-customer@example.com';
  storedData['haven_auth_role'] = 'customer';
  storedData['haven_jobs'] = JSON.stringify({ __v: 1, data: jobs });
  storedData['haven_notifications'] = JSON.stringify({ __v: 1, data: [] });
}
async function delay(ms) { await new Promise(r => setTimeout(r, ms)); }
async function waitFor(check, label, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (check()) return true; await act(async () => { await delay(25); }); }
  throw new Error('Timed out: ' + label + '\n' + bodyText().slice(0, 500));
}
async function mount(jobs) {
  cleanup();
  seed(jobs);
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { render(React.createElement(App), container); });
  await act(async () => { await delay(40); });
  return container;
}
function lastByText(re) {
  const all = screen.queryAllByText(re);
  return all.length ? all[all.length - 1] : null;
}
async function clickText(re, label) {
  const el = lastByText(re);
  if (!el) throw new Error('No element for ' + (label || re) + '\n' + bodyText().slice(0, 500));
  await act(async () => { fireEvent.click(el); });
  await act(async () => { await delay(40); });
}
async function step(label, fn) {
  const before = fail;
  try { await fn(); console.log((fail === before ? '✓ ' : '✗ ') + label); }
  catch (e) { fail++; console.error('✗ ' + label + '\n   ' + ((e && e.stack) || e)); }
}
function noClaims(text, where) {
  const found = claimsIn(text);
  assert(found.length === 0, `${where}: no verification/trust claim (found ${JSON.stringify(found)})`);
}

const now = Date.now();
const completedBase = {
  status: 'complete', taskId: 1, tpId: 2, lockedPrice: 65,
  acceptedAt: now - 7200000, completedAt: now - 3600000,
  workPerformed: ['Assembled the unit'], materials: [], proNotes: 'All set.',
  msgs: [], photos: [], desc: '', paymentBrand: 'Visa', paymentLast4: '4242',
};
// Real backend job whose Pro "completed" verification only in a simulation.
const backendJob = {
  ...completedBase, id: now - 3000, backendJobId: BACKEND_JOB, backendProId: PRO_UUID, backendProName: 'Grace Hopper',
  pro: { i: 'GH', n: 'Grace Hopper', s: 'Haven Pro', col: '#134E4A', r: null, j: null, memberSince: null, trustScore: null, proId: PRO_UUID, real: true },
};
// Local prototype job saved by an older build: its pro object still carries
// the old hardcoded badges.
const legacyLocalJob = {
  ...completedBase, id: now - 2000, taskId: 1,
  pro: { i: 'MT', n: 'Marcus T.', r: 4.97, j: 543, s: 'TV Mount Pro', col: '#1E40AF', memberSince: '2019',
    trustScore: 98, onTimeRate: 99, hireAgainRate: 97, completionRate: 99, responseTime: '4 min',
    badges: ['Identity verified', 'Background checked', 'Licensed'] },
};

async function checkReceipt(job, who) {
  await mount([job]);
  await clickText(/^Bookings$/, 'Bookings tab');
  await clickText(/Assemble furniture/, 'job card');
  await waitFor(() => /View Receipt/.test(bodyText()), 'tracking for completed job');
  noClaims(bodyText(), `${who}: tracking / assigned pro card`);
  if (!job.rated) {
    await clickText(/Rate (Grace|Marcus)/, 'Rate');
    await waitFor(() => /How was your experience/.test(bodyText()), 'rate screen');
    noClaims(bodyText(), `${who}: rate/review screen`);
    await clickText(/← Back/, 'back');
    await waitFor(() => /View Receipt/.test(bodyText()), 'back on tracking');
  }
  await clickText(/View Receipt/, 'View Receipt');
  await waitFor(() => /PAYMENT BREAKDOWN/.test(bodyText()), 'receipt screen');
  const receiptText = bodyText();
  assert(receiptText.includes(job.pro.n), `${who}: receipt shows the pro name`);
  noClaims(receiptText.replace(/This job is covered by Haven's trust & safety guarantee\.|covered by Haven's satisfaction guarantee\./g, ''), `${who}: in-app receipt`);

  // Share text (Copy Receipt Details).
  clipboardText = null;
  await clickText(/Share Receipt/, 'Share Receipt');
  await clickText(/Copy Receipt Details/, 'Copy Receipt Details');
  await act(async () => { await delay(20); });
  assert(typeof clipboardText === 'string' && clipboardText.includes(`Pro: ${job.pro.n}`), `${who}: share text generated with the pro name`);
  noClaims(clipboardText, `${who}: share text`);

  // PDF text (Save or Download Receipt).
  pdfStrings = [];
  await clickText(/Share Receipt/, 'Share Receipt');
  await clickText(/Save or Download Receipt/, 'Save or Download Receipt');
  const pdfText = pdfStrings.join('\n');
  assert(pdfStrings.length > 0 && pdfText.includes(job.pro.n), `${who}: PDF generated with the pro name`);
  assert(!/Verified Haven Professional/.test(pdfText), `${who}: PDF has no "Verified Haven Professional"`);
  assert(!/Background Checked/i.test(pdfText), `${who}: PDF has no "Background Checked"`);
  noClaims(pdfText, `${who}: PDF text`);
}

(async () => {
  await step('1. Backend job, Pro verified only by simulation: no claim on tracking, receipt, share text, PDF', async () => {
    await checkReceipt(backendJob, 'backend job');
    assert(requests.some(u => u.includes('job_assigned_pro_labels')), 'the 0022 label RPC was read (with simulated verified fields)');
  });

  await step('2. Chat screen header for the real Pro shows no claim', async () => {
    await mount([{ ...backendJob, status: 'in_progress', completedAt: null }]);
    await clickText(/^Bookings$/, 'Bookings tab');
    await clickText(/Assemble furniture/, 'job card');
    await act(async () => { await delay(60); });
    noClaims(bodyText(), 'active backend job tracking');
    await clickText(/💬 (Message|Chat \(closed\))/, 'Message the pro');
    await waitFor(() => /Active job|Chat closed/.test(bodyText()), 'chat screen');
    assert(bodyText().includes('Grace Hopper'), 'chat header shows the real pro');
    noClaims(bodyText(), 'chat header');
  });

  await step('3. Legacy local job with stored badges: receipts and Pro profile show no claim', async () => {
    await checkReceipt(legacyLocalJob, 'legacy local job');
    // Pro profile (reachable for prototype pros from tracking).
    await mount([legacyLocalJob]);
    await clickText(/^Bookings$/, 'Bookings tab');
    await clickText(/Assemble furniture/, 'job card');
    await waitFor(() => /View Receipt/.test(bodyText()), 'tracking');
    await clickText(/^Marcus T\.$/, 'assigned pro card');
    await waitFor(() => /Pro profile/.test(bodyText()), 'Pro profile screen');
    const profileText = bodyText();
    assert(!/Verification/.test(profileText), 'Pro profile has no Verification section');
    noClaims(profileText, 'Pro profile');
  });

  await step('4. Posted screen: no "Verified pros" and no claim on the pros list / their profiles', async () => {
    await mount([{ id: now - 1000, status: 'posted', taskId: 1, tpId: 2, lockedPrice: 65, msgs: [], photos: [], desc: '', pro: null }]);
    await clickText(/^Bookings$/, 'Bookings tab');
    await clickText(/Assemble furniture/, 'job card');
    await waitFor(() => /Looking for a pro/.test(bodyText()), 'posted screen');
    noClaims(bodyText(), 'posted screen');
    await clickText(/^David R\.$/, 'posted-list pro');
    assert(/Pro profile/.test(bodyText()), 'posted-list pro profile opened');
    noClaims(bodyText(), 'posted-list pro profile');
  });

  await step('5. Home header and Help topics show no claim', async () => {
    await mount([]);
    await waitFor(() => /need done/.test(bodyText()), 'Home');
    noClaims(bodyText(), 'Home header');
    await clickText(/^Profile$/, 'Profile tab');
    await clickText(/^Profile$/, 'Profile root');
    await clickText(/Help/, 'Help & support');
    await clickText(/^Trust & safety$/, 'Trust & safety topic');
    const helpText = bodyText();
    assert(/immediate danger/.test(helpText), 'Trust & safety topic still opens (emergency guidance kept)');
    noClaims(helpText, 'Help & support');
  });

  await step('6. Source: no hardcoded claim strings remain in Customer sources', async () => {
    const jsx = fs.readFileSync('home_services_app.jsx', 'utf8');
    const seeds = fs.readFileSync('catalog_seeds.js', 'utf8');
    const manifest = fs.readFileSync('manifest.json', 'utf8');
    assert(!/Verified Haven Professional|"Background Checked"/.test(jsx), 'PDF claim lines removed');
    assert(!/badges\s*:/.test(seeds), 'prototype pros carry no verification badges');
    assert(!/p\.badges|\.badges\.map/.test(jsx), 'no badge rendering');
    assert(!/vetted/i.test(manifest), 'manifest description makes no "vetted" claim');
    assert(!/pro_workspace|identityVerification|backgroundCheck|emailVerifyStatus|phoneVerifyStatus/.test(jsx), 'Customer UI reads no Pro verification field');
  });

  console.log(`\n--- Phase 1B C verification claims: ${pass} passing, ${fail} failing ---`);
  process.exit(fail > 0 ? 1 : 0);
})();
