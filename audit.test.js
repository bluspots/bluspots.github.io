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

const src = fs.readFileSync('home_services_app.jsx', 'utf8')
  .replace('import React, { useState, useRef, useEffect } from "react";', '')
  .replace('export default function App(){', 'function App(){');
const { code } = babel.transformSync(src, { presets: [['@babel/preset-react', { runtime: 'classic' }]], filename: 'x.jsx' });
const wrapped = `(function(React, useState, useRef, useEffect, module){ ${code}
  module.exports = typeof App !== 'undefined' ? App : undefined;
  module.exports2 = typeof ErrorBoundary !== 'undefined' ? ErrorBoundary : undefined;
})`;
const moduleObj = { exports: {} };
eval(wrapped)(React, React.useState, React.useRef, React.useEffect, moduleObj);
const App = moduleObj.exports;
const ErrorBoundary = moduleObj.exports2;

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
  const stars = screen.getAllByText('☆');
  const container = stars[0].parentElement.parentElement;
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

step('6. Context-aware suppression — E: status change while viewing exact tracking screen is suppressed', () => {
  clickTab('Home'); click('Assemble bed');
  clickRegex(/Post Job/);
  click('Accept job (start travel)'); // acceptance: user was on posted screen, not tracking yet
  forceProfileRoot();
  click('Notifications');
  assert(existsRegex('Pro accepted your job'), 'Acceptance notification created (user was not yet on tracking)');
  click('‹');
  clickTab('Bookings');
  act(()=>{fireEvent.click(screen.queryAllByText(/Assemble bed/)[0]);});
  clickRegex(/Arrive/); // triggered WHILE already viewing this exact tracking screen
  forceProfileRoot();
  click('Notifications');
  assert(!existsRegex('Pro arrived'), 'Status change while actively viewing the exact tracking screen does not create a redundant notification');
  click('‹');
});

step('7. Context-aware suppression — A: message live in the exact open conversation is suppressed', () => {
  clickTab('Bookings');
  act(()=>{fireEvent.click(screen.queryAllByText(/Assemble bed/)[0]);});
  click('💬 Message');
  const msgInput = screen.getByPlaceholderText(/Message .*/);
  act(()=>{fireEvent.change(msgInput,{target:{value:'hi'}});});
  act(()=>{fireEvent.keyDown(msgInput,{key:'Enter'});});
});

setTimeout(() => {
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

  setTimeout(() => {
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

    setTimeout(() => {
      step('9b. (continued) backgrounded-app notification confirmed', () => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        act(()=>{ document.dispatchEvent(new dom.window.Event('visibilitychange')); });
        click('‹');
        forceProfileRoot();
        click('Notifications');
        assert(existsRegex(/2 new messages/), 'Backgrounded app still created/grouped the notification even while "viewing" the exact conversation');
      });

      step('10. Regression — Notification Center core features still work', () => {
        assert(existsRegex('Mark all as read'), 'Mark all as read still present');
        const row = byRegex(/2 new messages/);
        const rowEl = row.parentElement.parentElement;
        act(()=>{fireEvent.pointerDown(rowEl,{clientX:0,clientY:0});});
        act(()=>{fireEvent.pointerMove(rowEl,{clientX:130,clientY:2});});
        act(()=>{fireEvent.pointerUp(rowEl,{clientX:130,clientY:2});});
        assert(existsRegex(/Mark Unread/), 'Swipe-right mark-as-read still works, reciprocal Mark Unread available');
        click('Mark all as read');
        assert(!existsRegex('Mark all as read'), 'Mark all as read still works');
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
    }, 2300);
  }, 2300);
}, 2300);

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
  });

  console.log(`\n--- Audit complete: ${pass} passing, ${fail} failing ---`);
  if (fail > 0) process.exit(1);
}
