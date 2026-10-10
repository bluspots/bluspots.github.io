/**
 * Dark-mode contrast. Mounts the SHIPPED prototype.html script in jsdom with
 * a mocked backend and the system set to dark mode, visits the main Customer
 * screens, and checks every visible text element against the WCAG AA contrast
 * minimum (4.5:1, or 3:1 for large text) using the inline colors the app
 * renders and the nearest solid background behind each element.
 *
 * Regressions this guards against (all seen before this check existed):
 * - "white" text written as W (the card surface), which turns dark in dark
 *   mode: Home headline, Sign in / Sign out buttons, card brand badges.
 * - Brand navy N used as text on dark surfaces: active tab, back arrows,
 *   "+ Add payment method", Notifications card.
 * - Fixed light-blue selected cards keeping light text in dark mode.
 * - Muted text (TM) below 4.5:1.
 *
 * Also checks that light mode is unchanged for the tokens this fix touches.
 *
 * jsdom has no layout engine, so elements on gradient backgrounds and
 * disabled controls are skipped; the headless-Chromium audit in the PR covers
 * those. Known brand-color exceptions shared with light mode are listed in
 * KNOWN_EXCEPTIONS and are product decisions, not dark-mode regressions.
 */
const { JSDOM } = require('jsdom');
global.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
Object.defineProperty(global.window, 'innerWidth', { value: 390, configurable: true });
let prefersDark = true;
global.window.matchMedia = (q) => ({ matches: /prefers-color-scheme:\s*dark/.test(q) ? prefersDark : false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
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
      signOut: async () => ({ error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
};

function seed(signedIn) {
  Object.keys(storedData).forEach(k => delete storedData[k]);
  if (signedIn) {
    storedData['haven_auth_access_token'] = 'signed-in-access-token';
    storedData['haven_auth_user_id'] = CUSTOMER_ID;
    storedData['haven_auth_email'] = 'qa-customer@example.com';
    storedData['haven_auth_role'] = 'customer';
  }
  storedData['haven_notifications'] = JSON.stringify({ __v: 1, data: [] });
}
async function delay(ms) { await new Promise(r => setTimeout(r, ms)); }
async function waitFor(check, label, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (check()) return true; await act(async () => { await delay(25); }); }
  throw new Error('Timed out: ' + label + '\n' + bodyText().slice(0, 400));
}
async function mount(signedIn) {
  cleanup();
  seed(signedIn);
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { render(React.createElement(App), container); });
  await act(async () => { await delay(60); });
  return container;
}
function lastByText(re) {
  const all = screen.queryAllByText(re);
  return all.length ? all[all.length - 1] : null;
}
async function clickText(re, label) {
  for (let i = 0; i < 80 && !lastByText(re); i++) await act(async () => { await delay(25); });
  const el = lastByText(re);
  if (!el) throw new Error('No element for ' + (label || re) + '\n' + bodyText().slice(0, 400));
  await act(async () => { fireEvent.click(el); });
  await act(async () => { await delay(40); });
}
async function step(label, fn) {
  const before = fail;
  try { await fn(); console.log((fail === before ? '✓ ' : '✗ ') + label); }
  catch (e) { fail++; console.error('✗ ' + label + '\n   ' + ((e && e.stack) || e)); }
}

// ── Contrast measurement (WCAG 2.x) ──
function parseColor(c) {
  if (!c) return null;
  c = String(c).trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = c.match(/^rgba?\(([^)]+)\)$/i);
  if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  return null;
}
function over(top, bot) { const a = top.a; return { r: top.r * a + bot.r * (1 - a), g: top.g * a + bot.g * (1 - a), b: top.b * a + bot.b * (1 - a), a: 1 }; }
function lum(c) { return [c.r, c.g, c.b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function hex(c) { return '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(); }
function bgOf(el) {
  const stack = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = n.style || {};
    const raw = (s.background || '') + ' ' + (s.backgroundImage || '');
    if (/gradient|url\(/.test(raw)) return null; // can't resolve without layout
    const c = parseColor(s.backgroundColor) || parseColor((s.background || '').trim());
    if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
  }
  let bg = { r: 16, g: 22, b: 29, a: 1 }; // fall back to the dark page BG
  for (let i = stack.length - 1; i >= 0; i--) bg = over(stack[i], bg);
  return bg;
}
function fgOf(el) {
  let op = 1, color = null;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = n.style || {};
    if (s.opacity) op *= parseFloat(s.opacity);
    if (!color && s.color) color = parseColor(s.color);
  }
  return color ? { color, op } : null;
}
function hidden(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = n.style || {};
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return true;
  }
  return false;
}
// Brand colors identical in light mode (white on amber buttons, orange
// Mastercard badge). Flagged to the founder; not dark-mode regressions.
const KNOWN_EXCEPTIONS = [
  (r) => r.bg === '#F59E0B' && r.fg === '#FFFFFF',
  (r) => r.bg === '#EA580C' && r.fg === '#FFFFFF',
];
function lowContrast() {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (['STYLE', 'SCRIPT', 'svg', 'path', 'SVG', 'PATH'].includes(el.tagName)) continue;
    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
    own = own.trim();
    if (!own || !/[A-Za-z0-9$]/.test(own)) continue;
    if (hidden(el)) continue;
    if (el.closest('button[disabled],[aria-disabled="true"]')) continue;
    const fgInfo = fgOf(el); if (!fgInfo) continue;
    const bg = bgOf(el); if (!bg) continue;
    const fg = over({ ...fgInfo.color, a: fgInfo.color.a * fgInfo.op }, bg);
    const size = parseFloat(el.style.fontSize || (el.parentElement && el.parentElement.style.fontSize) || '14');
    const weight = parseInt(el.style.fontWeight || '400', 10);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const r = { text: own.slice(0, 40), fg: hex(fg), bg: hex(bg), ratio: Math.round(ratio(fg, bg) * 100) / 100, need: large ? 3 : 4.5 };
    if (r.ratio < r.need && !KNOWN_EXCEPTIONS.some(f => f(r))) out.push(r);
  }
  return out;
}
function checkScreen(name) {
  const bad = lowContrast();
  assert(bad.length === 0, `${name}: every text element meets AA in dark mode` +
    (bad.length ? ' — failing: ' + bad.slice(0, 8).map(b => `"${b.text}" ${b.fg} on ${b.bg} (${b.ratio}:1)`).join('; ') : ''));
}
function styleOfText(re) {
  const el = lastByText(re);
  return el ? el.style : null;
}

