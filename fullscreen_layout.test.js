#!/usr/bin/env node
"use strict";

/**
 * iPhone full-screen layout check (Customer, home-screen app).
 *
 * The app draws under the iPhone status bar (viewport-fit=cover with a
 * translucent status bar), so:
 * (1) the shell keeps viewport-fit=cover and keeps pinch zoom available;
 * (2) the status bar is black-translucent, which iOS always draws in white;
 * (3) the strip behind the status bar is dark in both themes, so the white
 *     clock and battery stay readable (navy in light mode);
 * (4) the bottom tab bar clears the home indicator without growing on phones
 *     that have no inset (min 20px, the previous fixed value);
 * (5) desktop preview keeps its 390x844 phone frame.
 *
 * jsdom drops env() from styles, so these rules are read from the source.
 * This does not replace a check on a real iPhone.
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; console.log("✓ " + msg); }
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8");

try {
  const shell = read("_shell_pre.txt");
  const vp = (shell.match(/<meta[^>]+name="viewport"[^>]*>/i) || [""])[0];
  ok(/viewport-fit=cover/.test(vp), "viewport-fit=cover is set (env() safe-area insets work)");
  ok(!/maximum-scale|user-scalable\s*=\s*(no|0)/i.test(vp), "pinch zoom is not disabled");
  const sb = shell.match(/name="apple-mobile-web-app-status-bar-style"\s+content="([^"]+)"/g) || [];
  ok(sb.length === 1, "exactly one status-bar-style tag");
  ok(/content="black-translucent"/.test(sb[0] || ""), "status bar is black-translucent");

  const jsx = read("home_services_app.jsx");
  ok(/paddingTop:"env\(safe-area-inset-top\)",background:\(topIsDark\|\|!isDark\)\?N:W/.test(jsx),
    "strip behind the status bar is navy in light mode and on dark-topped screens");
  const nav = jsx.slice(jsx.indexOf("const bottomNav=()=>("), jsx.indexOf("const bottomNav=()=>(") + 400);
  ok(/paddingBottom:"max\(20px, calc\(env\(safe-area-inset-bottom\) - 14px\)\)"/.test(nav),
    "bottom tab bar clears the home indicator (never less than 20px)");
  ok(/haven-frame-phone" style=\{\{width:390,height:844/.test(jsx), "desktop preview keeps the 390x844 phone frame");

  console.log(`--- Full-screen layout: ${passed} passing, 0 failing ---`);
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
}
