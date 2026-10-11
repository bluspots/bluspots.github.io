#!/usr/bin/env node
"use strict";
/**
 * Dark mode: the selected option in the Bookings filter, booking times,
 * job categories and "Would you hire again?" must be visibly selected.
 * Navy (#1C2B3A) on the dark card (#1B242E) was nearly invisible, so dark mode
 * uses the selection blue already used for a selected address or card.
 * Light mode keeps solid navy. Each chip reports its state to VoiceOver.
 */
const fs = require("fs"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "home_services_app.jsx"), "utf8");
let passed = 0; const ok = (c, m) => { assert.ok(c, m); passed++; console.log("  ✓ " + m); };
ok(/const CHIP_ON = isDark \? SELBG : N;/.test(src), "selected fill: SELBG in dark, navy in light");
ok(/const CHIP_ON_EDGE = isDark \? SELBORDER : N;/.test(src), "selected edge: SELBORDER in dark, navy in light");
ok(!/background:a\?N:/.test(src), "no option chip still uses plain navy when selected");
for (const [name, re] of [
  ["Bookings filter", /onClick=\{\(\)=>setBFilter\(id\)\}[^>]*background:a\?CHIP_ON:W/],
  ["booking time", /onClick=\{\(\)=>setTpid\(p\.id\)\}[^>]*background:a\?CHIP_ON:W/],
  ["job category", /onClick=\{\(\)=>setCcat\(c\)\}[^>]*background:a\?CHIP_ON:BG/],
  ["hire again", /onClick=\{\(\)=>setHireAgain\(a\?null:val\)\}[^>]*background:a\?CHIP_ON:BG/],
]) {
  ok(re.test(src), name + " chip uses the theme-aware selected fill");
  ok(new RegExp("aria-pressed=\\{a\\} " + re.source.slice(0, 20).replace(/\\\(\\\)=>.*/, "")).test(src) || src.includes("aria-pressed={a} onClick={()=>" + { "Bookings filter": "setBFilter(id)", "booking time": "setTpid(p.id)", "job category": "setCcat(c)", "hire again": "setHireAgain(a?null:val)" }[name]), name + " chip says pressed / not pressed");
}
ok(/const SELBORDER = isDark \? "#3D71AB"/.test(src), "dark SELBORDER is #3D71AB");
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const L = h => { const [r, g, b] = hex(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
ok(cr("#3D71AB", "#1B242E") >= 3, "dark selected edge vs card (SELBORDER #3D71AB): " + cr("#3D71AB", "#1B242E").toFixed(2) + ":1 (≥3:1 for UI components)");
ok(cr("#FFFFFF", "#1E3A5F") >= 4.5, "white label on dark selected fill: " + cr("#FFFFFF", "#1E3A5F").toFixed(2) + ":1");
console.log("OK: dark selected chip checks passed (" + passed + " assertions).");
