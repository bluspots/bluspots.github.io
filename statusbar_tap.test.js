/**
 * Tap the status bar to scroll to the top (Customer, installed app).
 *
 * iOS scrolls the PAGE to the top when the status bar is tapped, but Haven
 * scrolls inside its screens, so the tap did nothing. On phones the app is
 * one pixel taller than the screen and keeps the page scrolled by that pixel;
 * when the page lands at 0 (the tap), the current screen scrolls to the top
 * and the pixel is re-armed. (Behavior verified in Chromium by simulating the
 * page scroll; the real tap needs an iPhone.)
 */
const fs = require('fs');
const assert = require('assert');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const css = fs.readFileSync('ui_atoms.js', 'utf8');
const jsx = fs.readFileSync('home_services_app.jsx', 'utf8');
const phone = css.slice(css.indexOf('@media (max-width:480px){'), css.indexOf('@media print'));
ok(/\.haven-frame-phone\{[^}]*height:calc\(100dvh \+ 1px\)!important/.test(phone), 'phones only: the app is one pixel taller than the screen');
ok(!/\.haven-frame-phone\{[^}]*height:calc/.test(css.slice(0, css.indexOf('@media (max-width:480px){'))), 'desktop preview frame unchanged');
const fx = jsx.slice(jsx.indexOf('// Tap the status bar to scroll to the top.'), jsx.indexOf('const rememberScroll=()=>{'));
ok(/window\.addEventListener\("scroll",onScroll,\{passive:true\}\)/.test(fx), 'listens for the page scroll (passive)');
ok(/armed&&window\.scrollY<=0/.test(fx) && /window\.scrollTo\(0,1\)/.test(fx), 'acts only when the armed page lands at 0, then re-arms at 1px');
ok(/if\(!typing\(\)\)/.test(fx) && /INPUT.*TEXTAREA.*SELECT/.test(fx), 'never while typing (iOS scrolls the page for the keyboard)');
ok(/const el=mainScroller\(\);/.test(fx) && /behavior:prefersReducedMotion\(\)\?"auto":"smooth"/.test(fx), 'scrolls the current screen, smoothly unless Reduce Motion is on');
ok(/canScroll=se\(\)\.scrollHeight>window\.innerHeight/.test(fx), 'does nothing where the page cannot scroll (desktop preview)');
ok(/return \(\)=>\{ clearTimeout\(t0\); clearTimeout\(timer\); window\.removeEventListener\("scroll",onScroll\);/.test(fx), 'cleans up its listeners');
console.log(`--- Status-bar tap to top: ${pass} passing, 0 failing ---`);
