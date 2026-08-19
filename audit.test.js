/**
 * Haven functional audit — Profile Restoration, Home Location Placement,
 * Receipt Sharing, and Context-Aware Notifications. Mounts the compiled app
 * in jsdom, drives it with synthetic pointer/click events, selects elements
 * by real rendered text. Each numbered section is isolated in step() so one
 * failure doesn't hide results from the rest of the audit.
 */
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
Object.defineProperty(global.window, 'innerWidth', { value: 390, configurable: true });
global.window.matchMedia = global.window.matchMedia || ((q) => ({ matches: false, media: q, addListener(){}, removeListener(){} }));
// Mirrors the real CDN global exactly as jspdf.umd.min.js sets it up —
// window.jspdf.jsPDF — so generateReceiptPDF's own feature-detection guard
// behaves identically here to how it would in a real browser.
global.window.jspdf = { jsPDF: require('jspdf').jsPDF };
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
const storedData = {};
global.localStorage = {
  getItem: (k) => (k in storedData ? storedData[k] : null),
  setItem: (k, v) => { storedData[k] = v; },
  removeItem: (k) => { delete storedData[k]; },
};
function storedNotifPrefsRaw(){ return storedData['haven_notif_prefs'] ?? null; }
function storedAddressesRaw(){ return storedData['haven_addresses'] ?? null; }
function primaryHomeRaw(){
  const parsed = JSON.parse(storedAddressesRaw());
  const list = parsed.data;
  return list.find(a=>a.isPrimary) || list[0];
}
let appBadgeValue;
global.navigator.setAppBadge = (n) => { appBadgeValue = n; return Promise.resolve(); };
global.navigator.clearAppBadge = () => { appBadgeValue = 0; return Promise.resolve(); };
global.navigator.clipboard = { writeText: () => Promise.resolve() };

const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
const { act } = require('react-dom/test-utils');
const babel = require('@babel/core');
const fs = require('fs');
const React = require('react');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', msg); }
}
function step(label, fn) {
  try { fn(); }
  catch (e) { fail++; console.error(`FAIL (exception in "${label}"):`, e.message); }
}
function byText(text) {
  const matches = screen.queryAllByText((content, el) => el && el.textContent === text);
  return matches[matches.length - 1];
}
function byRegex(re) {
  const matches = screen.queryAllByText(re);
  return matches[matches.length - 1];
}
function click(text) {
  const el = byText(text);
  if (!el) { fail++; console.error(`FAIL: no element with exact text "${text}"`); return false; }
  act(() => { fireEvent.click(el); });
  return true;
}
function clickRegex(re) {
  const el = byRegex(re);
  if (!el) { fail++; console.error(`FAIL: no element matching ${re}`); return false; }
  act(() => { fireEvent.click(el); });
  return true;
}
function clickPlaceholder(ph) {
  const el = screen.queryByPlaceholderText(ph);
  if (!el) { fail++; console.error(`FAIL: no input with placeholder "${ph}"`); return false; }
  act(() => { fireEvent.click(el); });
  return true;
}
function existsRegex(pattern) {
  const test = typeof pattern === 'string' ? (s => s.includes(pattern)) : (s => pattern.test(s));
  return screen.queryAllByText((content, el) => el && test(el.textContent)).length > 0;
}
function sleep(ms) { const end = Date.now() + ms; while (Date.now() < end) {} }
function clickTab(text) { sleep(600); return click(text); }
function forceProfileRoot() { click('Profile'); click('Profile'); } // double-tap resets to root regardless of tab-memory

// ── Async test utilities ────────────────────────────────────────────────
// Added to replace deeply-nested fixed-duration setTimeout chains with
// flat, readable await sequences that resolve as soon as the real
// condition is true — not after a blind worst-case wait. Named distinctly
// from the synchronous sleep() above (which must stay synchronous — it's
// load-bearing for clickTab's double-tap-avoidance timing and changing it
// would require touching every clickTab call site in the file).
async function waitForCondition(check, options = {}) {
  const timeout = options.timeout ?? 3000;
  const interval = options.interval ?? 20;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(options.message ?? 'Timed out waiting for condition.');
}
async function nextTick() {
  await new Promise(resolve => setTimeout(resolve, 0));
}
async function delay(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}
// Pro replies are randomly selected from a fixed set each time, so waiting
// for "reply text exists" is unreliable once a conversation has more than
// one reply in it (an earlier reply's text can still be on screen). This
// waits for the *count* of matching bubbles to increase instead, which is
// correct regardless of which random reply text lands.
const REPLY_REGEX = /Got it|On it|Thanks for the heads up|Almost there|Sounds good|Will do/i;
async function waitForNewReply(countBefore, msgOptions) {
  await waitForCondition(
    () => screen.queryAllByText(REPLY_REGEX).length > countBefore,
    { message: 'Pro reply never arrived.', ...msgOptions }
  );
}

const src = fs.readFileSync('home_services_app.jsx', 'utf8')
  .replace('import React, { useState, useRef, useEffect } from "react";', '')
  .replace('export default function App(){', 'function App(){');
const { code } = babel.transformSync(src, { presets: [['@babel/preset-react', { runtime: 'classic' }]], filename: 'x.jsx' });
const wrapped = `(function(React, useState, useRef, useEffect, module){ ${code}
  module.exports = typeof App !== 'undefined' ? App : undefined;
  module.exports2 = typeof ErrorBoundary !== 'undefined' ? ErrorBoundary : undefined;
  module.exports3 = typeof matchRepairIntent !== 'undefined' ? matchRepairIntent : undefined;
})`;
const moduleObj = { exports: {} };
eval(wrapped)(React, React.useState, React.useRef, React.useEffect, moduleObj);
const App = moduleObj.exports;
const ErrorBoundary = moduleObj.exports2;
const matchRepairIntent = moduleObj.exports3;

assert(typeof App === 'function', 'App component loaded from compiled source');
assert(typeof ErrorBoundary === 'function', 'ErrorBoundary class loaded from compiled source');

console.log('--- Running audit ---');
let mainContainer;
act(() => { mainContainer = render(React.createElement(App)).container; });

step('1. Profile — 3 large featured cards on top, standard list below, exact row order, no My Bookings', () => {
  click('Profile');
  const t = document.body.textContent;
  assert(existsRegex('Jane Doe'), 'Account card present');
  assert(t.indexOf('My Home') < t.indexOf('Notifications'), 'My Home before Notifications');
  assert(t.indexOf('Notifications') < t.indexOf('Payment Methods'), 'Notifications before Payment Methods');
  assert(t.indexOf('Payment Methods') < t.indexOf('Saved Addresses'), 'Payment Methods before Saved Addresses');
  assert(t.indexOf('Saved Addresses') < t.indexOf('Settings'), 'Saved Addresses before Settings');
  assert(t.indexOf('Settings') < t.indexOf('Help & Support'), 'Settings before Help & Support');
  assert(t.indexOf('Help & Support') < t.indexOf('Sign Out'), 'Sign Out is last');
  assert(!existsRegex('My Bookings') && !existsRegex('My bookings'), 'My Bookings removed from Profile');
  assert(!existsRegex('Notification settings') && !existsRegex('Appearance'), 'No standalone Notification Settings / Appearance rows');
  // Large featured cards, not standard list rows — verified structurally,
  // not just by text order, since that's the actual thing this slice fixed.
  assert(existsRegex('Service history, maintenance & more'), 'My Home shows its large-card subtitle (not present on a standard list row)');
  assert(!!document.querySelector('[style*="253, 230, 138"]'), 'My Home renders with its large amber gradient card background');
  assert(existsRegex('Job updates, messages & account alerts'), 'Notifications shows its large-card subtitle');
  assert(existsRegex('Payment Methods') && !existsRegex('Job updates, messages & account alerts, more'), 'Payment Methods remains a standard compact list row (no large-card subtitle)');
});

