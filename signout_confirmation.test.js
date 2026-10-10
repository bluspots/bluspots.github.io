/**
 * Sign-out confirmation (Customer). Mounts the SHIPPED prototype.html script
 * in jsdom with a mocked Supabase Auth client (no network) and checks:
 * - Sign Out (Profile row and Settings button) opens a confirmation and does
 *   not sign out by itself.
 * - Cancel, tapping outside, and Escape close it with the session untouched.
 * - Confirm calls the existing sign-out flow exactly once, even on rapid
 *   repeated taps, and lands on the existing signed-out screen with the local
 *   session mirror cleared.
 * - A client sign-out error still ends the local session (existing
 *   behavior of havenSignOut, unchanged) and only calls signOut once.
 */
const { JSDOM } = require('jsdom');
global.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
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

function seed() {
  Object.keys(storedData).forEach(k => delete storedData[k]);
  storedData['haven_auth_access_token'] = 'signed-in-access-token';
  storedData['haven_auth_user_id'] = CUSTOMER_ID;
  storedData['haven_auth_email'] = 'qa-customer@example.com';
  storedData['haven_auth_role'] = 'customer';
  storedData['haven_notifications'] = JSON.stringify({ __v: 1, data: [] });
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
function lastByText(re) {
  const all = screen.queryAllByText(re);
  return all.length ? all[all.length - 1] : null;
}
async function clickText(re, label) {
  for (let i = 0; i < 80 && !lastByText(re); i++) await settle(25);
  const el = lastByText(re);
  if (!el) throw new Error('No element for ' + (label || re) + '\n' + bodyText().slice(0, 400));
  await act(async () => { fireEvent.click(el); });
  await settle();
}
function dialog() { return document.querySelector('[role="dialog"][aria-labelledby="haven-signout-title"]'); }
function dialogButton(label) {
  const d = dialog();
  return d ? Array.from(d.querySelectorAll('button')).find(b => (b.textContent || '').trim() === label) : null;
}
function signedIn() { return storedData['haven_auth_access_token'] === 'signed-in-access-token'; }
async function openFromProfileRow() {
  await clickText(/^Profile$/, 'Profile tab');
  await waitFor(() => /Payment Methods/.test(bodyText()), 'profile');
  await clickText(/^Sign Out$/, 'Profile Sign Out row');
}
async function openFromSettings() {
  await clickText(/^Profile$/, 'Profile tab');
  await clickText(/^Settings$/, 'Settings row');
  await waitFor(() => /Signed in/.test(bodyText()), 'settings account card');
  const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Sign out' && !b.closest('[role="dialog"]'));
  if (!btn) throw new Error('no Settings Sign out button');
  await act(async () => { fireEvent.click(btn); });
  await settle();
}
async function step(label, fn) {
  const before = fail;
  try { await fn(); console.log((fail === before ? '✓ ' : '✗ ') + label); }
  catch (e) { fail++; console.error('✗ ' + label + '\n   ' + ((e && e.stack) || e)); }
}

(async () => {
  await step('Profile Sign Out opens a confirmation and does not sign out', async () => {
    await mount();
    await openFromProfileRow();
    assert(!!dialog(), 'confirmation dialog is shown');
    assert(/Sign out of Haven\?/.test(dialog() ? dialog().textContent : ''), 'dialog asks "Sign out of Haven?"');
    assert(dialog() && dialog().getAttribute('aria-modal') === 'true', 'dialog is aria-modal');
    assert(!!dialogButton('Sign out') && !!dialogButton('Cancel'), 'dialog offers Sign out and Cancel');
    assert(authMock.signOutCalls === 0, 'signOut not called yet');
    assert(signedIn(), 'session untouched while the dialog is open');
    assert(document.activeElement === dialogButton('Cancel'), 'Cancel has focus (safe default)');
  });

  await step('Cancel closes it and keeps the user signed in', async () => {
    await act(async () => { fireEvent.click(dialogButton('Cancel')); });
    await settle();
    assert(!dialog(), 'dialog closed');
    assert(authMock.signOutCalls === 0, 'signOut never called');
    assert(signedIn(), 'still signed in');
    assert(/Payment Methods/.test(bodyText()), 'still on Profile');
  });

  await step('Tapping outside the sheet cancels', async () => {
    await clickText(/^Sign Out$/, 'Profile Sign Out row');
    const backdrop = dialog() && dialog().parentElement;
    assert(!!backdrop, 'backdrop present');
    await act(async () => { fireEvent.click(backdrop); });
    await settle();
    assert(!dialog(), 'dialog closed by backdrop tap');
    assert(authMock.signOutCalls === 0 && signedIn(), 'still signed in, signOut not called');
  });

  await step('Escape cancels', async () => {
    await clickText(/^Sign Out$/, 'Profile Sign Out row');
    await act(async () => { fireEvent.keyDown(dialog(), { key: 'Escape' }); });
    await settle();
    assert(!dialog(), 'dialog closed by Escape');
    assert(authMock.signOutCalls === 0 && signedIn(), 'still signed in, signOut not called');
  });

  await step('Settings Sign out → Confirm signs out once and shows the signed-out screen', async () => {
    await mount();
    await openFromSettings();
    assert(!!dialog(), 'Settings button opens the same confirmation');
    assert(authMock.signOutCalls === 0, 'no sign-out before confirming');
    await act(async () => { fireEvent.click(dialogButton('Sign out')); });
    await waitFor(() => /Create an account or sign in/.test(bodyText()), 'signed-out gate');
    assert(authMock.signOutCalls === 1, 'signOut called exactly once (got ' + authMock.signOutCalls + ')');
    assert(!('haven_auth_access_token' in storedData) && !('haven_auth_email' in storedData), 'local session mirror cleared');
    assert(!dialog(), 'dialog gone after sign-out');
  });

  await step('Rapid repeated Confirm taps sign out only once', async () => {
    await mount();
    let release;
    authMock.signOutImpl = () => new Promise(r => { release = () => r({ error: null }); });
    await openFromProfileRow();
    const confirm = dialogButton('Sign out');
    await act(async () => { fireEvent.click(confirm); fireEvent.click(confirm); fireEvent.click(confirm); });
    await settle();
    assert(authMock.signOutCalls === 1, 'one signOut while the first is in flight (got ' + authMock.signOutCalls + ')');
    assert(dialogButton('Signing out…') && dialogButton('Signing out…').disabled, 'button shows Signing out… and is disabled');
    const cancel = dialogButton('Cancel');
    assert(cancel && cancel.disabled, 'Cancel disabled while signing out');
    await act(async () => { fireEvent.click(dialog().parentElement); });
    assert(!!dialog(), 'backdrop tap does not dismiss while signing out');
    await act(async () => { release(); });
    await waitFor(() => /Create an account or sign in/.test(bodyText()), 'signed-out gate');
    assert(authMock.signOutCalls === 1, 'still exactly one signOut after it resolves');
  });

  await step('Client sign-out error still ends the local session, once (existing behavior)', async () => {
    await mount();
    authMock.signOutImpl = () => { throw new Error('network down'); };
    const warn = console.warn; console.warn = () => {};
    try {
      await openFromProfileRow();
      await act(async () => { fireEvent.click(dialogButton('Sign out')); });
      await waitFor(() => /Create an account or sign in/.test(bodyText()), 'signed-out gate after client error');
    } finally { console.warn = warn; }
    assert(authMock.signOutCalls === 1, 'signOut attempted once');
    assert(!('haven_auth_access_token' in storedData), 'local session cleared');
    assert(!dialog(), 'dialog closed');
  });

  cleanup();
  console.log(`--- Sign-out confirmation: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})();
