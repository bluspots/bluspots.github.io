/**
 * Opening splash (Customer).
 *
 * The installed app used to show nothing for 1-2 s while its scripts loaded
 * (they blocked the page). The shell now paints a navy HAVEN splash at once
 * and the app fades it out after its first render.
 * (1) Shell: the splash markup and styles come before any script; every
 *     library script is deferred, in the original order (React, ReactDOM,
 *     Babel, jsPDF, Supabase); reduced motion turns the animation off.
 * (2) App: hides the splash on the frame after its first real screen (Home,
 *     sign-in gate or connection error; never the brief Connecting screen),
 *     and from the ErrorBoundary. It holds through any slow connection (no
 *     timeout); a slow load adds "Still loading…". The shell's hide starts a 0.3 s fade
 *     (none with Reduce Motion), stops taking touches at once, then removes
 *     it. A script that fails to download shows a message on the splash.
 * (3) The app script still ends with the root.render line the tests rely on.
 */
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };

const pre = fs.readFileSync('_shell_pre.txt', 'utf8');
const html = fs.readFileSync('prototype.html', 'utf8');
const jsx = fs.readFileSync('home_services_app.jsx', 'utf8');
// (1)
ok(/<div id="haven-splash"><div class="hs-mark" aria-hidden="true">HAVEN<\/div>/.test(pre) && /class="hs-note" role="status" aria-live="polite"/.test(pre), 'splash markup is in the shell; its note is announced to VoiceOver');
ok(pre.indexOf('#haven-splash{') < pre.indexOf('<script'), 'splash styles come before any script');
const scripts = [...pre.matchAll(/<script([^>]*)src="([^"]+)"/g)].map(m => ({ defer: /\bdefer\b/.test(m[1]), src: m[2] }));
ok(scripts.length === 5 && scripts.every(s => s.defer), 'all 5 library scripts are deferred');
ok(['react.production', 'react-dom.production', 'babel.min', 'jspdf', 'supabase'].every((k, i) => scripts[i].src.includes(k)), 'library order unchanged (React, ReactDOM, Babel, jsPDF, Supabase)');
ok(/@media \(prefers-reduced-motion:reduce\)\{#haven-splash \.hs-mark,#haven-splash \.hs-line\{animation:none/.test(pre), 'reduced motion: no splash animation');
// (2)
const fx = jsx.slice(jsx.indexOf('// Opening splash = the loading screen.'), jsx.indexOf('},[backendStatus]);') + 20);
ok(/if\(backendStatus==="connecting"\) return;/.test(fx) && /requestAnimationFrame:setTimeout\)\(hideOpeningSplash\)/.test(fx), 'holds while connecting; hides on the frame after the first real screen');
ok(!/setTimeout\(hideOpeningSplash/.test(jsx), 'no timer in the app hands over early (no Connecting screen)');
ok(jsx.indexOf('const [backendStatus,setBackendStatus]=useState("connecting");') < jsx.indexOf('// Opening splash = the loading screen.'), 'effect sits after backendStatus is declared');
ok(/componentDidCatch\(\)\{ hideOpeningSplash\(\); \}/.test(jsx), 'ErrorBoundary hides it too');
ok(!/function havenHideSplash/.test(jsx), 'the app never redefines the shell\'s window.havenHideSplash');
ok(!/800-since|Math\.max\(0,800/.test(jsx + pre), 'no minimum display time');
// run the shell's real hide script against a splash element
const shellJs = pre.slice(pre.indexOf('<script>\n/* Hides the splash.') + 8, pre.indexOf('</script>', pre.indexOf('/* Hides the splash.')));
for (const still of [false, true]) {
  const dom = new JSDOM('<div id="haven-splash"><div class="hs-note"></div></div>');
  const w = dom.window; const timers = []; const listeners = [];
  w.setTimeout = (f, ms) => { timers.push([f, ms]); return timers.length; };
  w.matchMedia = () => ({ matches: still });
  w.performance.mark = () => {};
  const doc = w.document; const realAdd = doc.addEventListener.bind(doc);
  doc.addEventListener = (type, fn, cap) => { listeners.push([type, fn, cap]); realAdd(type, fn, cap); };
  new Function('window', 'document', 'performance', 'setTimeout', shellJs)(w, doc, w.performance, w.setTimeout);
  const slow = timers.shift();
  if (!still) {
    ok(slow[1] === 10000 && !timers.length, 'no timeout ever hides the splash; after 10 s it only adds a note');
    slow[0]();
    ok(/Still loading/.test(doc.querySelector('.hs-note').textContent) && doc.getElementById('haven-splash') && !doc.getElementById('haven-splash').classList.contains('hs-out'), 'slow load: "Still loading…" on the splash, splash stays');
    const err = listeners.find(l => l[0] === 'error' && l[2] === true);
    err[1]({ target: { tagName: 'SCRIPT' } });
    ok(/couldn't finish loading/.test(doc.querySelector('.hs-note').textContent), 'a script that fails to download shows a clear message on the splash');
  }
  w.havenHideSplash(); w.havenHideSplash();
  const el = doc.getElementById('haven-splash');
  ok(el.classList.contains('hs-out') && timers.length === 1, (still ? 'Reduce Motion: ' : '') + 'hide starts at once (no wait); a second call does nothing');
  ok(timers[0][1] === (still ? 0 : 320), still ? 'Reduce Motion: removed with no fade' : 'removed right after the 0.3 s fade');
  timers[0][0]();
  ok(!doc.getElementById('haven-splash'), 'then the splash is gone (no lingering overlay)');
}
ok(/#haven-splash\.hs-out\{opacity:0;pointer-events:none\}/.test(pre), 'fading splash no longer takes touches (app usable at once)');
ok(/@media \(prefers-reduced-motion:reduce\)\{[^}]*\}[^}]*#haven-splash\{transition:none\}/.test(pre), 'Reduce Motion: no fade transition');
// (3)
ok(/const root = ReactDOM\.createRoot\(document\.getElementById\('root'\)\);\s*root\.render\(<ErrorBoundary><App\/><\/ErrorBoundary>\);\s*<\/script>/.test(html), 'app script still ends with root.render');
console.log(`--- Opening splash: ${pass} passing, 0 failing ---`);