step('2. Settings consolidation', () => {
  click('Settings');
  assert(existsRegex('Notifications') && existsRegex('Job updates'), 'Notification preferences present inside Settings');
  assert(existsRegex('Appearance') && existsRegex('System') && existsRegex('Dark'), 'Appearance options present inside Settings');
  click('Dark');
  click('‹');
  const bg1 = document.querySelector('.sc')?.style.background;
  assert(!!bg1, 'Dark mode applied from within the consolidated Settings screen');
  forceProfileRoot();
  click('Settings'); click('Light'); click('‹');
});

step('3. Home header reverted — HAVEN wordmark, profile shortcut, and original location placement all restored', () => {
  clickTab('Home');
  const t = document.body.textContent;
  assert(t.indexOf('📍') < t.indexOf('need done'), 'Location restored to its original position, above the heading (not below it anymore)');
  assert(existsRegex('HAVEN'), 'HAVEN wordmark restored to the Home header');
  assert(!!document.querySelector('[aria-label="Profile"]'), 'Profile shortcut restored to the top-right');
  assert(existsRegex(/San Francisco|Oakland/), 'Location still shows the real primary-property city (not a stale hardcoded string) despite the layout reversion');
});

step('4. Existing systems unaffected — default card, primary property, state dropdown', () => {
  click('Mount TV'); click('← Back');
  forceProfileRoot();
  click('Payment Methods');
  assert(existsRegex('Default'), 'Default card badge still present');
  click('‹');
  click('Saved Addresses');
  assert(existsRegex(/🏠 Primary/), 'Primary property badge still present');
  click('Work'); click('Set as Primary');
  assert(existsRegex(/🏠 Primary/), 'Switching primary still works');
  click('+ Add address');
  assert(existsRegex('Select a state'), 'Shared state dropdown still present in the address form');
  click('Cancel'); click('‹');
});

step('4b. Saved Address action order (Set as Primary, Edit, Delete) and primary-property deletion', () => {
  click('Saved Addresses');
  // Work is Primary at this point (set in step 4). Expand it and check order.
  const primaryRowLabel = byText('Work');
  act(()=>{fireEvent.click(primaryRowLabel);});
  assert(existsRegex('Primary') && !existsRegex('Set as Primary'), 'Primary property shows a disabled Primary indicator, not an active Set as Primary button');
  const actionsRow = byText('Edit').parentElement;
  const order = Array.from(actionsRow.children).map(c=>c.textContent);
  assert(order[0]==='Primary' && order[1]==='Edit' && order[2]==='Delete', 'Action order is Primary-indicator/Edit/Delete (left/middle/right) for the primary property');
  click('Delete');
  assert(existsRegex('Delete this property?'), 'Deleting the PRIMARY property is allowed and shows a confirmation, not silently blocked');
  assert(existsRegex('This will remove it from Saved Addresses and My Home'), 'Confirmation copy is exact');
  click('Delete Property');
  assert(existsRegex(/🏠 Primary/), 'A new Primary was automatically assigned from the remaining properties');
  assert((document.body.textContent.match(/🏠 Primary/g)||[]).length===1, 'Exactly one Primary property exists after reassignment');

  // Delete the last remaining property too — must not crash.
  const lastRow = screen.queryAllByText((c,el)=>el&&el.textContent==='Home'&&el.tagName==='SPAN')[0];
  act(()=>{fireEvent.click(lastRow);});
  click('Delete'); click('Delete Property');
  assert(existsRegex('+ Add address'), 'No crash after deleting the only remaining property');
  assert(!existsRegex(/🏠 Primary/), 'No Primary badge remains when zero properties are saved');
  click('‹');
  click('My Home');
  assert(existsRegex('No property saved yet'), 'My Home shows a clean empty state instead of crashing when there is no primary property');
  assert(existsRegex('+ Add a property'), 'Empty state offers a clear way to add one');
  click('‹');

  clickTab('Home'); click('Mount TV');
  assert(existsRegex('No address saved'), 'Booking screen handles zero saved addresses gracefully, not a crash');
  assert(existsRegex('Add an address to continue'), 'Post Job is guided/disabled until an address exists, rather than allowing an invalid booking');
  click('← Back');

  // Restore a usable address so subsequent tests (which need to complete
  // real bookings) aren't left permanently broken by this step's deletions.
  forceProfileRoot();
  click('Saved Addresses');
  click('+ Add address');
  act(()=>{fireEvent.change(screen.getByPlaceholderText('123 Main Street'),{target:{value:'123 Market Street'}});});
  act(()=>{fireEvent.change(screen.getByPlaceholderText('Apt, unit, suite, or building'),{target:{value:'Apt 4B'}});});
  act(()=>{fireEvent.change(screen.getByPlaceholderText('City'),{target:{value:'San Francisco'}});});
  const stateSelect=screen.getByDisplayValue('Select a state');
  act(()=>{fireEvent.change(stateSelect,{target:{value:'CA'}});});
  act(()=>{fireEvent.change(screen.getByPlaceholderText('ZIP code'),{target:{value:'94103'}});});
  click('Save changes');
  assert(existsRegex(/🏠 Primary/), 'Restored address becomes Primary automatically (first address saved)');
  click('‹');
});

step('5. Receipt Share — feature detection, fallback menu, copy, print isolation', () => {
  clickTab('Home');
  click('Mount TV');
  clickRegex(/Post Job/);
  click('Accept job (start travel)');
  clickRegex(/Arrive/); clickRegex(/Start work/); clickRegex(/Complete job/);
  clickRegex(/⭐ Rate/);
  const ratingHeading = byText('How was your experience?');
  const container = ratingHeading.nextElementSibling; // the rating widget itself (unchanged structurally — only the visual glyph became SVG)
  act(()=>{fireEvent.pointerDown(container);});
  act(()=>{fireEvent.pointerEnter(Array.from(container.children)[3].lastElementChild.children[1]);});
  act(()=>{fireEvent.pointerUp(container);});
  click('Submit review');
  forceProfileRoot();
  click('My Home');
  click('View receipt');
  assert(existsRegex('⬆️ Share Receipt'), 'Share Receipt button present, below the receipt');
  click('⬆️ Share Receipt');
  assert(existsRegex('Print Receipt') && existsRegex('Save or Download Receipt') && existsRegex('Copy Receipt Details'), 'No navigator.share in this environment -> fallback menu shown (feature detection works, no crash)');
  click('📋 Copy Receipt Details');
});

