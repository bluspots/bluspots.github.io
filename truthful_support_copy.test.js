/**
 * COPY-01 (Customer): remove the unsupported guarantee, 48-hour refund and
 * cancellation-fee wording, and nothing else. The Report-an-issue and
 * Trust & safety topics and the receipt card's styling must match master.
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
  ok(!/In-app support isn't available yet/.test(src), name + ": no 'In-app support isn't available yet' text");
}
// Reverted screens: exact master copy (from master b798bd5).
const MASTER_REPORT = '{t:"Report an issue with a pro",a:"If you experience a problem with a pro or a completed job, contact Haven Support. Our support team can review the booking details, messages, photos, and receipt and help determine the next steps."},';
const MASTER_SAFETY = '{t:"Trust & safety",a:"If you\'re ever in immediate danger, contact local emergency services first — Haven Support is not a substitute for emergency services."},';
const MASTER_CARD = [
  '<div style={{background:SL,borderRadius:14,padding:14,display:"flex",gap:10,alignItems:"center",marginBottom:20}}>',
  '<span style={{fontSize:16}}>✅</span>',
  '<span style={{fontSize:12,color:SC,fontWeight:600,lineHeight:1.4,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>',
];
ok(jsx.includes(MASTER_REPORT), 'Report-an-issue topic matches master');
ok(jsx.includes(MASTER_SAFETY), 'Trust & safety topic matches master');
let at = jsx.indexOf(MASTER_CARD[0]);
ok(at > 0 && MASTER_CARD.every(l => { const i = jsx.indexOf(l, at); const good = i >= at && i - at < 400; at = i; return good; }), 'receipt card styling matches master');
const card = jsx.slice(jsx.indexOf(MASTER_CARD[0]), jsx.indexOf(MASTER_CARD[0]) + 600);
ok(!/🎧|aria-hidden|vj\.rated\?SL:W|color:vj\.rated/.test(card), 'receipt card restyle (🎧 / aria-hidden / conditional colours) reverted');
console.log(`--- COPY-01 truthful support copy: ${pass} passing, ${fail} failing ---`);
process.exit(fail ? 1 : 0);
