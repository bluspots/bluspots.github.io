/**
 * Address search + map confirmation (Customer, Mapbox Phase 1-2). Mounts the
 * SHIPPED prototype.html script in jsdom. Mapbox is answered from real
 * responses recorded for Orlando-area addresses (test_fixtures/mapbox).
 * (1) Nothing calls Mapbox at startup or when the form opens.
 * (2) Typing shows real suggestions; arrow keys + Enter pick one and fill
 *     street, city, state and ZIP; a typed unit goes to the unit field.
 * (3) A precise match shows the map with no warning; an approximate match
 *     says so. The customer must confirm before saving.
 * (4) Saving makes one permanent lookup and stores that point; suggestions
 *     are never permanent lookups.
 * (5) Editing the street clears the pin and says so; no-match and search
 *     failures say what to do; manual entry still saves (with no location).
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


const FX = JSON.parse(fs.readFileSync('test_fixtures/mapbox/orlando_geocode_v6.json', 'utf8'));
const CUSTOMER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const mapbox = [];
let mapboxDown = false;
global.fetch = async (url) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.includes('api.mapbox.com')) {
    mapbox.push(u);
    if (mapboxDown) return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
    const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || '');
    if (/\/reverse\?/.test(u)) return ok(FX.reverse.response);
    if (/permanent=true/.test(u)) {
      const f = FX.church.response.features[0];
      return ok({ type: 'FeatureCollection', features: [f] });
    }
    const hit = Object.values(FX).find(x => x.query && q && x.query.toLowerCase().startsWith(q.toLowerCase().slice(0, 12)));
    return ok(hit ? hit.response : { type: 'FeatureCollection', features: [] });
  }
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
function lastByText(re) { const all = screen.queryAllByText(re); return all.length ? all[all.length - 1] : null; }
async function clickText(re, label) {
  for (let i = 0; i < 80 && !lastByText(re); i++) await settle(25);
  const el = lastByText(re);
  if (!el) throw new Error('No element for ' + label + '\n' + bodyText().slice(0, 500));
  await act(async () => { fireEvent.click(el); });
  await settle(60);
}
function lastByText(re) { const all = screen.queryAllByText(re); return all.length ? all[all.length - 1] : null; }
async function clickText(re, label) {
  for (let i = 0; i < 80 && !lastByText(re); i++) await settle(25);
  const el = lastByText(re);
  if (!el) throw new Error('No element for ' + label + '\n' + bodyText().slice(0, 500));
  await act(async () => { fireEvent.click(el); });
  await settle(60);
}
const input = () => document.getElementById('addr-search');
const options = () => Array.from(document.querySelectorAll('[role="option"]'));
const fieldValues = () => Array.from(document.querySelectorAll('input')).map(i => i.value);
async function typeQuery(q) {
  await act(async () => { fireEvent.change(input(), { target: { value: q } }); });
  await settle(400);
  await waitFor(() => !/Searching/.test(bodyText()), 'search settles');
}
async function openForm() {
  cleanup(); seed();
  const container = document.createElement('div'); document.body.appendChild(container);
  await act(async () => { render(React.createElement(App), container); });
  await settle(80);
  await waitFor(() => /What do you/.test(bodyText()), 'signed-in home');
  await clickText(/^Profile$/, 'Profile tab');
  await clickText(/^Saved Addresses$/, 'Saved Addresses');
  const add = Array.from(document.querySelectorAll('button')).find(b => /Add (an )?address/i.test(b.textContent));
  await act(async () => { fireEvent.click(add); }); await settle(60);
  await waitFor(() => !!input(), 'address search');
}
const btn = re => Array.from(document.querySelectorAll('button')).find(b => re.test(b.textContent));
const savedList = () => JSON.parse(storedData['haven_addresses']).data;

(async () => {
  mapbox.length = 0;
  await openForm();
  // (1)
  assert(mapbox.length === 0, 'no Mapbox request at startup or when the form opens');
  // (2)
  await typeQuery('400 W Church St');
  assert(options().length >= 3 && /400 West Church Street/.test(options()[0].textContent) && /Orlando, FL 32801/.test(options()[0].textContent), 'real Orlando suggestion first');
  assert(input().getAttribute('aria-expanded') === 'true' && input().getAttribute('role') === 'combobox', 'combobox announces its open list');
  assert(/5 addresses found|\d addresses found/.test(bodyText()), 'result count is announced');
  await act(async () => { fireEvent.keyDown(input(), { key: 'ArrowDown' }); }); await settle(30);
  assert(input().getAttribute('aria-activedescendant') === 'addr-opt-0' && options()[0].getAttribute('aria-selected') === 'true', 'ArrowDown highlights the first suggestion');
  await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); }); await settle(60);
  let v = fieldValues();
  assert(v.includes('400 West Church Street') && v.includes('Orlando') && v.includes('32801') && document.querySelector('select[aria-label="State"]').value === 'FL', 'Enter fills street, city, state and ZIP');
  // (3)
  const img = document.querySelector('img[alt^="Map showing"]');
  assert(img && /api\.mapbox\.com\/styles\/v1\/mapbox\/streets-v12\/static\/pin-l\+F59E0B\(-81\.383973,28\.539714\)/.test(img.src), 'map image is centred on the picked address');
  assert(!/Approximate location/.test(bodyText()), 'a rooftop match has no approximate warning');
  await act(async () => { fireEvent.click(btn(/^Save changes$/)); }); await settle(60);
  assert(/Confirm the location on the map/.test(bodyText()), 'saving asks for confirmation first');
  await act(async () => { fireEvent.click(btn(/^Yes, this is the place$/)); }); await settle(40);
  assert(/Location confirmed on the map/.test(bodyText()), 'confirmation is shown');
  // (4)
  const before = mapbox.length;
  await act(async () => { fireEvent.click(btn(/^Save changes$/)); }); await settle(200);
  const perm = mapbox.slice(before).filter(u => /permanent=true/.test(u));
  assert(perm.length === 1, 'saving makes exactly one permanent lookup');
  assert(!mapbox.some(u => /autocomplete=true/.test(u) && /permanent=true/.test(u)), 'suggestions are never permanent lookups');
  const saved = savedList().find(a => a.street === '400 West Church Street');
  assert(saved && saved.geo && saved.geo.lat === 28.539714 && saved.geo.lng === -81.383973 && saved.geo.accuracy === 'rooftop' && saved.geo.source === 'mapbox', 'the saved address keeps the confirmed point');

  // approximate match + unit + edit clears
  await openForm();
  await typeQuery('400 W Church St');
  const deland = options().findIndex(o => /Deland/.test(o.textContent));
  await act(async () => { fireEvent.click(options()[deland]); }); await settle(60);
  assert(/Approximate location: Mapbox could only place this near the street/.test(bodyText()), 'an interpolated match is called approximate');
  await typeQuery('2200 S Orange Ave Apt 3');
  await act(async () => { fireEvent.click(options()[0]); }); await settle(60);
  v = fieldValues();
  assert(v.includes('2200 South Orange Avenue') && v.includes('Apt 3'), 'the unit typed in search goes to the unit field');
  const street = Array.from(document.querySelectorAll('input')).find(i => i.value === '2200 South Orange Avenue');
  await act(async () => { fireEvent.change(street, { target: { value: '2202 South Orange Avenue' } }); }); await settle(40);
  assert(!document.querySelector('img[alt^="Map showing"]') && /no longer confirmed on the map/.test(bodyText()), 'editing the street clears the pin and says so');
  // (5) no match, failure, manual save
  await typeQuery('zzqx 99999 nowhere lane');
  assert(/No matching addresses/.test(bodyText()) && options().length === 0, 'no-match says so');
  mapboxDown = true;
  await typeQuery('400 W Church St');
  assert(/Address search isn't reachable right now/.test(bodyText()), 'a failed search says so');
  mapboxDown = false;
  await act(async () => { fireEvent.click(btn(/^Save changes$/)); }); await settle(100);
  const manual = savedList().find(a => a.street === '2202 South Orange Avenue');
  assert(manual && manual.geo === null, 'a manually entered address still saves, with no location');
  assert(!/sample|123 Market|500 Folsom/i.test(options().map(o => o.textContent).join(' ')), 'no sample suggestions');
  cleanup();
  console.log(`--- Address search: ${pass} passing, ${fail} failing ---`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