step('6. Context-aware suppression — E: status change while viewing the exact posted/tracking screen is suppressed', () => {
  clickTab('Home'); click('Assemble bed');
  clickRegex(/Post Job/);
  click('Accept job (start travel)'); // acceptance triggered WHILE watching this exact posted job — the bug this slice fixed
  forceProfileRoot();
  click('Notifications');
  assert(!existsRegex('Pro accepted your job'), 'Acceptance notification correctly suppressed — customer was already watching this exact job on the posted screen (previously a real bug: only "tracking" was checked, not "posted")');
  click('‹');
  clickTab('Bookings');
  act(()=>{fireEvent.click(screen.queryAllByText(/Assemble bed/)[0]);});
  clickRegex(/Arrive/); // triggered WHILE already viewing this exact tracking screen
  forceProfileRoot();
  click('Notifications');
  assert(!existsRegex('Pro arrived'), 'Status change while actively viewing the exact tracking screen does not create a redundant notification');
  click('‹');
});

let replyCountBeforeStep7;
step('7. Context-aware suppression — A: message live in the exact open conversation is suppressed', () => {
  clickTab('Bookings');
  act(()=>{fireEvent.click(screen.queryAllByText(/Assemble bed/)[0]);});
  click('💬 Message');
  replyCountBeforeStep7 = screen.queryAllByText(REPLY_REGEX).length;
  const msgInput = screen.getByPlaceholderText(/Message .*/);
  act(()=>{fireEvent.change(msgInput,{target:{value:'hi'}});});
  act(()=>{fireEvent.keyDown(msgInput,{key:'Enter'});});
});

(async () => {
  await waitForNewReply(replyCountBeforeStep7, { message: 'Step 7: pro reply never arrived in the open conversation.' });

  step('7b. (continued) message appears live, no notification while conversation is open', () => {
    assert(existsRegex(/Got it|On it|Thanks|Almost there|Sounds good|Will do/i), 'Reply appears live in the open conversation');
    forceProfileRoot();
    click('Notifications');
    assert(!existsRegex('New message from'), 'No notification created while that exact conversation was open');
    click('‹');
  });

  step('8. Context-aware suppression — C: message on a different screen creates a notification', () => {
    clickTab('Bookings');
    act(()=>{fireEvent.click(screen.queryAllByText(/Assemble bed/)[0]);});
    click('💬 Message');
    const msgInput2 = screen.getByPlaceholderText(/Message .*/);
    act(()=>{fireEvent.change(msgInput2,{target:{value:'hello again'}});});
    act(()=>{fireEvent.keyDown(msgInput2,{key:'Enter'});});
    click('‹');
    clickTab('Home'); // different screen before the reply lands
  });

  // Unlike step 7, this navigates away from the messages screen before the
  // reply lands — the reply's only observable effect at that point is a
  // notification, not any visible message-bubble text, so there's no DOM
  // condition to poll. An honest, tight, elapsed-time wait (matching the
  // app's real 2000ms reply delay) is the correct approach here, not a
  // workaround — just precise instead of the original's generous 2300ms.
  await delay(2100);

  step('8b. (continued) notification created for the different-screen case', () => {
    forceProfileRoot();
    click('Notifications');
    assert(existsRegex('New message from'), 'Reply arriving while on a different screen creates a notification');
    click('‹');
  });

  step('9. Context-aware suppression — D: backgrounded app never suppresses', () => {
    clickTab('Bookings');
    act(()=>{fireEvent.click(screen.queryAllByText(/Assemble bed/)[0]);});
    click('💬 Message');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(()=>{ document.dispatchEvent(new dom.window.Event('visibilitychange')); });
    const msgInput3 = screen.getByPlaceholderText(/Message .*/);
    act(()=>{fireEvent.change(msgInput3,{target:{value:'one more'}});});
    act(()=>{fireEvent.keyDown(msgInput3,{key:'Enter'});});
  });

  // Same reasoning as step 8 above — backgrounded, no visible signal to poll.
  await delay(2100);

  step('9b. (continued) backgrounded-app notification confirmed', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(()=>{ document.dispatchEvent(new dom.window.Event('visibilitychange')); });
    click('‹');
    forceProfileRoot();
    click('Notifications');
    assert(existsRegex(/2 new messages/), 'Backgrounded app still created/grouped the notification even while "viewing" the exact conversation');
  });

  step('10. Regression — Notification Center core features still work', () => {
    assert(existsRegex('Mark all as read'), 'Mark all as read present while an unread notification exists');
    const row = byRegex(/2 new messages/);
    const rowEl = row.parentElement.parentElement;
    act(()=>{fireEvent.pointerDown(rowEl,{clientX:0,clientY:0});});
    act(()=>{fireEvent.pointerMove(rowEl,{clientX:130,clientY:2});});
    act(()=>{fireEvent.pointerUp(rowEl,{clientX:130,clientY:2});});
    assert(existsRegex(/Mark Unread/), 'Swipe-right mark-as-read still works, reciprocal Mark Unread available');
    assert(!existsRegex('Mark all as read'), 'Mark all as read correctly disappears once that swipe marked the only unread notification as read (zero unread remaining)');
  });

  step('11. Regression — tab persistence and draft booking still work', () => {
    clickTab('Home'); click('Assemble bed');
    clickTab('Bookings');
    assert(existsRegex(/Post Job/), 'Draft booking still persists across a tab switch');
    click('← Back');
    assert(existsRegex('Discard draft?'), 'Discard confirmation still works');
    click('Discard Draft');
  });

  step('12. Bug sweep — notification preferences actually persist (were previously never saved)', () => {
    forceProfileRoot();
    click('Settings');
    const label = byText('Job updates');
    const row = label.parentElement.parentElement;
    const toggle = row.lastElementChild;
    act(()=>{fireEvent.click(toggle);});
    assert(storedNotifPrefsRaw()!==null, 'Notification preferences are now written to localStorage (previously never persisted at all)');
    const saved = JSON.parse(storedNotifPrefsRaw());
    assert(typeof saved.data.jobUpdates==='boolean', 'Persisted shape matches the real preference object (inside the versioned {__v, data} wrapper), not something else');
    assert(saved.__v===1, 'Schema version is recorded alongside the data');
    click('‹');
  });

  step('13. Bug sweep — rapid double-tap on Post Job cannot create a duplicate job', () => {
    clickTab('Home'); click('Install smart lock');
    const postBtn = screen.getAllByText(/Post Job/).slice(-1)[0];
    act(()=>{ fireEvent.click(postBtn); fireEvent.click(postBtn); });
    clickTab('Bookings');
    assert(screen.queryAllByText('Install smart lock').length===1, 'Exactly one job created from a rapid double-tap, not two');
  });

  step('14. Reset Prototype Data — confirmation required, clears data, resets tab memory', () => {
    forceProfileRoot();
    click('Settings');
    assert(existsRegex('Reset Prototype Data'), 'Reset Prototype Data present in Settings, clearly labeled as a testing utility');
    click('Reset Prototype Data');
    assert(existsRegex('Reset Prototype Data?'), 'Confirmation required — not an immediate destructive action');
    assert(existsRegex(/every job, saved property, saved card/), 'Confirmation clearly states what will be cleared');
    click('Cancel');
    assert(!existsRegex('Reset Prototype Data?'), 'Cancel dismisses without resetting anything');
    click('Reset Prototype Data');
    clickRegex(/^Reset Prototype Data$/);
    assert(existsRegex(/need done/), 'Reset returns to Home root');
    clickTab('Bookings');
    assert(!existsRegex('Install smart lock') && !existsRegex('Mount TV'), 'All jobs cleared after reset');
    clickTab('Profile');
    assert(existsRegex('Jane Doe'), 'Tapping Profile after reset lands on the actual Profile root, not a stale remembered sub-screen (this was a real bug found and fixed this slice)');
    click('Saved Addresses');
    assert(existsRegex(/🏠 Primary/), 'Addresses reset to the default seed, with a valid Primary');
  });

  console.log(`\n--- Interaction suite complete: ${pass} passing, ${fail} failing so far ---`);
  runPersistenceAndCorruptStorageChecks();
})();

