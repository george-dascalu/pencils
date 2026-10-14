import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { reveal, clickControl } from "./menu-controls.mjs";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-header-"));
const store = new Store(root);
await store.init();
const project = await store.demo();
for (let i = 0; i < 24; i++)
  await store.createTask(project.id, { title: `Extra task ${i}` });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.locator(".project-link").first().click();
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  assert.deepEqual(
    await page
      .locator(".view-tab-group")
      .evaluateAll((groups) =>
        groups.map((g) =>
          [...g.querySelectorAll("[data-view]")].map((el) => el.dataset.view),
        ),
      ),
    [
      ["overview"],
      ["list", "tree", "table"],
      ["kanban", "board"],
      ["calendar", "timeline"],
    ],
  );
  const views = [
    "overview",
    "list",
    "tree",
    "table",
    "kanban",
    "board",
    "calendar",
    "timeline",
  ];
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    let header;
    for (const view of views) {
      await page.locator(`[data-view=${view}]`).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      const box = await page.locator(".topbar").boundingBox();
      const actions = await page.locator("#board-project-tools").boundingBox();
      header ||= { box, actions };
      assert.deepEqual(box, header.box, `${view}: shared top bar`);
      assert.deepEqual(
        actions,
        header.actions,
        `${view}: shared project actions`,
      );
      assert.ok(await page.locator(".hero").isHidden());
      assert.equal(await page.locator("[data-action=project-edit]").count(), 1);
      await page.locator("#view-content").waitFor({ state: "visible" });
      const content = await page.locator("#view-content").boundingBox();
      assert.ok(
        content.y < (size.width > 600 ? 160 : 280),
        `${view}: content starts at ${content.y}`,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${view}: horizontal overflow`,
      );
      await page.locator("[data-board-menu=project] > summary").click();
      assert.ok(await page.locator("#saved-view").isVisible());
      const menu = await page
        .locator("[data-board-menu=project] .board-menu-panel")
        .boundingBox();
      assert.ok(menu.x >= 0 && menu.x + menu.width <= size.width);
      await page.keyboard.press("Escape");
      if (!["board", "overview"].includes(view)) {
        await (
          await reveal(page.locator("#filter-assignee"))
        ).fill("No matching owner");
        await page.locator("#filter-assignee").press("Tab");
        await page.waitForFunction(() =>
          document.querySelector("#view-content").textContent.includes("0 of"),
        );
        assert.match(
          await page
            .locator("[data-board-menu=filters] > summary")
            .textContent(),
          /Filters \(1\)/,
        );
        await (await reveal(page.locator("#filter-assignee"))).fill("");
        await page.locator("#filter-assignee").press("Tab");
        await page.waitForFunction(
          () =>
            !document
              .querySelector("#view-content")
              .textContent.includes("0 of"),
        );
        await page.keyboard.press("Escape");
      }
      await page.screenshot({
        path: `/tmp/pencils-header-${size.width}-${view}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("[data-view=list]").click();
  await page.locator(".view-footnote").scrollIntoViewIfNeeded();
  assert.ok(
    await page.locator(".view-footnote").isVisible(),
    "Long views remain scrollable",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await clickControl(page.locator("[data-feature=workflow]"));
  await page.locator("#workflow-form").waitFor();
  await page.locator("[data-action=dialog-close]").first().click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: identical project header across all eight views, desktop/mobile menus, filters, project actions and scrolling",
  );
} catch (e) {
  await page.screenshot({
    path: "/tmp/pencils-project-layout-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
