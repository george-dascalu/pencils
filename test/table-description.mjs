import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-table-description-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Descriptions" });
const body = "# First paragraph\n\n**Second** paragraph with [a link](https://example.com).\n\n[Notes](../attachments/a-abc.txt)\n";
const task = await store.createTask(project.id, { title: "Detailed task", body });
const empty = await store.createTask(project.id, { title: "Empty task" });
await store.createTask(project.id, { title: "Long task", body: "Long description. ".repeat(100) });
const legacyColumns = [{ key: "key", width: 120 }, { key: "title", width: 220 }, { key: "priority", width: 110, visible: false }];
await store.updateProject(project.id, {
  revision: (await store.snapshot(project.id)).project.revision,
  views: [{ id: "legacy", name: "Legacy view", view: "table", columns: legacyColumns }],
});
const server = createServer(store);
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const kind = process.env.BROWSER || "chromium";
const browser = await { chromium, webkit }[kind].launch();
const errors = [];
const saved = async () => (await store.snapshot(project.id)).tasks.find(t => t.id === task.id);
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw Error("Timed out");
}
try {
  for (const width of [1500, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width === 390 });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", e => errors.push(e.message));
    const row = () => page.locator(`[data-table-task="${task.id}"]`);
    const preview = () => row().locator(".table-description");
    await page.goto(`${base}/#project/${project.id}/table`);
    await row().waitFor();
    if (width === 390) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
    await page.locator("#saved-view").selectOption("legacy");
    assert.deepEqual(await page.locator("thead th[data-column-key]").evaluateAll(els => els.slice(0, 3).map(el => el.dataset.columnKey)), ["key", "title", "body"]);
    assert.equal(await page.locator('thead th[data-column-key="priority"]').count(), 0);
    assert.equal(await page.locator('[data-resize-column="title"]').getAttribute("aria-valuenow"), "220");
    assert.equal(await page.locator('[data-resize-column="body"]').getAttribute("aria-valuenow"), "300");
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
      assert.match(await preview().textContent(), /First paragraph Second paragraph with a link\./);
      assert.doesNotMatch(await preview().textContent(), /Notes|attachments|\*\*/);
      assert.equal(await preview().locator("a,img,script").count(), 0);
      assert.equal(await page.locator(`[data-table-task="${empty.id}"] .table-description`).textContent(), "Add a description…");
      const heights = await page.locator("[data-table-task]").evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
      assert.ok(Math.max(...heights) <= (width === 390 ? 48 : 33), `Compact rows: ${heights}`);
      await preview().scrollIntoViewIfNeeded();
      if (width === 390) await preview().tap();
      else {
        await row().locator('[data-column-key="body"]').focus();
        await page.keyboard.press("Enter");
      }
      await page.locator("#task-form").waitFor();
      assert.equal(await page.locator('#task-form [name="body"]').inputValue(), (await saved()).body);
      assert.ok(await page.locator('[data-attachment-file="a-abc.txt"]').isVisible());
      await page.locator('[data-action="dialog-close"]').click();
      await page.locator("#task-form").waitFor({ state: "detached" });
      await preview().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/pencils-table-description-${width}-${theme}-${kind}.png` });
    }
    assert.equal((await saved()).body, body);
    // Editing goes through the shared rich editor and preserves attachment links.
    await preview().click();
    await page.locator("#task-form .inline-rich").fill("Updated description\nSecond line");
    await until(async () => (await saved()).body.includes("Updated description"));
    assert.match((await saved()).body, /\[Notes\]\(\.\.\/attachments\/a-abc.txt\)/);
    await page.locator('[data-action="dialog-close"]').click();
    await until(async () => (await preview().textContent()).includes("Updated description"));
    // Columns and saved views keep the added field like the existing columns.
    await page.locator('[data-board-menu="table-columns"] > summary').click();
    await page.locator('[data-column-visible="body"]').uncheck();
    assert.equal(await page.locator('thead th[data-column-key="body"]').count(), 0);
    await page.locator('[data-column-visible="body"]').check();
    await page.locator('[data-feature="columns-close"]').click();
    await page.locator('[data-column-drag="body"]').focus();
    await page.keyboard.press("Alt+ArrowRight");
    const order = await page.locator("thead th[data-column-key]").evaluateAll(els => els.map(el => el.dataset.columnKey));
    assert.equal(order[3], "body");
    await page.locator('[data-feature="view-save-as"]').click();
    await page.locator('#view-form [name="name"]').fill(`Descriptions ${width} ${kind}`);
    await page.locator('#view-form [name="scope"]').selectOption("project");
    await page.locator('#view-form [type="submit"]').click();
    await page.locator("#view-form").waitFor({ state: "detached" });
    const view = (await store.snapshot(project.id)).project.views.at(-1);
    assert.equal(view.columns.find(c => c.key === "body").width, 300);
    await page.reload();
    await row().waitFor();
    assert.deepEqual(await page.locator("thead th[data-column-key]").evaluateAll(els => els.map(el => el.dataset.columnKey)), order);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export matching CSV" }).click();
    const csv = await fs.readFile(await (await download).path(), "utf8");
    assert.match(csv, /Description/);
    assert.match(csv, /Updated description/);
    assert.match(csv, /attachments\/a-abc.txt/);
    await context.close();
    await store.updateTask(project.id, task.id, { body, revision: (await saved()).revision });
  }
  assert.deepEqual(errors, []);
  console.log(`${kind}: Description preview, editor, attachments, compact rows, legacy/saved columns, keyboard, touch, themes and CSV passed`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await store.close();
  await fs.rm(root, { recursive: true, force: true });
}