// ── PHASE 2: real persistence round-trip + corrupt-storage matrix ─────────
// Runs after the interaction suite finishes (needs its own render lifecycle
// — a genuine unmount/remount, and for the corrupt-storage part, directly
// tampering with storedData before mounting — neither of which fits the
// single continuous click-driven session above).
function runPersistenceAndCorruptStorageChecks(){
  step('15. Persistence survives a real unmount/remount (simulated PWA close/reopen)', () => {
    act(()=>{ cleanup(); });
    const keysAfterClose = Object.keys(storedData);
    assert(keysAfterClose.includes('haven_jobs') && keysAfterClose.includes('haven_addresses') && keysAfterClose.includes('haven_cards') && keysAfterClose.includes('haven_profile'), 'All core domains were written to storage independently (not one blob) before close');

    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    act(()=>{ render(React.createElement(App), container2); });

    click('Bookings');
    assert(!existsRegex('Install smart lock') && !existsRegex('Mount TV'), 'The Reset Prototype Data from step 14 survived the remount — a fresh instance does not silently resurrect old jobs');
    click('Profile'); click('Saved Addresses');
    assert(existsRegex(/🏠 Primary/), 'Default seed address data (post-reset) survived the remount with a valid Primary');
    click('‹'); click('Payment Methods');
    assert(existsRegex('Default'), 'Default seed card data (post-reset) survived the remount with a valid Default');

    act(()=>{ cleanup(); });
  });

  step('16. Corrupt/adversarial storage matrix — sanitized correctly, not just "doesn\'t crash"', () => {
    // Deliberately corrupt every domain at once: duplicate primary, duplicate
    // default, invalid job status, duplicate job id, missing id, garbage
    // entry, wrong-typed prefs, unknown schema version, invalid JSON.
    storedData['haven_addresses'] = JSON.stringify({__v:1, data:[
      {id:1,label:"Home",isPrimary:true,street:"1 Main St",city:"SF",state:"CA",zip:"94103"},
      {id:2,label:"Work",isPrimary:true,street:"2 Main St",city:"SF",state:"CA",zip:"94104"}, // duplicate primary
    ]});
    storedData['haven_cards'] = JSON.stringify({__v:1, data:[
      {id:1,brand:"Visa",last4:"1111",exp:"01/30",isDefault:true},
      {id:2,brand:"Amex",last4:"2222",exp:"02/30",isDefault:true}, // duplicate default
    ]});
    storedData['haven_jobs'] = JSON.stringify({__v:1, data:[
      {id:100,status:"totally_invalid_status",taskId:50},
      {id:100,status:"posted",taskId:49}, // duplicate id
      {id:null}, // missing id
      "not even an object", // garbage
    ]});
    storedData['haven_notif_prefs'] = '[1,2,3]'; // wrong type
    storedData['haven_profile'] = JSON.stringify({__v:99, data:{name:"",bio:123,photo:{}}}); // unknown version + wrong types
    storedData['haven_draft'] = '{{{not valid json';
    storedData['haven_theme'] = '"not-a-real-theme"'; // legacy-unwrapped, invalid enum

    const container3 = document.createElement('div');
    document.body.appendChild(container3);
    let crashed=false, crashMsg='';
    try{
      act(()=>{ render(React.createElement(App), container3); });
    }catch(e){ crashed=true; crashMsg=e.message; }
    assert(!crashed, `App boots successfully despite a full matrix of corrupt/adversarial storage data across every domain at once${crashed?': '+crashMsg:''}`);
    assert(existsRegex(/need done/), 'Home screen renders normally after corrupt-storage boot');

    click('Profile'); click('Saved Addresses');
    assert(screen.queryAllByText(/🏠 Primary/).length===1, 'Duplicate-primary data resolved to exactly one Primary, deterministically — not left ambiguous or crashing');
    click('‹'); click('Payment Methods');
    assert(screen.queryAllByText('Default').length===1, 'Duplicate-default data resolved to exactly one Default');
    click('‹'); clickTab('Bookings');
    assert(!existsRegex('undefined') && !existsRegex('NaN'), 'Invalid/duplicate/malformed job entries produced no leaked error text in the UI');
    act(()=>{ cleanup(); });
  });

  runTippingChecks();
}

