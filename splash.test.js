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
 *     after 4 s if connecting is slow, and from the ErrorBoundary. No minimum time. The shell's hide starts a 0.3 s fade
 *     (none with Reduce Motion), stops taking touches at once, then removes
 *     it. A 12 s safety net covers an app that never starts.
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
ok(/<div id="haven-splash" aria-hidden="true">/.test(pre), 'splash markup is in the shell, hidden from screen readers');
ok(pre.indexOf('#haven-splash{') < pre.indexOf('<script'), 'splash styles come before any script');
const scripts = [...pre.matchAll(/<script([^>]*)src="([^"]+)"/g)].map(m => ({ defer: /\bdefer\b/.test(m[1]), src: m[2] }));
ok(scripts.length === 5 && scripts.every(s => s.defer), 'all 5 library scripts are deferred');
ok(['react.production', 'react-dom.production', 'babel.min', 'jspdf', 'supabase'].every((k, i) => scripts[i].src.includes(k)), 'library order unchanged (React, ReactDOM, Babel, jsPDF, Supabase)');
ok(/@media \(prefers-reduced-motion:reduce\)\{#haven-splash \.hs-mark,#haven-splash \.hs-line\{animation:none/.test(pre), 'reduced motion: no splash animation');
// (2)
const fx = jsx.slice(jsx.indexOf('// Opening splash: hide it on the frame after the first real screen'), jsx.indexOf('},[backendStatus]);') + 20);
ok(/if\(backendStatus!=="connecting"\)\{ nextFrame\(hideOpeningSplash\); return undefined; \}/.test(fx), 'hides on the frame after the first real screen (not the brief Connecting screen)');
ok(/setTimeout\(hideOpeningSplash,4000\)/.test(fx) && /return \(\)=>clearTimeout\(t\);/.test(fx), 'slow connection: hands over to the Connecting screen after 4 s');
ok(jsx.indexOf('const [backendStatus,setBackendStatus]=useState("connecting");') < jsx.indexOf('// Opening splash: hide it on the frame after'), 'effect sits after backendStatus is declared');
ok(/componentDidCatch\(\)\{ hideOpeningSplash\(\); \}/.test(jsx), 'ErrorBoundary hides it too');
ok(!/function havenHideSplash/.test(jsx), 'the app never redefines the shell\'s window.havenHideSplash');
ok(!/800-since|Math\.max\(0,800/.test(jsx + pre), 'no minimum display time');
// run the shell's real hide script against a splash element
const shellJs = pre.slice(pre.indexOf('<script>\n/* Hides the splash.') + 8, pre.indexOf('</script>', pre.indexOf('/* Hides the splash.')));
for (const still of [false, true]) {
  const dom = new JSDOM('<div id="haven-splash"></div>');
  const w = dom.window; const timers = [];
  w.setTimeout = (f, ms) => { timers.push([f, ms]); return timers.length; };
  w.matchMedia = () => ({ matches: still });
  w.performance.mark = () => {};
  new Function('window', 'document', 'performance', 'setTimeout', shellJs)(w, w.document, w.performance, w.setTimeout);
  const fallback = timers.shift();
  if (!still) ok(fallback[1] === 12000, 'safety net hides the splash after 12 s only if the app never starts');
  w.havenHideSplash(); w.havenHideSplash();
  const el = w.document.getElementById('haven-splash');
  ok(el.classList.contains('hs-out') && timers.length === 1, (still ? 'Reduce Motion: ' : '') + 'hide starts at once (no wait); a second call does nothing');
  ok(timers[0][1] === (still ? 0 : 320), still ? 'Reduce Motion: removed with no fade' : 'removed right after the 0.3 s fade');
  timers[0][0]();
  ok(!w.document.getElementById('haven-splash'), 'then the splash is gone (no lingering overlay)');
}
ok(/#haven-splash\.hs-out\{opacity:0;pointer-events:none\}/.test(pre), 'fading splash no longer takes touches (app usable at once)');
ok(/@media \(prefers-reduced-motion:reduce\)\{[^}]*\}[^}]*#haven-splash\{transition:none\}/.test(pre), 'Reduce Motion: no fade transition');
// (3)
ok(/const root = ReactDOM\.createRoot\(document\.getElementById\('root'\)\);\s*root\.render\(<ErrorBoundary><App\/><\/ErrorBoundary>\);\s*<\/script>/.test(html), 'app script still ends with root.render');
console.log(`--- Opening splash: ${pass} passing, 0 failing ---`);
