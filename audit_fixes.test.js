/**
 * Fixes from the Customer accessibility / dark-mode audit.
 * (1) Dark mode: selected chips (Bookings filter, booking time, custom-job
 *     category, "Would you hire again?") use white text on navy. They used
 *     W, which is the dark surface color in dark mode: dark text on navy.
 * (2) The ‹ back arrows have a 44px tap area (it was 9 x 24) without moving
 *     anything; the Notifications back arrow uses the theme-aware color.
 * (3) Home's search bar is one control (it was an input inside a button).
 * (4) Fields that only had placeholder text have spoken labels.
 * (5) Back from Messages really goes back.
 */
const fs = require('fs');
const assert = require('assert');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const s = fs.readFileSync('home_services_app.jsx', 'utf8');
const line = needle => { const i = s.indexOf(needle); assert.ok(i >= 0, 'missing ' + needle); return s.slice(s.lastIndexOf('\n', i) + 1, s.indexOf('\n', i)); };
// (1)
ok(/const W  = isDark \? "#1B242E" : "#FFFFFF";/.test(s) && /const ON = "#FFFFFF";/.test(s), 'W is dark in dark mode; ON is always white');
for (const [needle, label] of [['onClick={()=>setBFilter(id)}', 'Bookings filter'], ['onClick={()=>setCcat(c)}', 'custom-job category'], ['onClick={()=>setHireAgain(a?null:val)}', '"Would you hire again?"']]) {
  const l = line(needle);
  ok(/background:a\?(N|CHIP_ON):/.test(l) && /color:a\?ON:/.test(l) && !/color:a\?W:/.test(l), label + ': selected = white on the selected fill (navy; blue in dark mode, see dark_selected_chips.test.js)');
}
ok(/<span style=\{\{fontWeight:700,fontSize:13,color:a\?ON:TX\}\}>\{p\.label\}<\/span>/.test(s), 'booking time chip: selected = white on navy');
ok(!/background:a\?(N|CHIP_ON):[^}]*color:a\?W:/.test(s), 'no selected chip uses W for its text anywhere');
// (2)
const backs = [...s.matchAll(/aria-label="Back" style=\{\{[^}]*\}\}>‹</g)].map(m => m[0]);
ok(backs.length === 4 && backs.every(b => /padding:"10px 18px",margin:"-10px -18px"/.test(b)), 'all 4 ‹ back arrows have a 45 x 44 tap area that does not move them');
ok(backs.every(b => /color:NT/.test(b)), 'back arrows use the theme-aware navy (NT)');
// (3)
const sr = line('aria-label="Search 50+ services" onKeyDown={keyActivate}');
ok(/role="button" tabIndex=\{0\}/.test(sr), 'search bar is one button, labelled "Search 50+ services"');
ok(/placeholder="Search 50\+ services\.\.\." tabIndex=\{-1\} aria-hidden="true"/.test(s), 'its display-only input is hidden from screen readers and the keyboard');
// (4)
for (const l of ['aria-label="Search services"', 'aria-label="Describe the problem"', 'aria-label="What needs to be done?"', 'aria-label="Your budget in dollars"']) ok(s.includes(l), 'field labelled: ' + l);
// (5)
ok(s.includes('onClick={()=>backFrom("messages",{scr:"tracking",tab:"bookings"})} aria-label="Back"'), 'Back from Messages uses backFrom (restores the previous screen)');
console.log(`--- Audit fixes: ${pass} passing, 0 failing ---`);