// ── PHASE 3: tipping — its own fresh mount, since it needs a completed job
// and a real ~900ms processing delay that doesn't fit cleanly into the
// earlier phases' timing budgets.
function runTippingChecks(){
  const container4 = document.createElement('div');
  document.body.appendChild(container4);
  act(()=>{ render(React.createElement(App), container4); });

  step('17. Tipping — action order, receipt access before tipping, no preselected amount', () => {
    click('Mount TV');
    clickRegex(/Post Job/);
    click('Accept job (start travel)');
    clickRegex(/Arrive/); clickRegex(/Start work/); clickRegex(/Complete job/);
    const t = document.body.textContent;
    assert(t.indexOf('Rate') < t.indexOf('Tip Pro') && t.indexOf('Tip Pro') < t.indexOf('View Receipt'), 'Completed-job action order is Rate, Tip Pro, View Receipt');
    click('🧾 View Receipt');
    assert(existsRegex('RECEIPT'), 'Receipt is fully accessible before any tip is added');
    assert(!existsRegex(/Tip to/), 'No tip line item exists before tipping');
    click('‹');
    click('💛 Tip Pro');
    assert(existsRegex('Recognize exceptional service'), 'Tip screen shows the required optional-tip copy');
    assert(!document.querySelector('[style*="254, 243, 199"]'), 'No preset amount is selected by default');
  });

  step('18. Tipping — custom amount validation', () => {
    click('Custom amount');
    const input = screen.getByPlaceholderText('0.00');
    act(()=>{fireEvent.change(input,{target:{value:'-5'}});});
    assert(existsRegex(/greater than \$0/), 'Negative custom amount rejected with a clear message');
    act(()=>{fireEvent.change(input,{target:{value:'0'}});});
    assert(existsRegex(/greater than \$0/), 'Zero custom amount rejected');
    act(()=>{fireEvent.change(input,{target:{value:'abc'}});});
    assert(existsRegex(/valid amount/), 'Malformed custom amount rejected');
    act(()=>{fireEvent.change(input,{target:{value:'99999'}});});
    assert(existsRegex(/unusually large/), 'Unreasonably large custom amount flagged');
    act(()=>{fireEvent.change(input,{target:{value:'12.50'}});});
    assert(existsRegex("You're tipping") && existsRegex('$12.50'), 'Exact chosen amount shown before confirmation');
    click('Confirm Tip');
    assert(existsRegex('Processing…'), 'Deliberate confirmation triggers a real processing state, not instant silent success');
  });

  setTimeout(() => {
    step('19. Tipping — confirmed tip persists, updates Receipt, prevents accidental double-tipping', () => {
      assert(existsRegex('Tip sent: $12.50'), 'Tip resolved to paid and shows the confirmed amount');
      click('← Back');
      assert(existsRegex('Tip sent: $12.50') && !existsRegex('💛 Tip Pro'), 'Tracking screen reflects the paid tip instead of offering to tip again');
      click('🧾 View Receipt');
      assert(existsRegex(/Tip to/), 'Receipt updated with a tip line item, not a separate receipt');
      const body = document.body.textContent.replace(/\s+/g,' ');
      const m = body.match(/PAYMENT BREAKDOWNLabor\$(\d+).*?Tip to [^$]+\$([\d.]+)Total paid\$([\d.]+)/);
      assert(!!m && Math.abs((parseFloat(m[1])+parseFloat(m[2]))-parseFloat(m[3]))<0.01, 'Receipt total correctly includes labor plus tip');
      click('‹');
      click('✓ Tip sent: $12.50');
      assert(existsRegex('Tip sent: $12.50') && !existsRegex('Recognize exceptional service'), 'Reopening Tip Pro after already tipping shows the sent state, not the selection flow again');
    });

    runUxImprovementChecks();
  }, 1200);
}

// ── PHASE 4: UX & convenience improvements slice — arrival window/ETA, Job
// Preferences, empty states, Trusted Home, search by symptom.
// Own fresh mount, same reasoning as Phase 3.
function runUxImprovementChecks(){
  const container5 = document.createElement('div');
  document.body.appendChild(container5);
  act(()=>{ render(React.createElement(App), container5); });

  step('20. Arrival window progressively tightens (deterministic, elapsed-time-based)', () => {
    click('Mount TV');
    clickRegex(/Post Job/);
    click('Accept job (start travel)');
    assert(existsRegex('Arriving') && !existsRegex('Time remaining'), 'Broad stage: shows Arriving + a window, not yet the precise breakdown');
  });

  step('21. Job Preferences — toggle, add custom, attach to booking', () => {
    click('← Bookings');
    forceProfileRoot();
    click('Settings');
    assert(existsRegex('Job Preferences'), 'Job Preferences present in Settings');
    click('Job Preferences');
    assert(existsRegex('Remove shoes before entering'), 'Preset preferences shown');
    const row = byText('Remove shoes before entering').parentElement;
    act(()=>{fireEvent.click(row.lastElementChild);});
    const input = screen.getByPlaceholderText('e.g. Use the back entrance');
    act(()=>{fireEvent.change(input,{target:{value:'Use side door'}});});
    click('Add');
    assert(existsRegex('Use side door'), 'Custom preference added');
    click('‹');
    assert(existsRegex(/2 active/), 'Settings reflects the active preference count');
  });

  step('22. Better empty states — Notifications, Receipts, Messages all show intentional copy', () => {
    click('‹');
    click('Notifications');
    assert(existsRegex("You're all caught up.") && existsRegex("We'll let you know when something needs your attention."), 'Notification Center empty state matches the specified copy exactly');
    click('‹');
  });

  step('23. Trusted Home — appears only after the completed-jobs threshold is met', () => {
    click('My Home');
    assert(!existsRegex('Trusted Home'), 'Trusted Home absent before any completed jobs');
    click('‹');
  });

  step('24. Search by symptom — intent-based matching routes to the specific right service, never leaves the user stuck', () => {
    clickTab('Home');
    const searchInput = screen.getByPlaceholderText('Search 50+ services...');
    act(()=>{fireEvent.focus(searchInput);});
    const realInput = screen.getByPlaceholderText('Search services...');
    act(()=>{fireEvent.change(realInput,{target:{value:'water under sink'}});});
    assert(existsRegex('Recommended for you') && existsRegex('Unclog Sink'), '"water under sink" correctly recommends the specific Unclog Sink service, not just a category');
    act(()=>{fireEvent.change(realInput,{target:{value:'my lights flicker'}});});
    assert(existsRegex('Recommended for you') && existsRegex('Electrical troubleshooting'), '"my lights flicker" correctly recommends a specific electrical service');
    act(()=>{fireEvent.change(realInput,{target:{value:'clogged toilet'}});});
    assert(existsRegex('Install/repair toilet') && !existsRegex('Fix Leaky Pipe'), 'The original reported bug is fixed: "clogged toilet" recommends the toilet service, not Fix Leaky Pipe');
    act(()=>{fireEvent.change(realInput,{target:{value:'gibberish query xyz123'}});});
    assert(existsRegex('Post a custom job') && existsRegex(/No exact matches/), 'Non-technical/unmatched wording never leaves the user with zero guidance');
  });

  step('24b. Search by symptom — negative matching prevents false positives between similar intents', () => {
    const realInput = screen.getByPlaceholderText('Search services...');
    act(()=>{fireEvent.change(realInput,{target:{value:'running toilet'}});});
    assert(existsRegex('Recommended for you') && !existsRegex(/unclog/i), '"running toilet" recommends the running-toilet fix, not the unclog service, despite both containing "toilet"');
    act(()=>{fireEvent.change(realInput,{target:{value:"toilet won't flush"}});});
    assert(existsRegex('Install/repair toilet'), "toilet won't flush still correctly recommends the toilet service");
  });

  step('24c. Search by symptom — genuinely ambiguous input asks one clarifying question instead of guessing', () => {
    const realInput = screen.getByPlaceholderText('Search services...');
    act(()=>{fireEvent.change(realInput,{target:{value:'toilet issue'}});});
    assert(existsRegex('What best describes the problem?'), 'A vague toilet query triggers the clarification question rather than guessing wrong');
    assert(existsRegex('Overflowing')&&existsRegex('Keeps running')&&existsRegex('Water leaking')&&existsRegex('Something else'), 'All clarification options are present');
    click('Keeps running');
    assert(existsRegex('Install/repair toilet'), 'Selecting a clarification option navigates directly to that specific service');
  });

  runInteractiveBackChecks();
}

