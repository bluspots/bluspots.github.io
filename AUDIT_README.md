# Verification Tooling
**Last verified:** this update — assertion count and async note below are
checked against actual `audit.test.js` output, not carried over from an
earlier version of this file.

To re-run these checks yourself (not required to use the app — these are
developer-side verification only):

```bash
npm install --no-save jsdom @testing-library/react@14 @testing-library/dom react@18.3.1 react-dom@18.3.1 @babel/core @babel/preset-react
node audit.test.js    # functional navigation audit — 110 passing assertions
node boot_check.js    # boots the actual prototype.html script block
./build.sh            # regenerates prototype.html from home_services_app.jsx
```

The suite takes roughly 25–30 seconds to run (several phases simulate real
async delays — message replies, tip processing, gesture settle animations
— rather than faking them). Run it more than once if you're touching
timing-sensitive code; a single clean run doesn't rule out a race condition
the way several consecutive clean runs does.

**Async test utilities** (`waitForCondition`, `nextTick`, `delay`,
`waitForNewReply`) are available near the top of the file for any new
`step(...)` block that needs to wait on something async. Prefer
`waitForCondition` (polls for the real condition, resolves as soon as it's
true) over a fixed `setTimeout`/`delay` wherever the effect you're waiting
for is actually observable in the DOM — a fixed wait is only the right
tool when there's genuinely nothing to observe yet (e.g., an effect that
happens on a screen you've already navigated away from). A fixed wait that
races a real animation/timer duration too closely is a latent flaky test,
not a stable one, even if it usually passes locally.

Repeat this method for future slices per the v0.13 blueprint's own instruction:
extend `audit.test.js` with new `step(...)` blocks for any new screen or flow,
rather than starting a new ad-hoc verification process each time.
