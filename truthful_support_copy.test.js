/**
 * COPY-01 (Customer): no unsupported guarantee, refund, cancellation-fee or
 * support-response claims in the shipped page.
 * Haven has no established guarantee, insurance, refund policy, cancellation
 * fee, or monitored support channel yet, so the app must not claim them.
 * (The receipt's support email and the simulated support chat are covered by
 * Grokbot's PRs #47/#49 and are not changed here.)
 */
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const html = fs.readFileSync('prototype.html', 'utf8');
const built = fs.readFileSync('index.html', 'utf8');
for (const [name, src] of [['source page', html], ['built page', built]]) {
  ok(!/satisfaction guarantee|trust & safety guarantee/.test(src), name + ': no guarantee claims');
  ok(!/within 48 hours of completion|partial or full refund/.test(src), name + ': no 48-hour refund promise');
  ok(!/cancellations may include a small fee/.test(src), name + ': no cancellation-fee claim');
  ok(!/Our support team can review/.test(src), name + ': no promise that a support team reviews issues');
  ok(!/Haven Support is not a substitute/.test(src), name + ': Trust & safety no longer implies a support team');
  ok(/Rated \{starDisplay\(vj\.stars,13\)\}\. Thanks for rating this job\./.test(src) || /Thanks for rating this job\./.test(src), name + ': rated job thanks the customer');
  ok(/Something not right with this job\? In-app support isn't available yet\./.test(src), name + ': unrated job says support is not available yet');
  ok(/Payments aren't collected in the app yet, so there are no in-app charges to refund\./.test(src), name + ': refunds FAQ is truthful');
  ok(/You can cancel for free from the Bookings tab any time before a Pro accepts\./.test(src), name + ': cancellation FAQ matches what the app does');
  ok(/call 911 or your local emergency services/.test(src), name + ': safety FAQ points to emergency services');
}
ok(/\{vj\.rated\?"✅":"🎧"\}/.test(html) && /background:vj\.rated\?SL:W/.test(html), 'unrated card uses 🎧 with neutral styling; rated keeps the green thanks');
console.log(`--- COPY-01 truthful support copy: ${pass} passing, ${fail} failing ---`);
process.exit(fail ? 1 : 0);