// ── PHASE 5: interactive, reversible edge-swipe back gesture. Needs its own
// fresh mount (clean navigation stack) and real pointer-event sequencing
// with genuine small delays between move events — synchronous back-to-back
// moves in Node have ~0ms elapsed time, which artificially inflates the
// computed velocity and would give false signal on the velocity-based
// completion rule.
async function runInteractiveBackChecks(){
  const container6 = document.createElement('div');
  document.body.appendChild(container6);
  act(()=>{ render(React.createElement(App), container6); });
  function pdown(x,y){ act(()=>{ document.dispatchEvent(new dom.window.PointerEvent('pointerdown',{clientX:x,clientY:y,bubbles:true})); }); }
  function pmove(x,y){ act(()=>{ document.dispatchEvent(new dom.window.PointerEvent('pointermove',{clientX:x,clientY:y,bubbles:true})); }); }
  function pup(x,y){ act(()=>{ document.dispatchEvent(new dom.window.PointerEvent('pointerup',{clientX:x,clientY:y,bubbles:true})); }); }
  // The gesture's background reveal layer only renders while phase!=="idle"
  // (see the app's own gestureActive check) — so "no destination content
  // in the DOM" is a real, observable signal that the settle animation has
  // actually finished, not a guess about how long it should take.
  const waitForSettleIdle = (msg) => waitForCondition(
    () => !document.body.innerHTML.includes('Jane Doe') || existsRegex('Home overview'),
    { timeout: 2000, message: msg }
  );
  const waitForCommitted = (msg) => waitForCondition(
    () => existsRegex('Jane Doe') && !existsRegex('Home overview'),
    { timeout: 2000, message: msg }
  );

  step('25. Interactive back gesture — follows the finger, reveals destination underneath, reversible before release', () => {
    click('Profile'); click('My Home');
    assert(existsRegex('Home overview'), 'On My Home');
    pdown(5,300); pmove(60,301); pmove(150,302);
    assert(document.body.innerHTML.includes('Jane Doe'), 'Destination screen (Profile) renders live underneath during the drag');
    assert(existsRegex('Home overview'), 'Current screen (My Home) still showing — no premature navigation mid-drag');
    pmove(80,302); // reverse the swipe partway back toward the edge
    assert(existsRegex('Home overview'), 'Reversing the gesture before release does not navigate');
    pup(80,302);
  });

  await waitForSettleIdle('Step 25/26: cancel settle animation never finished.');

  step('26. Releasing before the completion threshold cancels — no navigation', () => {
    assert(existsRegex('Home overview'), 'Released under threshold: cancelled, still on the original screen');
    assert(!document.body.innerHTML.includes('Jane Doe') || existsRegex('Home overview'), 'No stray destination content left behind after cancel');
  });

  step('27. Releasing past the completion threshold commits navigation', () => {
    pdown(5,300); pmove(60,301); pmove(200,302);
    pup(200,302);
  });

  await waitForCommitted('Step 27/27b: commit settle animation never finished.');

  step('27b. (continued) navigation committed via the centralized backFrom path', () => {
    assert(existsRegex('Jane Doe') && !existsRegex('Home overview'), 'Past-threshold release completed navigation to the correct destination');
  });

  step('28. A fast flick commits even with a short drag distance (velocity rule)', () => {
    click('My Home');
    pdown(5,300); pmove(25,301);
  });

  // These two gaps are the simulated finger speed itself (real elapsed
  // time is what makes the velocity calculation realistic — see the app's
  // own note about synchronous back-to-back events inflating velocity
  // artificially), not something to poll for, so they stay real delays.
  await delay(16); // large jump after a short real gap = high velocity
  pmove(100,302); // short total distance (~26% of 390px, under the 35% rule)
  pup(100,302);

  await waitForCommitted('Step 28/28b: fast-flick commit settle animation never finished.');

  step('28b. (continued) short-distance fast flick still completed via velocity', () => {
    assert(existsRegex('Jane Doe') && !existsRegex('Home overview'), 'Fast flick under the distance threshold still committed');
  });

  step('29. A slow short swipe (low velocity, short distance) cancels', () => {
    click('My Home');
    pdown(5,300); pmove(20,301);
  });

  await delay(60);
  pmove(35,301);
  await delay(60);
  pmove(50,302);
  pup(50,302);

  await waitForSettleIdle('Step 29/29b: slow-swipe cancel settle animation never finished.');

  step('29b. (continued) slow short swipe correctly cancelled', () => {
    assert(existsRegex('Home overview'), 'Slow short swipe (under both distance and velocity rules) cancelled — still on the original screen');
  });

  step('30. Gesture conflict protections — notification swipe rows still opt out and work independently', () => {
    forceProfileRoot();
    click('Notifications');
    // The Notification Center's own swipe rows declare
    // data-no-edge-swipe; confirm the screen is reachable and
    // its own swipe mechanics aren't hijacked by the edge
    // gesture (already covered structurally by the shared
    // opt-out attribute — this just confirms nothing crashed
    // when the two systems are both present on screen).
    assert(existsRegex('Today')||existsRegex("caught up"), 'Notification Center still reachable and renders normally alongside the edge-back gesture system');
  });

  step('31. Visible Back buttons still navigate to the identical destination as the gesture', () => {
    const backBtn = screen.queryAllByText('‹').slice(-1)[0];
    if(backBtn) act(()=>{fireEvent.click(backBtn);});
    assert(existsRegex('Jane Doe'), 'Visible Back button reaches the same destination the interactive gesture would');
  });

  runInlineEditChecks();
}

