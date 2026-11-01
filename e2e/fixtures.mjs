// Shared setup for the browser tests (Playwright Test, see playwright.config.mjs).
//
//   import { test, expect, onDevices, useApp } from "../fixtures.mjs";
//   const app = useApp(async (store) => ({ project: await store.createProject({ title: "Demo", key: "DE" }) }));
//   onDevices(["phone", "small"], () => {
//     test("the drawer fits one screen", async ({ page, device }) => {
//       await page.goto(`${app.base}/#project/${app.project.id}/list`);
//       ...
//     });
//   });
//
// useApp starts one server with a temporary vault for the file; whatever the seed function
// returns is added to the app object. onDevices() repeats the tests inside it for each device,
// grouped as "<device> › <title>", each in a fresh browser context. Tests outside it use the
// desktop preset. Every test fails on page errors, console errors and server errors (500 and
// above); a test that expects some lists them with test.use({ allowErrors: [/pattern/] }).
// Touch devices use Chromium with coarse-pointer emulation, or WebKit in the ios project (onDevices
// tags them @touch); desktop devices use the project's browser (Chromium, or Firefox/WebKit in the gate).
// With COVERAGE=1 (npm run e2e:coverage), Chromium pages record which code of the app's modules ran.
import { test as base, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { records, merge, flatten } from "../scripts/browser-coverage.mjs";

export { expect };

export const devices = {
  phone: { width: 390, height: 844, touch: true },
  small: { width: 360, height: 640, touch: true },
  ipad: { width: 1024, height: 768, touch: true },
  "ipad-portrait": { width: 820, height: 1180, touch: true },
  narrow: { width: 860, height: 800, touch: false },
  desktop: { width: 1440, height: 900, touch: false },
};
// Coarse pointer and no hover, as on phones and iPads.
const touchArgs = ["--no-sandbox", "--touch-events=enabled", "--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1"];

export const test = base.extend({
  // Which preset the page uses. Set with check(), or test.use({ device: "phone" }).
  device: ["desktop", { option: true }],
  // Exact viewport, when a test needs a size between the presets: test.use({ viewportSize: { width, height } }).
  viewportSize: [null, { option: true }],
  // Pixel density, e.g. test.use({ deviceScaleFactor: 2 }) for a retina iPad.
  deviceScaleFactor: [undefined, { option: true }],
  // Errors a test expects (see page below), as regular expressions.
  allowErrors: [[], { option: true }],
  // The engine touch devices use: "chromium", or "webkit" (the ios project).
  touchEngine: ["chromium", { option: true, scope: "worker" }],
  touchBrowser: [async ({ playwright, touchEngine, launchOptions }, use) => {
    let browser;
    await use(async () => (browser ||= await (touchEngine === "webkit" ? playwright.webkit.launch(launchOptions) : playwright.chromium.launch({ args: touchArgs }))));
    await browser?.close();
  }, { scope: "worker" }],
  // What this worker's pages ran, written to test-results/coverage when the worker ends.
  coverage: [async ({}, use, workerInfo) => {
    const merged = new Map();
    await use(merged);
    if (!merged.size) return;
    const folder = path.join(workerInfo.project.outputDir, "coverage");
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, `worker-${workerInfo.workerIndex}.json`), JSON.stringify(flatten(merged)));
  }, { scope: "worker" }],
  context: async ({ browser, touchBrowser, device, viewportSize, deviceScaleFactor }, use) => {
    const { width, height, touch } = devices[device];
    const owner = touch ? await touchBrowser() : browser;
    // British dates and London time, as on the owner's devices.
    const context = await owner.newContext({ viewport: viewportSize || { width, height }, deviceScaleFactor, hasTouch: touch, isMobile: touch, reducedMotion: "reduce", locale: "en-GB", timezoneId: "Europe/London" });
    // Tests that drive Chromium's DevTools protocol (raw touches, pinches, pens) skip in other engines.
    if (owner.browserType().name() !== "chromium") context.newCDPSession = () => test.skip(true, "needs Chromium's DevTools protocol");
    await use(context);
    await context.close();
  },
  page: async ({ context, allowErrors, device, coverage }, use) => {
    const page = await context.newPage();
    const measure = process.env.COVERAGE === "1" && context.browser()?.browserType().name() === "chromium";
    if (measure) await page.coverage.startJSCoverage({ resetOnNavigation: false });
    page.setDefaultTimeout(12000);
    // Mobile WebKit has no mouse wheel.
    if (context.browser()?.browserType().name() === "webkit" && devices[device].touch) page.mouse.wheel = () => test.skip(true, "mobile WebKit has no mouse wheel");
    const errors = [], checks = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Browsers log each refused request as "Failed to load resource": refusals (4xx) are part of
    // many flows, and server errors are caught from the responses instead.
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) errors.push(`console: ${message.text()}`);
    });
    // A response a test fakes with page.route has no server address and is the test's own.
    page.on("response", (response) => {
      if (response.status() >= 500)
        checks.push(response.serverAddr().then((address) => address && errors.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`)));
    });
    await use(page);
    if (measure) merge([records(await page.coverage.stopJSCoverage().catch(() => []))], coverage);
    await Promise.allSettled(checks);
    expect(errors.filter((error) => !allowErrors.some((pattern) => pattern.test(error))), "no page, console or server errors").toEqual([]);
  },
});

export async function startApp(name = "app") {
  process.env.AUTH_MODE ||= "single-user";
  process.env.LOCAL_USER_NAME ||= "George";
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `pencils-${name}-`));
  const store = new Store(root);
  await store.init();
  const server = createServer(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    store,
    root,
    server,
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      await store.close?.();
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

// One server and vault for the tests in this file (per worker). The seed's result is merged in.
export function useApp(seed = async () => ({})) {
  const app = {};
  test.beforeAll(async ({}, testInfo) => {
    Object.assign(app, await startApp(path.basename(testInfo.file, ".spec.mjs")));
    Object.assign(app, await seed(app.store, app));
  });
  test.afterAll(async () => app.close?.());
  return app;
}

// Repeats the tests registered in `tests` for each device: onDevices(["phone", "desktop"], () => { test(...) }).
export function onDevices(deviceNames, tests) {
  for (const device of deviceNames) {
    if (!devices[device]) throw new Error(`Unknown device ${device}`);
    // Touch devices are tagged @touch, which the ios project runs in WebKit.
    test.describe(device, devices[device].touch ? { tag: "@touch" } : {}, () => {
      test.use({ device });
      tests(device);
    });
  }
}
