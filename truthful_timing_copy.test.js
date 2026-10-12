/**
 * Truthful timing copy (Customer, HB-10). Nothing promises an arrival or
 * response time the system doesn't enforce, and nothing claims Pros are
 * notified or prioritized (there are no notifications or priority ordering).
 * Urgent jobs are labelled urgent for Pros; that is what's true today.
 * The timing options and their prices are unchanged (pricing is out of scope).
 */
const fs = require('fs');
const assert = require('assert');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const s = fs.readFileSync('home_services_app.jsx', 'utf8');
const built = fs.readFileSync('index.html', 'utf8');
for (const src of [s, built]) {
  ok(!/Same-day|handled within|notified first|[Pp]rioritiz(e|ing) nearby|Response within|Within 2 hours|Within 1–2 hours|Fast help/.test(src), 'no unsupported speed, response or priority promise');
}
const em = s.slice(s.indexOf('const EMERGENCY_TIME_PREFS=['), s.indexOf('];', s.indexOf('const EMERGENCY_TIME_PREFS=[')));
ok((em.match(/sub:"Preferred · not a guaranteed arrival time"/g) || []).length === 3, 'every urgent timing option reads as a preference, not a guarantee');
ok(/\{id:101,label:"ASAP",[^}]*surge:10\}/.test(em) && /\{id:102,label:"Within 4 hours",[^}]*surge:0\}/.test(em) && /\{id:103,label:"Within 6 hours",[^}]*surge:0\}/.test(em), 'urgent timing options and their prices are unchanged');
ok(/\{id:1,label:"ASAP",\s*sub:"As soon as a Pro is available",surge:10\}/.test(s), 'ASAP says "as soon as a Pro is available" with its price unchanged');
ok((s.match(/Haven can't guarantee an arrival time, and your timing preference isn't shared with Pros yet\./g) || []).length === 2, 'both urgent booking screens say no arrival time is guaranteed');
ok(/Your job is marked urgent for Pros near you\. Arrival times aren't guaranteed\./.test(s), 'the posted screen says the job is marked urgent, with no time promise');
ok(/\{\["✓ Fixed pricing"\]\.map/.test(s), 'the Home header keeps only the fixed-pricing claim');
console.log(`--- Truthful timing copy: ${pass} passing, 0 failing ---`);
