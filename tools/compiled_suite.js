#!/usr/bin/env node
"use strict";
/**
 * Runs every check in `npm run verify` against the compiled production page
 * (index.html) instead of the JSX source page.
 *
 * Most checks mount prototype.html's <script type="text/babel"> block in
 * jsdom. This makes a temporary copy of the repo whose prototype.html IS the
 * built index.html, with the compiled app block relabelled text/babel so the
 * checks find it (the code inside is byte-for-byte what ships), then runs
 * every check there. audit.test.js, which compiles the source files itself,
 * uses the same esbuild compile in this mode (HAVEN_COMPILED_SUITE=1).
 * A check that only passes on the Babel-compiled source fails here.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const all = [pkg.scripts["boot-check"], pkg.scripts.test, pkg.scripts.verify].join(" && ");
const checks = [...new Set([...all.matchAll(/node ([\w./-]+\.js)/g)].map(m => m[1]))]
  // These check the build itself (they already run on the real index.html).
  .filter(c => !/(compiled_suite|production_build\.test)\.js$/.test(c));

const built = fs.readFileSync(path.join(root, "index.html"), "utf8");
const OPEN = '<script type="text/plain" id="haven-app">';
if (built.split(OPEN).length !== 2) throw new Error("compiled app block not found in index.html; run npm run build");
if (built.includes('type="text/babel"') || /babel(\.min)?\.js/.test(built)) throw new Error("index.html still references Babel");
// The jsdom checks cut the page's final render call off by matching its JSX text
// (`root.render(<ErrorBoundary><App/></ErrorBoundary>)`). That call is shell, not
// app code; restore its source spelling so the checks can find and remove it.
const TAIL_COMPILED = 'const root = ReactDOM.createRoot(document.getElementById("root"));\nroot.render(/* @__PURE__ */ React.createElement(ErrorBoundary, null, /* @__PURE__ */ React.createElement(App, null)));\n</script>';
const TAIL_SOURCE = "const root = ReactDOM.createRoot(document.getElementById('root'));\nroot.render(<ErrorBoundary><App/></ErrorBoundary>);\n</script>";
if (built.split(TAIL_COMPILED).length !== 2) throw new Error("compiled render call not found at the end of the app block");
const asSource = built.replace(OPEN, '<script type="text/babel">').replace(TAIL_COMPILED, TAIL_SOURCE);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "haven-customer-compiled-"));
for (const name of fs.readdirSync(root)) {
  if (name === ".git" || name === "node_modules" || /\.pdf$/.test(name)) continue;
  fs.cpSync(path.join(root, name), path.join(tmp, name), { recursive: true });
}
fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"));
fs.writeFileSync(path.join(tmp, "prototype.html"), asSource);

let failed = 0;
for (const c of checks) {
  try {
    execFileSync(process.execPath, [c], { cwd: tmp, stdio: "pipe", env: { ...process.env, HAVEN_COMPILED_SUITE: "1" }, timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
    console.log("  compiled ok: " + c);
  } catch (e) {
    failed++;
    console.log("  COMPILED FAIL: " + c + "\n" + String(e.stdout || "").slice(-1500) + String(e.stderr || "").slice(-1500));
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`--- Compiled build: ${failed} check(s) failed ---`); process.exit(1); }
console.log(`OK: all ${checks.length} checks pass on the compiled production page.`);
