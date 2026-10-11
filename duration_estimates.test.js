#!/usr/bin/env node
"use strict";
/**
 * Job durations shown to customers come only from the service catalog.
 * - Catalog ranges ("2-3 hrs", "4-6 hrs") are shown as those ranges (they used
 *   to fall through to a made-up "30 min–2 hrs").
 * - "Varies" and custom jobs have no catalog time, so no number is shown.
 * - The On-the-way card labels the time as an estimate, separate from arrival.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "home_services_app.jsx"), "utf8");
const catalog = fs.readFileSync(path.join(__dirname, "catalog_seeds.js"), "utf8");
let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; console.log("  ✓ " + m); };
function grab(name) {
  const i = src.indexOf(`const ${name}=`);
  assert.ok(i >= 0, name + " not found");
  let depth = 0, j = src.indexOf("{", src.indexOf("=>", i));
  for (let k = j; k < src.length; k++) { if (src[k] === "{") depth++; else if (src[k] === "}") { depth--; if (!depth) return src.slice(i, k + 1) + ";"; } }
}
const fns = new Function(`${grab("getExpectedDuration")}\n${grab("formatDurationRange")}\n${grab("durationText")}\nreturn {getExpectedDuration,formatDurationRange,durationText};`)();
const { getExpectedDuration: g, durationText: dt } = fns;

ok(dt("4-6 hrs") === "4 hrs–6 hrs", "4-6 hrs shows 4 hrs–6 hrs (got " + dt("4-6 hrs") + ")");
ok(dt("2-3 hrs") === "2 hrs–3 hrs", "2-3 hrs shows 2 hrs–3 hrs");
ok(dt("1-2 hrs") === "1 hr–2 hrs", "1-2 hrs shows 1 hr–2 hrs");
ok(dt("Varies") === "Varies by job" && dt(undefined) === "Varies by job", "Varies/custom: no number");
// Every catalog time string parses to something from the catalog, never the old 30–120 fallback.
const times = [...new Set((catalog.match(/\bt:"[^"]*"/g) || []).map(x => x.slice(3, -1)))];
const bad = times.filter(t => t !== "Varies" && g(t).durationConfidence !== "high");
ok(bad.length === 0, "every catalog time is read from the catalog (" + times.length + " distinct values; unparsed: " + (bad.join(", ") || "none") + ")");
ok(/Typical job length \(estimate\)/.test(src) && !/Job length, once there/.test(src), "On the way card labels the time as an estimate");
ok(/durationConfidence!=="low"/.test(src.slice(src.indexOf("Honest arrival card"), src.indexOf("Typical job length"))), "On the way card hides job length for Varies/custom jobs");
ok(!/getArrivalSim|minutesAway|milesAway|etaTick/.test(src), "no simulated arrival countdown or distance left in the app");
console.log("OK: duration estimate checks passed (" + passed + " assertions).");
