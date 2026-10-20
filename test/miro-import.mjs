import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";
import { miroFetch, miroFixture, miroBoard } from "./miro-fixture.js";
import { clickControl } from "./menu-controls.mjs";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-miro-browser-"));
const output = process.env.MIRO_OUTPUT || "/tmp/pencils-miro-ui";
await fs.mkdir(output, { recursive: true });
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Miro import checks" });
const calls = [];
const server = createServer(store, {
  auth: new Auth(store, "local", "George"),
  miro: { fetch: miroFetch(miroFixture(), calls), env: {} },
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "webkit" ? webkit : chromium
).launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(15000);
const panel = page.locator("#miro-import-panel");
async function open() {
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Import from Miro", exact: true })
    .click();
  await panel.getByText("Use an access token", { exact: true }).waitFor();
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await clickControl(page.locator("[data-view=board]"));
  await page.locator("#canvas").waitFor();
  await open();
  await panel.locator("summary").click();
  await panel.locator('[name="token"]').fill("fixture-access-token");
  await panel.getByRole("button", { name: "Connect with token" }).click();
  await panel.getByText("Connected to Miro", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(localStorage).includes("fixture-access-token"),
    ),
    false,
  );
  await panel.getByRole("button", { name: "Browse available boards" }).click();
  await panel.locator("[data-miro-board]").selectOption(miroBoard);
  await panel.getByRole("button", { name: "Load board", exact: true }).click();
  await panel.locator("#miro-options").waitFor();
  assert.equal(
    (await store.snapshot(project.id)).boards.length,
    1,
    "preview must not write a canvas",
  );
  assert.equal((await store.snapshot(project.id)).tasks.length, 0);
  assert.ok(await panel.locator(".miro-import-counts").textContent());
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(() => {
      const r = document
        .querySelector("#miro-import-panel")
        .getBoundingClientRect();
      return (
        r.x >= 0 &&
        r.right <= innerWidth + 1 &&
        r.y >= 0 &&
        r.bottom <= innerHeight + 1
      );
    });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      const box = await panel.boundingBox();
      assert.ok(
        box.x >= 0 && box.x + box.width <= width + 1,
        `panel fits ${width}: ${JSON.stringify(box)}`,
      );
      assert.ok(
        box.y >= 0 && box.y + box.height <= 1001,
        "panel stays inside viewport",
      );
      assert.equal(
        await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
      );
      const audit = await new AxeBuilder({ page })
        .include("#miro-import-panel")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      assert.deepEqual(
        audit.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.html),
        })),
        [],
      );
      await page.screenshot({
        path: path.join(output, `miro-${width}-${theme}.png`),
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.locator('[name="cards"]').selectOption("tasks");
  assert.equal(
    await panel.locator('[data-miro="import"]').isDisabled(),
    true,
    "changed options require a fresh preview",
  );
  await panel.getByRole("button", { name: "Update preview" }).click();
  await page.waitForFunction(
    () => !document.querySelector('[data-miro="import"]')?.disabled,
  );
  await panel.getByRole("button", { name: "Import", exact: true }).click();
  await panel.getByRole("button", { name: "Open imported canvas" }).waitFor();
  const snapshot = await store.snapshot(project.id);
  assert.equal(snapshot.boards.length, 2);
  assert.equal(snapshot.tasks.length, 2);
  const board = snapshot.boards.find((b) => b.nodes.length);
  assert.equal(board.nodes.filter((n) => n.type === "image").length, 1);
  assert.equal(await page.locator("#board-select").inputValue(), board.id);
  await panel.getByRole("button", { name: "Open imported canvas" }).click();
  await page.waitForFunction(
    () => !document.querySelector("#miro-import-panel"),
  );
  assert.equal(
    await page
      .locator('[data-feature="board-settings"]')
      .first()
      .evaluate((el) => document.activeElement === el),
    true,
  );
  await page.screenshot({
    path: path.join(output, "miro-imported-canvas.png"),
  });
  const textNode = board.nodes.find(n => n.miro?.item === "text");
  const textColor = await page.locator(`[data-node="${textNode.id}"]`).evaluate(el => getComputedStyle(el).color);
  assert.equal(textColor, "rgb(0, 0, 0)", "text stays readable on a pale imported frame in dark mode");
  await page.locator('[data-pro="attachment-open"]').click();
  await page
    .locator("#attachment-preview [data-preview-download]:visible")
    .waitFor();
  assert.match(
    await page.locator("#attachment-preview-title").textContent(),
    /pdf/i,
  );
  await page.getByRole("button", { name: "Close attachment preview" }).click();
  await open();
  await page.keyboard.press("Escape");
  assert.equal(await panel.count(), 0);
  assert.deepEqual(errors, []);
  assert.ok(
    calls.every((c) => c.method === "GET"),
    "one-time import never writes to Miro",
  );
  console.log(
    "PASS: Miro connection, paginated preview, desktop/mobile light/dark accessibility, task/media import, focus return and no remote writes.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
