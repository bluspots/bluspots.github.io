/**
 * CAT-01 F1 (Customer): shared service taxonomy registry.
 *
 * - service_taxonomy.js is byte-identical to the Pro app's copy: both repos pin
 *   the same SHA-256 (PARITY_SHA256 below = haven-pro tools/service_taxonomy_check.js).
 * - 16 approved keys; all 61 catalog tasks map exactly as in the founder-approved
 *   matrix (encoded independently here); emergency options; legacy labels with
 *   ambiguous ones mapped to no key.
 * - Compatibility: every Customer category label in use today (CATS, JOB_CATS,
 *   the "General" posting fallback, each task's label) is covered by the registry.
 * - Behavior-neutral: the registry is not in the build or the shipped pages, and
 *   the app's category constants and posting code are unchanged.
 */
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const read = f => fs.readFileSync(f, 'utf8');

// Same constant in haven-pro/tools/service_taxonomy_check.js.
const PARITY_SHA256 = '3fc83215c0370f6ca10d3e56a10c0cc4654eb705ffbe3d16c665c1a9c5bbc697';

const src = read('service_taxonomy.js');
ok(crypto.createHash('sha256').update(src).digest('hex') === PARITY_SHA256, 'service_taxonomy.js matches the pinned shared hash (identical to the Pro copy)');
const T = require('./service_taxonomy.js');

// ── Approved keys and matrix (independent of the registry file) ─────────────
const APPROVED_KEYS = ['plumbing', 'electrical', 'hvac', 'appliance', 'handyman', 'assembly', 'installation', 'tv_mounting', 'smart_home', 'cleaning', 'landscaping', 'painting', 'flooring', 'moving', 'maintenance', 'pest_control'];
const APPROVED_MATRIX = {
  assembly: [1, 2, 3, 4, 5], installation: [7, 8, 9, 10], tv_mounting: [6], smart_home: [11, 12, 13, 14],
  plumbing: [15, 16, 17, 18, 19, 52], electrical: [20, 21, 22, 23, 54, 57], painting: [24, 25, 26], flooring: [27, 28, 29],
  cleaning: [30, 31, 32, 33, 59, 60, 61], landscaping: [34, 35, 36, 37], moving: [38, 39, 40], handyman: [41, 42, 43, 44, 56, 58],
  hvac: [45, 53], maintenance: [46, 47, 48], appliance: [49, 50, 55], pest_control: [51],
};
const keys = T.HAVEN_SERVICE_CATEGORIES.map(c => c.key);
ok(keys.length === 16 && new Set(keys).size === 16 && JSON.stringify(keys) === JSON.stringify(APPROVED_KEYS), '16 approved keys, unique, in the approved order');
ok(keys.every(k => /^[a-z]+(_[a-z]+)*$/.test(k)), 'keys are lowercase snake_case');
const labels = T.HAVEN_SERVICE_CATEGORIES.map(c => c.label);
ok(new Set(labels).size === 16 && labels.every((l, i) => l && l !== keys[i]), 'display labels are separate from keys and distinct');
ok(Object.isFrozen(T.HAVEN_SERVICE_CATEGORIES) && Object.isFrozen(T.HAVEN_TASK_SERVICE_KEYS), 'registry tables are frozen');
const mapped = Object.keys(T.HAVEN_TASK_SERVICE_KEYS).map(Number).sort((a, b) => a - b);
ok(mapped.length === 61 && mapped.every((id, i) => id === i + 1), 'task ids 1–61 each mapped exactly once');
let matrixOk = true;
for (const [k, ids] of Object.entries(APPROVED_MATRIX)) for (const id of ids) if (T.HAVEN_TASK_SERVICE_KEYS[id] !== k) { matrixOk = false; console.error('    task', id, 'expected', k, 'got', T.HAVEN_TASK_SERVICE_KEYS[id]); }
ok(matrixOk && Object.values(APPROVED_MATRIX).flat().length === 61, 'every task matches the founder-approved matrix');
ok(Object.values(T.HAVEN_TASK_SERVICE_KEYS).every(k => APPROVED_KEYS.includes(k)), 'every task maps to an approved key');
ok(APPROVED_KEYS.every(k => Object.values(T.HAVEN_TASK_SERVICE_KEYS).includes(k)), 'every approved key has at least one catalog service');
ok(T.HAVEN_TASK_OPEN_DECISIONS[45] && T.HAVEN_TASK_OPEN_DECISIONS[17], 'open founder decisions (tasks 45, 17) are flagged, not treated as final');
ok(T.HAVEN_TASK_CAPABILITY_NOTES[3] && /opt-in/.test(T.HAVEN_TASK_CAPABILITY_NOTES[3]), 'home gym (task 3) is not implied by legacy Furniture Assembly');
ok(JSON.stringify(T.HAVEN_OPT_IN_ONLY_KEYS) === JSON.stringify(['installation', 'flooring', 'maintenance', 'pest_control']), 'new keys are opt-in only');
ok(T.havenServiceKeyForTask(53) === 'hvac' && T.havenServiceKeyForTask('6') === 'tv_mounting' && T.havenServiceKeyForTask(999) === null, 'lookup by task id (never by title)');

