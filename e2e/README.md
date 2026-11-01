# Browser tests

Playwright Test, one folder per area (`board`, `documents`, `tasks`, `lists`, `planning`, `navigation`, `settings`, `platform`, `ui`). Unit tests stay in `test/*.test.js` (`npm test`).

```bash
npm run e2e                                # every test in Chromium except @heavy, 8 workers, failures retried once and reported as flaky
npm run e2e:affected                       # only the areas your changes since the last release need (scripts/affected.mjs; npm run release runs it too)
HEAVY=1 npm run e2e -- e2e/platform        # include the @heavy scale tests (100,000-object boards, 100 members)
npm run e2e -- e2e/board                   # a folder or file
npm run e2e -- -g "drawer"                 # tests whose title matches
npx playwright show-trace test-results/…/trace.zip   # what a failed test saw, step by step
npx playwright test --project=audit        # audits (tag @audit): they report findings rather than guard a change
npx playwright test --project=docker       # the offline Docker image check (changes host networking, so never alongside other tests)
npm run test:release                       # the batch check: checks, unit tests, every test including @heavy, @gate tests in Firefox/WebKit, Docker
npm run e2e:coverage -- e2e/board          # how much of each public/ module the tests run in Chromium, least first, and the modules no page loads
```

## Writing a test

See `e2e/navigation/phone-drawer.spec.mjs` and `e2e/board/board-search.spec.mjs`.

```js
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

// One server and temporary vault for this file. Whatever the seed returns is added to `app`.
const app = useApp(async (store) => ({ project: await store.createProject({ title: "Demo", key: "DE" }) }));

test("a desktop test", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await expect(page.locator(".task-row")).toHaveCount(0);
});

onDevices(["phone", "ipad", "desktop"], () => {
  test("repeated per device", async ({ page, device }) => { /* ... */ });
});
```

- Devices: `phone` 390×844, `small` 360×640, `ipad` 1024×768, `ipad-portrait` 820×1180 (touch, coarse pointer), `narrow` 860×800, `desktop` 1440×900. Tests outside `onDevices` use `desktop`. For another size: `test.use({ viewportSize: { width, height } })`.
- Browsers run with the en-GB locale and Europe/London time. Each test gets a fresh page and fails on any page error. Tests in a file run in order and share the file's server, so seed what a test needs instead of relying on an earlier test, or mark the file `test.describe.configure({ mode: "serial" })` when the steps truly form one journey.
- Wait for state, not time: `await expect(locator).toBeVisible()`, `toHaveText`, `toHaveAttribute`, `toBeFocused`, `expect.poll(() => app.store.snapshot(id))`, `page.waitForFunction`. Use `page.waitForTimeout` only when nothing observable changes (for example, proving that something does *not* happen), with a comment saying why; wait for a request or response with `page.waitForRequest`/`waitForResponse`.
- Every test fails on page errors, `console.error` and server errors (500 and above, except responses the test fakes with `page.route`). A test that expects some lists them: `test.use({ allowErrors: [/pattern/] })`. Only the test's `page` is watched: check other pages it opens (`context.newPage()`, popups) itself.
- Seeded dates are fixed (October 2026), and today moves on: after a reload, go back to the seeded month or week instead of relying on the view opening on today.
- The batch check (`RELEASE=1`) fails on flaky tests (`failOnFlakyTests`): fix them instead of rerunning.
- Phone and iPad tests run in WebKit too: `npx playwright test --project=ios` (once per host: `scripts/webkit-local.sh`). Calls to `newCDPSession` skip the test outside Chromium, and so does the mouse wheel on mobile WebKit. WebKit runs without the desktop's session bus, so a failed desktop service can't slow it down.
- Name tests after the behaviour, as a sentence. Start the file with a comment naming the owner request or the rule it guards.
- Tag tests that belong in the cross-browser release gate with `{ tag: "@gate" }`, and slow scale tests (many objects or users) with `{ tag: "@heavy" }` so they run in the batch check rather than on every change.
- Shared helpers for menus, the New menu and the card editor are in `e2e/helpers/`.