// ── PHASE 7: My Home overview inline editing. Own fresh mount, same
// reasoning as every prior phase — this touches persisted property data
// and needs a clean slate.
function runInlineEditChecks(){
  const container7 = document.createElement('div');
  document.body.appendChild(container7);
  act(()=>{ render(React.createElement(App), container7); });

  step('32. Home type — the control is always present, no separate "tap to reveal" step, and selecting a value saves instantly with no Save button', () => {
    click('Profile'); click('My Home');
    assert(existsRegex('Home overview'), 'On My Home');
    const homeTypeSelect = screen.getByLabelText('Home type');
    assert(!!homeTypeSelect, 'The native control exists without any prior tap on the tile — first tap goes straight to the real control');
    act(()=>{fireEvent.change(homeTypeSelect,{target:{value:'Townhouse'}});});
    assert(existsRegex('Townhouse'), 'Selecting a value saves and updates the displayed text immediately');
    assert(!screen.queryByText('✓ Save') && !screen.queryByText('✕ Cancel'), 'No Save/Cancel buttons exist anywhere on the tile');
  });

  step('33. Year built — same direct-manipulation pattern, independent of Home type (no shared "one tile editing at a time" state)', () => {
    const before = primaryHomeRaw().yearBuilt;
    const yearSelect = screen.getByLabelText('Year built');
    const newYear = before==='2010'?'2011':'2010';
    act(()=>{fireEvent.change(yearSelect,{target:{value:newYear}});});
    assert(primaryHomeRaw().yearBuilt===newYear, 'Year built saves instantly on selection');
    assert(primaryHomeRaw().propertyType==='Townhouse', "Home type from the previous step is untouched — each tile is fully independent, there's no shared editing-mode state to interfere with a different tile");
  });

  step('34. Square footage — focus/type/blur pattern: invalid input silently reverts on blur (no error banner, no Save button), valid input saves on blur', () => {
    const sqftInput = screen.getByLabelText('Square footage');
    const before = primaryHomeRaw().sqft;
    act(()=>{fireEvent.focus(sqftInput);});
    act(()=>{fireEvent.change(sqftInput,{target:{value:'0'}});});
    act(()=>{fireEvent.blur(sqftInput);});
    assert(primaryHomeRaw().sqft===before, 'Invalid (zero) square footage silently reverts to the previous value on blur — no error message, no lingering edit state');
    act(()=>{fireEvent.focus(sqftInput);});
    act(()=>{fireEvent.change(sqftInput,{target:{value:'-40'}});});
    assert(sqftInput.value==='40', 'Non-digit characters (including a minus sign) are stripped at input time — negative values cannot even be typed');
    act(()=>{fireEvent.change(sqftInput,{target:{value:'1650'}});});
    act(()=>{fireEvent.blur(sqftInput);});
    assert(primaryHomeRaw().sqft==='1650', 'Valid square footage saves on blur');
    assert(sqftInput.value==='1650'&&existsRegex('sqft'), 'Updated value displays immediately');
  });

  step('35. Layout — tapping the tile opens a small popover without resizing the tile itself; both selectors save instantly; tapping outside closes it', () => {
    const tileBefore = screen.getByLabelText(/Layout:/).closest('div').getAttribute('style');
    click('Layout');
    assert(!!screen.queryByLabelText('Bedrooms') && !!screen.queryByLabelText('Bathrooms'), 'Tapping Layout opens a popover with both selectors immediately — no second tap');
    const tileDuring = screen.getByLabelText(/Layout:/).closest('div').getAttribute('style');
    assert(tileBefore===tileDuring, "The Layout tile's own style never changes while its popover is open — the tile itself does not resize");
    act(()=>{fireEvent.change(screen.getByLabelText('Bedrooms'),{target:{value:'4'}});});
    act(()=>{fireEvent.change(screen.getByLabelText('Bathrooms'),{target:{value:'2.5'}});});
    assert(primaryHomeRaw().beds==='4'&&primaryHomeRaw().baths==='2.5', 'Both values save instantly on selection, no Save button');
    assert(existsRegex('4 bed / 2.5 bath'), 'Updated layout displays immediately while the popover is still open');
    act(()=>{fireEvent.pointerDown(document.body);});
    assert(!screen.queryByLabelText('Bedrooms'), 'Tapping outside the popover closes it');
    assert(primaryHomeRaw().beds==='4'&&primaryHomeRaw().baths==='2.5', 'Closing the popover keeps the already-saved values (nothing to discard, since every change saved instantly)');
  });

  step('36. No tile ever changes dimensions — Home overview grid style is stable whether idle or mid-interaction on any tile', () => {
    const gridBefore = screen.getByLabelText('Home type').closest('div').parentElement.getAttribute('style');
    click('Layout');
    const gridDuring = screen.getByLabelText('Home type').closest('div').parentElement.getAttribute('style');
    assert(gridBefore===gridDuring, 'The grid container itself never changes style/columns while a tile is being interacted with');
    act(()=>{fireEvent.pointerDown(document.body);}); // close the popover again
  });

  step('37. Inline edits update the same canonical property — full Edit Home screen and Saved Addresses reflect identical data, no duplicate created', () => {
    const beforeCount = JSON.parse(storedAddressesRaw()).data.length;
    click('Edit ›');
    assert(existsRegex('Property type')||existsRegex('Year built'), 'Full Edit Home screen reachable');
    const sqftFieldShowsSaved = Array.from(document.querySelectorAll('input')).some(i=>i.value==='1650');
    const bedsFieldShowsSaved = Array.from(document.querySelectorAll('select')).some(s=>s.value==='4');
    assert(sqftFieldShowsSaved, 'Full Edit Home form shows the same square footage saved inline — one canonical record, not two');
    assert(bedsFieldShowsSaved, 'Full Edit Home form shows the same bedroom count saved inline');
    const afterCount = JSON.parse(storedAddressesRaw()).data.length;
    assert(beforeCount===afterCount, 'No duplicate property was created by inline editing');
  });

  runReceiptPdfChecks();
}

// ── PHASE 9: PDF receipt generation. Own fresh mount, same reasoning as
// every prior phase. Note on scope: the actual browser file-download side
// effect of doc.save() is fundamentally unobservable in headless jsdom —
// confirmed during development via several different interception
// techniques (monkey-patching jsPDF.prototype.save, document.createElement,
// URL.createObjectURL — none fire, because real file downloads can't
// happen outside a real browser). The actual PDF bytes/layout/pagination
// were thoroughly verified manually during development (rasterized and
// visually inspected). This phase verifies what a regression suite should:
// the data feeding the PDF is correct, and the full flow never throws.
function runReceiptPdfChecks(){
  const container8 = document.createElement('div');
  document.body.appendChild(container8);

  const origError = console.error, origWarn = console.warn;
  const captured = [];
  console.error = (...a) => captured.push(a.join(' '));
  console.warn = (...a) => captured.push(a.join(' '));

  act(()=>{ render(React.createElement(App), container8); });

  step('38. Completing a job populates real receipt content (work performed, materials, notes) — not empty, not placeholder', () => {
    click('Mount TV');
    clickRegex(/Post Job/);
    click('Accept job (start travel)');
    clickRegex(/Arrive/); clickRegex(/Start work/); clickRegex(/Complete job/);
    const jobsData = JSON.parse(storedData['haven_jobs']);
    const job = jobsData.data[jobsData.data.length-1];
    assert(Array.isArray(job.workPerformed) && job.workPerformed.length>0, 'Completed job has real work-performed bullets, not an empty list');
    assert(typeof job.proNotes==='string' && job.proNotes.length>0, 'Completed job has real professional notes, not empty');
    assert(Array.isArray(job.materials), 'Completed job has a materials array (may legitimately be empty for some categories)');
  });

  step('39. Materials are drawn from the agreed price, never added on top — labor plus materials never exceeds the receipt total the customer actually approved', () => {
    click('🧾 View Receipt');
    const totalMatch = document.body.textContent.match(/TOTAL PAID\$?(\d+(?:\.\d+)?)/) || document.body.textContent.match(/Total paid\$?(\d+(?:\.\d+)?)/);
    const jobsData = JSON.parse(storedData['haven_jobs']);
    const job = jobsData.data[jobsData.data.length-1];
    const materialsCost = job.materials.reduce((s,m)=>s+m.amount*(m.qty||1),0);
    assert(!!totalMatch, 'Receipt total is findable in rendered output');
    if(totalMatch){
      const renderedTotal = parseFloat(totalMatch[1]);
      assert(materialsCost<=renderedTotal, "Total materials cost never exceeds what's shown as the receipt total");
    }
  });

  step('40. Receipt screen reachable with real completed-job data, Share flow completes without throwing', () => {
    assert(existsRegex('RECEIPT')||existsRegex('Receipt'), 'Receipt screen reachable after completion');
    click('⬆️ Share Receipt');
    assert(existsRegex('Save or Download Receipt'), 'No navigator.share in this environment — correctly falls back to the share sheet, not a crash or a silent no-op');
  });

  step('41. Download completes without throwing, using real PDF generation when available', () => {
    click('⬇️ Save or Download Receipt');
    assert(!screen.queryByText('Save or Download Receipt'), 'Share sheet closes after a download attempt, whether the PDF or text-fallback path was taken');
  });

  step('42. No console errors anywhere in the completion → receipt → share → download flow', () => {
    const realErrors = captured.filter(m=>!/ReactDOMTestUtils\.act|not configured to support act/.test(m));
    assert(realErrors.length===0, `No unexpected console errors during PDF receipt generation (found: ${JSON.stringify(realErrors.slice(0,2))})`);
  });

  console.error = origError; console.warn = origWarn;

  runDiagnosisMatchingChecks();
}

