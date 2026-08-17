# Haven — Customer App

A home-services marketplace prototype: a single-file React PWA that lets a
customer describe a household problem, get matched to the right service,
book a pro, track the job, and pay — all client-side, no backend.

This is a **working prototype**, not production software. There is no
server, no real payment processing, and no real pro network — job
acceptance, pro replies, and completion details are simulated. See
`HAVEN_MASTER_SPEC.md` for the full product spec and
`HAVEN_JOB_CONTRACT.md` for the data contract shared with the companion
Pro App.

## Quick start

```bash
npm install
npm run build      # generates index.html from home_services_app.jsx
npm test           # runs the audit suite (jsdom, ~140+ assertions)
npm run boot-check  # boots the actual shipped script block
npm run verify      # does all three, in order
```

Then open `index.html` directly in a browser, or serve the repo root with
any static file server. No dev server, no bundler step is required to run
the app itself — only to run the test suite locally.

## Architecture

**`home_services_app.jsx` is the single source of truth.** It's compiled
in-browser at runtime via Babel Standalone (loaded from CDN alongside
React and jsPDF — see `_shell_pre.txt`). There is no build step in the
traditional sense; `build.sh` just stitches the JSX into a self-contained
HTML file:

```
_shell_pre.txt  +  home_services_app.jsx  +  _shell_post.txt  →  index.html
```

**Do not hand-edit `index.html` directly.** Any change belongs in
`home_services_app.jsx` (or the two shell templates for the surrounding
HTML shell). Regenerate with `npm run build` or `bash build.sh`, and let
the sync check (below) confirm the two stayed in sync.

This single-file, no-bundler approach is a deliberate tradeoff for a
fast-iterating prototype: zero install friction, trivial to preview, easy
for an AI pair-programmer to edit as one unit. It will need to become a
real bundled project (Vite, code-splitting, modular files) before this
becomes a production app — see "Known limitations" below.

## Testing

`audit.test.js` mounts the actual compiled app in `jsdom` via
`@testing-library/react` and drives it with real synthetic events —
clicking through booking flows, checking persistence across a simulated
app restart, verifying accessibility attributes, etc. It's a functional
regression suite, not unit tests. Run it after any change:

```bash
npm test
```

If a change is timing-sensitive (gestures, async delays, animations),
run it a few times in a row — a single clean pass doesn't rule out a race
condition the way several consecutive passes does.

`boot_check.js` is a narrower check: it extracts the actual `<script
type="text/babel">` block from the built `index.html` and boots it, to
catch a class of bug where the source compiles fine but the *shipped*
file doesn't (e.g. a stray external script reference that silently fails
under `file://`).

## Files

| File | Purpose |
|---|---|
| `home_services_app.jsx` | Source of truth — the entire app |
| `build.sh` | Regenerates `index.html` from the JSX + shell templates |
| `_shell_pre.txt` / `_shell_post.txt` | HTML shell surrounding the compiled app (CDN script tags, root div, etc.) |
| `audit.test.js` | Functional regression suite (jsdom) |
| `boot_check.js` | Verifies the actual shipped build boots |
| `manifest.json`, `icon-*.png`, `apple-touch-icon.png`, `favicon.ico` | PWA install assets |
| `HAVEN_MASTER_SPEC.md` | Full product spec |
| `HAVEN_JOB_CONTRACT.md` | Job data contract shared with the companion Pro App — **required reading before any change touching jobs, pricing, statuses, tips, inspections, materials, preferences, or timestamps** |

## Known limitations (by design, for now)

- No backend — everything is `localStorage`-persisted and client-simulated.
- Single ~4,700-line file, no code-splitting. Acceptable for a
  fast-iterating prototype; should become a real modular project before
  production.
- No CI yet — run `npm run verify` locally before pushing.
- No service worker — PWA install works, offline support does not.
- React/Babel are loaded as CDN development builds; a production deploy
  should switch to production builds first (low-effort, verified safe —
  see commit history / recent changes).

## Contributing / workflow notes

- Never edit `index.html` or `prototype.html` directly — they're
  generated. Edit `home_services_app.jsx`, then rebuild.
- Extend `audit.test.js` with new numbered `step(...)` blocks for any new
  screen or flow, rather than starting a separate ad hoc verification
  process each time.
- Review `HAVEN_JOB_CONTRACT.md` before any change touching job data —
  keep it updated in the same change if the schema shifts.