(async () => {
  await step('Signed-out gate is readable in dark mode', async () => {
    prefersDark = true;
    await mount(false);
    await waitFor(() => /Sign in|Create an account/i.test(bodyText()), 'auth gate');
    checkScreen('Signed-out gate');
  });

  await step('Home is readable in dark mode (headline, tab bar, Urgent / Not Listed cards)', async () => {
    prefersDark = true;
    await mount(true);
    await waitFor(() => /What do you/.test(bodyText()), 'home');
    checkScreen('Home');
    const tab = lastByText(/^Home$/);
    assert(tab && tab.style.color && parseColor(tab.style.color) && hex(parseColor(tab.style.color)) !== '#1C2B3A', 'active tab label is not brand navy on the dark tab bar');
  });

  await step('Profile is readable in dark mode (name, Notifications card, Sign Out)', async () => {
    await clickText(/^Profile$/, 'Profile tab');
    await waitFor(() => /Payment Methods/.test(bodyText()), 'profile');
    checkScreen('Profile');
  });

  await step('Settings is readable in dark mode (Sign out button)', async () => {
    await clickText(/^Settings$/, 'Settings row');
    await waitFor(() => /Signed in/.test(bodyText()), 'settings');
    checkScreen('Settings');
    const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Sign out');
    assert(btn && hex(parseColor(btn.style.color)) === '#FFFFFF', 'Settings Sign out button text is white on red');
  });

  await step('Payment methods is readable in dark mode (default card, + Add payment method)', async () => {
    await clickText(/^Profile$/, 'Profile tab');
    await clickText(/^Payment Methods$/, 'Payment Methods');
    await waitFor(() => /Add payment method/.test(bodyText()), 'payment methods');
    checkScreen('Payment methods');
  });

  await step('Saved addresses is readable in dark mode (primary address card)', async () => {
    await clickText(/^Profile$/, 'Profile tab');
    await clickText(/^Saved Addresses$/, 'Saved Addresses');
    await waitFor(() => /Add address/.test(bodyText()), 'saved addresses');
    checkScreen('Saved addresses');
  });

  await step('Light mode keeps its original colors for the touched elements', async () => {
    prefersDark = false;
    await mount(true);
    await waitFor(() => /What do you/.test(bodyText()), 'home (light)');
    const tab = styleOfText(/^Home$/);
    assert(tab && hex(parseColor(tab.color)) === '#1C2B3A', 'light: active tab label stays brand navy');
    const urgent = styleOfText(/^Urgent$/);
    assert(urgent && hex(parseColor(urgent.color)) === '#C2410C', 'light: Urgent label keeps #C2410C');
    const headline = Array.from(document.querySelectorAll('div')).find(d => /^What do you\s*need done\?$/.test((d.textContent || '').trim()));
    assert(headline && hex(parseColor(headline.style.color)) === '#FFFFFF', 'light: Home headline stays white');
    await clickText(/^Profile$/, 'Profile tab');
    await waitFor(() => /Sign Out/.test(bodyText()), 'profile (light)');
    const so = styleOfText(/^Sign Out$/);
    assert(so && hex(parseColor(so.color)) === '#B42318', 'light: Sign Out row keeps #B42318');
    const styles = Array.from(document.querySelectorAll('style')).map(s => s.textContent).join('\n');
    assert(!/::placeholder/.test(styles), 'light: no placeholder override (browser default kept)');
  });

  cleanup();
  console.log(`--- Dark-mode contrast: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})();
