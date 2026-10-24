/**
 * COPY-01 (Customer): remove the unsupported guarantee, 48-hour refund and
 * cancellation-fee wording, and make no support promise: after #86 there is no
 * support channel at all (no phone, email or support chat).
 * Founder 2026-10-23 21:32 ET: correct the remaining unsupported support
 * promise ("Report an issue") and preserve the approved neutral 🎧 card styling
 * for unrated jobs. Trust & safety stays as on master.
 * (Receipt and cancel-sheet support lines are handled by PR #86, not here.)
 */
const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const jsx = fs.readFileSync('home_services_app.jsx', 'utf8');
const pages = [['source jsx', jsx], ['prototype.html', fs.readFileSync('prototype.html', 'utf8')], ['index.html', fs.readFileSync('index.html', 'utf8')]];
for (const [name, src] of pages) {
  ok(!/satisfaction guarantee|trust & safety guarantee|covered by Haven/i.test(src), name + ': no guarantee claims');
  ok(!/48 hours|partial or full refund/i.test(src), name + ': no 48-hour refund promise');
  ok(!/may include a small fee|compensate their travel time/i.test(src), name + ': no cancellation-fee claim in the FAQ');
  ok(!/Our support team can review|contact Haven Support\. Our/i.test(src), name + ': no promise that a support team reviews issues');
  ok(/In-app support isn't available yet, so issues with a Pro or a completed job can't be reported through the app right now\./.test(src), name + ': Report-an-issue says support is not available yet');
  ok(/Something not right with this job\? In-app support isn't available yet\./.test(src), name + ': unrated receipt card says support is not available yet');
}
// Trust & safety: unchanged from master b798bd5.
const MASTER_SAFETY = '{t:"Trust & safety",a:"If you\'re ever in immediate danger, contact local emergency services first — Haven Support is not a substitute for emergency services."},';
ok(jsx.includes(MASTER_SAFETY), 'Trust & safety topic matches master');
// Receipt card: neutral 🎧 styling when unrated (founder-approved), green ✅ thanks when rated.
const cardAt = jsx.indexOf('<div style={{background:vj.rated?SL:W,border:vj.rated?"none":`1px solid ${BD}`,');
const card = cardAt > 0 ? jsx.slice(cardAt, cardAt + 900) : '';
ok(cardAt > 0, 'unrated receipt card uses the neutral background with a border');
ok(/<span aria-hidden="true" style=\{\{fontSize:16\}\}>\{vj\.rated\?"✅":"🎧"\}<\/span>/.test(card), 'unrated card shows the 🎧 support icon (decorative), rated keeps ✅');
ok(/color:vj\.rated\?SC:TS/.test(card) && /Rated \{starDisplay\(vj\.stars,13\)\} — thanks for rating this job\./.test(card), 'neutral text colour when unrated; rated job is thanked');
// Compiled page: same icon/background expression (esbuild formatting).
const idx = fs.readFileSync('index.html', 'utf8');
ok(/vj\.rated\s*\?\s*"✅"\s*:\s*"🎧"/.test(idx) && /background:\s*vj\.rated\s*\?\s*SL\d*\s*:\s*W\d*\b/.test(idx), 'index.html: neutral card built');
console.log(`--- COPY-01 truthful support copy: ${pass} passing, ${fail} failing ---`);
process.exit(fail ? 1 : 0);
