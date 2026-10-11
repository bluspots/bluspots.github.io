/**
 * Opening splash (Customer).
 *
 * The installed app used to show nothing for 1-2 s while its scripts loaded
 * (they blocked the page). The shell now paints a navy HAVEN splash at once
 * and the app fades it out after its first render.
 * (1) Shell: the splash markup and styles come before any script; every
 *     library script is deferred, in the original order (React, ReactDOM,
 *     Babel, jsPDF, Supabase); reduced motion turns the animation off.
 * (2) App: hides the splash on mount and from the ErrorBoundary, with a 6 s
 *     fallback; the hide fades it (hs-out) and then removes it.
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
ok(/export default function App\(\)\{\n  useEffect\(\(\)=>\{ havenHideSplash\(\); \},\[\]\);/.test(jsx), 'App hides the splash on mount');
ok(/componentDidCatch\(\)\{ havenHideSplash\(\); \}/.test(jsx), 'ErrorBoundary hides it too');
ok(/setTimeout\(havenHideSplash,6000\)/.test(jsx), '6 s fallback');
// run the real function against a splash element
const fnSrc = jsx.slice(jsx.indexOf('function havenHideSplash(){'), jsx.indexOf('if(typeof window!=="undefined"){\n  window.havenHideSplash'));
const dom = new JSDOM('<div id="haven-splash"></div>');
const run = new Function('document', 'performance', 'setTimeout', fnSrc + '\nreturn havenHideSplash;');
const timers = [];
const hide = run(dom.window.document, { now: () => 5000 }, (f, ms) => timers.push([f, ms]));
hide(); hide();
const el = dom.window.document.getElementById('haven-splash');
ok(timers.length === 1 && timers[0][1] === 0, 'already past 0.8 s: fades right away; a second call does nothing');
timers[0][0]();
ok(el.classList.contains('hs-out'), 'hide fades it (hs-out)');
timers[1][0]();
ok(!dom.window.document.getElementById('haven-splash'), 'then removes it');
// (3)
ok(/const root = ReactDOM\.createRoot\(document\.getElementById\('root'\)\);\s*root\.render\(<ErrorBoundary><App\/><\/ErrorBoundary>\);\s*<\/script>/.test(html), 'app script still ends with root.render');
console.log(`--- Opening splash: ${pass} passing, 0 failing ---`);
