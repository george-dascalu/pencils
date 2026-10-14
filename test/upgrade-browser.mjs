import { clickControl, reveal } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pencils-upgrade-browser-"),
  ),
  store = new Store(root);
await store.init();
const project = await store.demo();
const first = (await store.snapshot(project.id)).tasks.find(
  (t) => t.type === "task" && t.status === "todo",
);
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
    process.env.BROWSER === "firefox" ? firefox : chromium
  ).launch({
    headless: true,
    args: process.env.BROWSER === "firefox" ? [] : ["--no-sandbox"],
  }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(15000);
const feature = (key) => page.locator(`[data-feature="${key}"]`).first();
const view = (key) => page.locator(`[data-view="${key}"]`).click();
const snap = () => store.snapshot(project.id);
const until = async (fn) => {
  for (let i = 0; i < 80; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for persisted change");
};
try {
  await page.goto(base);
  await page.locator(".project-link").click();
  await view("table");
  // Hold the first update in flight while another cell on the same task changes.
  await page.route(
    `**/api/projects/${project.id}/tasks/${first.id}`,
    async (route) => {
      if (route.request().method() === "PATCH")
        await new Promise((r) => setTimeout(r, 150));
      await route.continue();
    },
  );
  await page
    .locator(`[data-id="${first.id}"][data-task-field="status"]`)
    .selectOption("review");
  await page
    .locator(`[data-id="${first.id}"][data-task-field="priority"]`)
    .selectOption("urgent");
  await until(async () => {
    const t = (await snap()).tasks.find((t) => t.id === first.id);
    return t.status === "review" && t.priority === "urgent";
  });
  await page.unroute(`**/api/projects/${project.id}/tasks/${first.id}`);
  assert.equal(await page.locator(".toast.error").count(), 0);
  console.log(
    "PASS: rapid edits on one row are serialized without self-conflicts",
  );
  // Range copy and TSV paste to text/type columns.
  const title = page.locator(
    `[data-id="${first.id}"][data-task-field="title"]`,
  );
  await title.click();
  await title.evaluate((el) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => "Pasted title\tbug" },
    });
    el.dispatchEvent(event);
  });
  await until(async () => {
    const t = (await snap()).tasks.find((t) => t.id === first.id);
    return t.title === "Pasted title" && t.type === "bug";
  });
  await (await reveal(page.locator("#filter-assignee"))).fill("Alex");
  await page.locator("#filter-assignee").press("Tab");
  await clickControl(feature("view-save"));
  await page.locator("#view-form [name=name]").fill("Alex table");
  await page.locator("#view-form [type=submit]").click();
  await page.locator("dialog").waitFor({ state: "detached" });
  assert.equal((await snap()).project.views[0].filters.assignee, "Alex");
  await page.reload();
  await (
    await reveal(page.locator("#saved-view"))
  ).selectOption({ label: "Alex table" });
  assert.equal(await page.locator("#filter-assignee").inputValue(), "Alex");
  console.log("PASS: range paste and named views persist across reload");
  await clickControl(feature("workflow"));
  await page
    .locator("#workflow-form [name=types]")
    .fill("epic, milestone, story, task, bug, research");
  await clickControl(feature("field-add"));
  await page.locator(".field-name").fill("Cost");
  await page.locator(".field-type").selectOption("number");
  await page.locator("#workflow-form [type=submit]").click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.locator("[data-action=task-new]:visible").first().click();
  await page.locator("#task-form [name=title]").fill("Planned work");
  await page.locator("[data-task-picker=type] .task-picker-trigger").click();
  await page.locator("[data-task-picker=type] [data-picker-value=research]").click();
  await page.getByText("Planning & relationships", { exact: true }).click();
  await page.locator("#task-form [name=start]").fill("2026-10-14");
  await page.locator("#task-form [name=due]").fill("2026-10-16");
  await page.locator('#task-form [name^="custom:"]').fill("42");
  await page.locator("#task-form [type=submit]").click();
  await page.locator("dialog").waitFor({ state: "detached" });
  const planned = (await snap()).tasks.find((t) => t.title === "Planned work");
  assert.equal(Object.values(planned.fields)[0], 42);
  await (await reveal(page.locator("#filter-assignee"))).fill("");
  await page.locator("#filter-assignee").press("Tab");
  await view("calendar");
  assert.ok(await page.locator(".calendar").count());
  await view("timeline");
  assert.ok(await page.locator(".timeline-bar").count());
  console.log("PASS: custom workflow, typed fields, calendar and timeline");
  // Retained editor draft after closing and reopening.
  await view("list");
  await page
    .locator(`[data-action=task-open][data-id="${planned.id}"]`)
    .first()
    .click();
  await page.locator("#task-form [name=title]").fill("Recover my draft");
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-action=dialog-close]").click();
  await page
    .locator(`[data-action=task-open][data-id="${planned.id}"]`)
    .first()
    .click();
  await clickControl(feature("form-restore"));
  assert.equal(
    await page.locator("#task-form [name=title]").inputValue(),
    "Recover my draft",
  );
  await page.locator("#task-form [type=submit]").click();
  await page.locator("dialog").waitFor({ state: "detached" });
  console.log("PASS: form drafts recover without overwriting disk");
  await page
    .locator(`[data-action=task-open][data-id="${planned.id}"]`)
    .first()
    .click();
  const chooser = page.waitForEvent("filechooser");
  await clickControl(feature("attach"));
  await (
    await chooser
  ).setFiles({
    name: "details.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Local attachment"),
  });
  await until(async () =>
    (await page.locator("#task-form [name=body]").inputValue()).includes(
      "../attachments/",
    ),
  );
  await page.locator("#task-form [data-rich-preview]").click();
  assert.match(
    await page.locator("#markdown-preview a").getAttribute("href"),
    /\/api\/projects\/.*\/attachments\//,
  );
  await page.locator("#task-form [type=submit]").click();
  await page.locator("dialog").waitFor({ state: "detached" });
  const attached = (await snap()).tasks.find((t) => t.id === planned.id);
  const relative = attached.body.match(/\]\(([^)]+)\)/)[1];
  assert.equal(
    await fs.readFile(
      path.resolve(root, path.dirname(attached.file), relative),
      "utf8",
    ),
    "Local attachment",
  );
  console.log(
    "PASS: attachment links resolve in both the web preview and the Markdown vault",
  );
  // Interrupted canvas save survives reload and retries automatically.
  await view("board");
  await page.locator("[data-action=board-fit]").click();
  let fail = true;
  await page.route("**/api/projects/*/boards/*", (route) =>
    route.request().method() === "PATCH" && fail
      ? route.abort()
      : route.continue(),
  );
  await page.locator("[data-node=n-note]").dblclick();
  await page
    .locator("#canvas-inline-form .inline-rich")
    .fill("Survives a lost connection");
  await page.locator('[data-pro="search-toggle"]').click();
  await page.locator("#canvas-inline-form").waitFor({ state: "detached" });
  await until(() =>
    page.evaluate(() =>
      Object.keys(localStorage).some(
        (k) =>
          k.startsWith("pencils:pending:") &&
          localStorage.getItem(k).includes("Survives a lost connection"),
      ),
    ),
  );
  await page.reload();
  fail = false;
  await page.locator("#canvas").waitFor();
  await until(async () =>
    (await snap()).boards[0].nodes.some(
      (n) => n.text === "Survives a lost connection",
    ),
  );
  console.log(
    "PASS: failed canvas saves survive reload and retry without discarding edits",
  );
  // Selection, resize, frames, labelled connectors and portable export.
  await page.locator("[data-action=board-fit]").click();
  await page.locator("[data-node=n-note]").click();
  await page.locator("[data-node=n-note2]").click({ modifiers: ["Shift"] });
  assert.equal(await page.locator(".board-node.selected").count(), 2);
  await clickControl(feature("group"));
  await until(async () => {
    const nodes = (await snap()).boards[0].nodes;
    return (
      nodes.find((n) => n.id === "n-note").group &&
      nodes.find((n) => n.id === "n-note").group ===
        nodes.find((n) => n.id === "n-note2").group
    );
  });
  await clickControl(feature("frame-selection"));
  await until(async () =>
    (await snap()).boards[0].nodes.some((n) => n.type === "frame"),
  );
  await page.locator("[data-action=board-fit]").click();
  const selectedNode = page.locator("[data-node=n-note]");
  await selectedNode.click();
  await clickControl(feature("ungroup"));
  await page.locator("#canvas").click({position:{x:600,y:100}});
  await selectedNode.click();
  const handle = selectedNode.locator(
      '.resize-handle[data-resize-corner="se"]',
    ),
    box = await handle.boundingBox(),
    old = (await snap()).boards[0].nodes.find((n) => n.id === "n-note").w;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y + 35, { steps: 5 });
  await page.mouse.up();
  await until(
    async () =>
      (await snap()).boards[0].nodes.find((n) => n.id === "n-note").w !== old,
  );
  const download = page.waitForEvent("download");
  await clickControl(feature("canvas-json"));
  const file = await download;
  const contents = JSON.parse(await fs.readFile(await file.path(), "utf8"));
  assert.ok(contents.nodes.some((n) => n.type === "group"));
  assert.ok(
    contents.nodes.some((n) => n.type === "file" && n.file.endsWith(".md")),
  );
  const imageDownload = page.waitForEvent("download");
  await clickControl(feature("canvas-png"));
  assert.match((await imageDownload).suggestedFilename(), /\.png$/);
  console.log(
    "PASS: multiselection, grouping, frames, resize, JSON Canvas and PNG export",
  );
  await view("list");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.locator("[data-action=project-edit]").isVisible(),
    true,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "/tmp/pencils-upgrade-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await view("board");
  await page.screenshot({
    path: "/tmp/pencils-upgrade-board.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: mobile settings, responsive layout and zero browser errors",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  await page.screenshot({
    path: "/tmp/pencils-upgrade-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
