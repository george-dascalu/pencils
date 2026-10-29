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
// desktop preset. Every test fails on page errors.
// Touch devices always use Chromium with coarse-pointer emulation; desktop devices use the
// project's browser (Chromium, or Firefox/WebKit in the release gate).
import { test as base, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

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
  touchBrowser: [async ({ playwright }, use) => {
    let browser;
    await use(async () => (browser ||= await playwright.chromium.launch({ args: touchArgs })));
    await browser?.close();
  }, { scope: "worker" }],
  context: async ({ browser, touchBrowser, device, viewportSize, deviceScaleFactor }, use) => {
    const { width, height, touch } = devices[device];
    const owner = touch ? await touchBrowser() : browser;
    // British dates and London time, as on the owner's devices.
    const context = await owner.newContext({ viewport: viewportSize || { width, height }, deviceScaleFactor, hasTouch: touch, isMobile: touch, reducedMotion: "reduce", locale: "en-GB", timezoneId: "Europe/London" });
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    expect(errors, "no page errors").toEqual([]);
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
    test.describe(device, () => {
      test.use({ device });
      tests(device);
    });
  }
}