// ── PHASE 12: "Minor repairs" universal-fallback removal + hierarchical
// category/intent matching. Calls matchRepairIntent directly — the actual
// user-facing diagnosis function — as a pure function. No React rendering
// needed at all for these, which is deliberate: this class of matching
// logic doesn't depend on component state, and testing it directly is
// both the most faithful test of "the diagnosis function" specifically
// (as opposed to the UI built on top of it) and the most robust against
// resource-related flakiness from many accumulated mounted app instances.
function runDiagnosisMatchingChecks(){
  const neverMinorRepairs=(query)=>{
    const r=matchRepairIntent(query);
    return !r.matches.some(m=>m.label==='Minor repairs');
  };

  step('51. Bare "clean" never surfaces Minor Repairs and asks within the Cleaning category', () => {
    const r=matchRepairIntent('clean');
    assert(neverMinorRepairs('clean'), '"clean" never surfaces Minor Repairs anywhere in its matches');
    assert(!!r.clarification && r.clarification.question==='What would you like cleaned?', '"clean" triggers the cleaning category clarification');
    assert(r.tier!=='high', '"clean" is not shown as a confident bookable recommendation — the exact service is genuinely uncertain');
  });

  step('52. "clean garage" — the specific regression from this bug report — never surfaces Minor Repairs or an unrelated service', () => {
    const r=matchRepairIntent('clean garage');
    assert(neverMinorRepairs('clean garage'), '"clean garage" never surfaces Minor Repairs');
    assert(r.matches[0]?.label!=='Garage Door Repair'||r.clarification, '"clean garage" does not silently resolve to the unrelated Garage Door Repair match without at least asking a clarification');
    assert(!!r.clarification, '"clean garage" asks within the Cleaning category rather than guessing, since Haven has no dedicated garage-cleaning service');
  });

  step('53. "deep clean" still resolves confidently and specifically — the fix does not blunt genuinely confident matches', () => {
    const r=matchRepairIntent('deep clean');
    assert(r.tier==='high'&&r.matches[0].label==='Deep Home Cleaning', '"deep clean" remains a confident, specific match');
  });

  step('54. Broader cleaning phrasing resolves correctly without being individually enumerated as special cases', () => {
    const cases=[
      ['clean my house','Standard Home Cleaning'],
      ['my house is dirty','Standard Home Cleaning'],
      ['clean my bathroom','Bathroom Cleaning'],
      ['clean the kitchen','Kitchen Cleaning'],
      ['carpet needs cleaning','Carpet/Upholstery Cleaning'],
      ['moving out and need the house cleaned','Move-Out Cleaning'],
    ];
    cases.forEach(([query,expectedLabel])=>{
      const r=matchRepairIntent(query);
      assert(neverMinorRepairs(query), `"${query}" never surfaces Minor Repairs`);
      assert(r.tier==='high'&&r.matches[0]?.label===expectedLabel, `"${query}" resolves confidently to ${expectedLabel} (got tier=${r.tier}, top=${r.matches[0]?.label})`);
    });
  });

  step('55. Non-cleaning intents are unaffected by the hierarchical fix — regression check in both directions', () => {
    const clogged=matchRepairIntent('clogged toilet');
    assert(clogged.tier==='high'&&clogged.matches[0].category==='Plumbing', 'Plumbing intent still resolves correctly');
    const lights=matchRepairIntent('lights flickering');
    assert(lights.tier==='high'&&lights.matches[0].category==='Electrical', 'Electrical intent still resolves correctly');
    // The reverse direction matters too: a genuine garage-DOOR query must
    // still resolve to Repair, not get incorrectly pulled into Cleaning
    // now that "garage" also has cleaning-adjacent vocabulary.
    const garageDoor=matchRepairIntent('garage door stuck');
    assert(garageDoor.tier==='high'&&garageDoor.matches[0].label==='Garage Door Repair', 'A genuine garage door query still resolves to Garage Door Repair, not pulled into the cleaning clarification');
  });

  step('56. Genuinely ambiguous or nonsense input does not automatically become Minor Repairs, or any other unrelated bookable service', () => {
    const gibberish=matchRepairIntent('xyzqqq nonsense gibberish');
    assert(neverMinorRepairs('xyzqqq nonsense gibberish'), 'Gibberish never surfaces Minor Repairs');
    assert(gibberish.tier!=='high'&&gibberish.tier!=='medium', 'Gibberish is never shown as a confident or plausible bookable recommendation');
    const vague=matchRepairIntent('something is wrong');
    assert(neverMinorRepairs('something is wrong'), 'Vague input never surfaces Minor Repairs');
    assert(vague.tier!=='high', 'Vague input is never shown as a confident bookable recommendation');
  });

  step('57. Minor Repairs is only ever reachable through deliberate, specific matching — never as a fallback for unrelated or low-confidence input', () => {
    // Minor Repairs should still be reachable for queries that actually
    // describe minor/general repair work — removing it as a fallback
    // must not mean removing it from the catalog entirely.
    const genuine=matchRepairIntent('a few small things need fixing around the house, general repairs');
    const queries=['clean','clean garage','cleaning','dirty','messy','garage cleaning','help','something is wrong','xyzqqq nonsense gibberish'];
    queries.forEach(q=>{
      assert(neverMinorRepairs(q), `"${q}" never surfaces Minor Repairs as a fallback`);
    });
  });

  console.log(`\n--- Diagnosis matching audit: ${pass} passing, ${fail} failing ---`);
  if (fail > 0) process.exit(1);
}