// ── Compatibility with the Customer app's current definitions ───────────────
const sb = {}; vm.createContext(sb);
vm.runInContext(read('catalog_seeds.js') + '\n;globalThis.__TASKS = TASKS;', sb);
vm.runInContext(read('locked_constants.js') + '\n;globalThis.__CATS = CATS;', sb);
const TASKS = sb.__TASKS, CATS = sb.__CATS;
ok(TASKS.length === 61 && JSON.stringify(TASKS.map(t => t.id).sort((a, b) => a - b)) === JSON.stringify(mapped), 'registry covers exactly the 61 catalog tasks in catalog_seeds.js');
const app = read('home_services_app.jsx');
const jobCats = eval(app.match(/const JOB_CATS=(\[[^\n]*\]);/)[1].replace('...CATS.filter(c=>c!=="All")', '...' + JSON.stringify(CATS.filter(c => c !== 'All'))));
const used = new Set([...CATS.filter(c => c !== 'All'), ...jobCats, 'General', ...TASKS.map(t => t.c)]);
ok([...used].every(l => T.havenLegacyLabelInfo(l, 'customer')), 'every Customer category label in use (CATS, JOB_CATS, "General", task labels) is in the registry');
const AMBIG = ['Repair', 'Installation', 'Maintenance', 'Other', 'General'];
ok(AMBIG.every(l => { const i = T.havenLegacyLabelInfo(l, 'customer'); return i.kind === 'ambiguous' && i.key === null; }), 'ambiguous legacy labels (Repair, Installation, Maintenance, Other, General) map to no key');
let consistent = true;
for (const t of TASKS) { const info = T.havenLegacyLabelInfo(t.c, 'customer'); if (info.kind === 'exact' && info.key !== T.HAVEN_TASK_SERVICE_KEYS[t.id]) { consistent = false; console.error('    task', t.id, t.c, '→', info.key, 'vs', T.HAVEN_TASK_SERVICE_KEYS[t.id]); } }
ok(consistent, 'every task with an unambiguous label maps to that label\'s key');
ok(T.havenLegacyLabelInfo('Not a category', 'customer') === null, 'unknown labels give no mapping');

// Emergency options (read from the app's EMERGENCY_OPTIONS).
const emSrc = app.slice(app.indexOf('const EMERGENCY_OPTIONS=['), app.indexOf('];', app.indexOf('const EMERGENCY_OPTIONS=[')) + 2);
const em = vm.runInNewContext(emSrc + '\n;EMERGENCY_OPTIONS;');
ok(em.length === 6 && em.every(o => Object.prototype.hasOwnProperty.call(T.HAVEN_EMERGENCY_SERVICE_KEYS, o.key)), 'all 6 emergency options are in the registry');
ok(em.every(o => (o.taskId ? T.HAVEN_EMERGENCY_SERVICE_KEYS[o.key] === T.HAVEN_TASK_SERVICE_KEYS[o.taskId] : T.HAVEN_EMERGENCY_SERVICE_KEYS[o.key] === null)), 'catalog-backed emergencies use their task\'s key; custom ones (locked out, other) are unclassified');

// Pro labels (registry side; the Pro repo checks them against its own constants).
ok(T.havenLegacyLabelInfo('Furniture Assembly', 'pro').kind === 'capability_subset' && T.havenLegacyLabelInfo('Furniture Assembly', 'pro').capability === 'furniture_only', 'Pro "Furniture Assembly" is a furniture-only assembly capability');
ok(Object.values(T.HAVEN_LEGACY_PRO_LABELS).every(i => i.key && APPROVED_KEYS.includes(i.key)), 'every legacy Pro label maps to an approved key');

// ── Behavior-neutral ─────────────────────────────────────────────────────────
ok(!/service_taxonomy/.test(read('build.sh')), 'not part of the build');
for (const f of ['index.html', 'prototype.html']) ok(!/HAVEN_SERVICE_CATEGORIES|HAVEN_TASK_SERVICE_KEYS|havenServiceKeyForTask/.test(read(f)), f + ': registry not shipped');
ok(!/HAVEN_SERVICE_CATEGORIES|havenServiceKeyForTask|havenLegacyLabelInfo|service_key/.test(app), 'app code does not use the registry (posting/category behavior unchanged)');
ok(/category:cat\|\|"General",/.test(app), 'posting still sends the legacy category exactly as before');

console.log(`--- CAT-01 F1 taxonomy registry: ${pass} passing, ${fail} failing ---`);
process.exit(fail ? 1 : 0);
