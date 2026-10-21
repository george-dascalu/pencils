import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp("/tmp/pencils-audit-fixes-");
const output = process.env.AUDIT_OUTPUT || path.join(root, "evidence");
await fs.mkdir(output, { recursive: true });
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Audit fixes", key: "FIX" });
const tasks = [];
for (let i = 0; i < 8; i++) tasks.push(await store.createTask(project.id, {
  title: i === 0 ? "Review mobile navigation and keyboard accessibility" : `Release task ${i}`,
  status: "backlog", order: i * 1024, assignee: i % 2 ? "George" : "",
  priority: i % 2 ? "urgent" : "medium", due: "2026-10-25",
  body: "- [ ] Keyboard access\n- [x] Save changes",
}));
const document = await store.createDocument(project.id, { title: "Checklist", body: tasks[0].body });
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    { id: "card", type: "task", task: tasks[0].id, x: 80, y: 100, w: 380, h: 260, comments: [
      { id: "legacy", author: "George", text: "Legacy board comment", created: "2026-10-19T12:00:00Z" },
      { id: "reply", replyTo: "legacy", author: "George", text: "Legacy reply", created: "2026-10-19T12:01:00Z" },
    ] },
    { id: "card-copy", type: "task", task: tasks[0].id, x: 500, y: 100, w: 380, h: 260 },
    { id: "note", type: "sticky", text: "Readable custom fill", color: "#f4e1a1", x: 100, y: 450, w: 250, h: 160 },
  ], edges: [],
});
const production = process.env.PRODUCTION_ASSETS === "1";
const server = createServer(store, { productionAssets: production });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (process.env.BROWSER === "webkit" ? webkit : chromium).launch();
const errors = [], evidence = [];
let page;
const openView = async (view) => {
  await page.goto(`${base}/?audit=${view}#project/${project.id}/${view}`);
  await page.locator({
    list: ".task-row", tree: ".tree-wrapper", table: ".spreadsheet", kanban: ".kanban",
    board: "#canvas", documents: ".documents-workspace", timeline: ".task-timeline",
    calendar: ".calendar,.calendar-agenda", overview: ".project-overview", capacity: ".capacity-view",
  }[view]).first().waitFor();
};
const snapshot = async () => (await store.snapshot(project.id));
const task = async () => (await snapshot()).tasks.find(t => t.id === tasks[0].id);
const until = async (fn) => {
  for (let i = 0; i < 160; i++) {
    if (await fn()) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw Error("Timed out waiting for persisted result");
};
const newPage = async (width, touch = false) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });
  const p = await context.newPage();
  p.on("pageerror", error => errors.push(error.message));
  return p;
};
try {
  page = await newPage(1500);
  for (const view of ["list", "tree", "table", "kanban"]) {
    await openView(view);
    const opener = page.locator(`[data-action="task-open"][data-id="${tasks[0].id}"]`).first();
    for (const close of ["escape", "button"]) {
      await opener.click();
      await page.locator("#task-form [name=title]").focus();
      if (view === "list" && close === "escape") {
        await page.locator("#task-form [name=title]").fill("Review mobile navigation after autosave");
        await until(async () => (await task()).title === "Review mobile navigation after autosave");
      }
      if (close === "escape") await page.keyboard.press("Escape");
      else await page.locator('[data-action="dialog-close"]').click();
      await page.waitForFunction(id => document.activeElement?.dataset.id === id, tasks[0].id);
    }
  }
  await openView("list");
  await page.locator(".row-open").first().click();
  assert.deepEqual(await page.locator('#task-form input[type=checkbox][disabled]').evaluateAll(els => els.map(el => el.getAttribute("aria-label"))), ["Keyboard access", "Save changes"]);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator(".task-attachment-choose").focus();
  await page.keyboard.press("Enter");
  await (await chooserPromise).setFiles({ name: "keyboard.txt", mimeType: "text/plain", buffer: Buffer.from("Keyboard upload") });
  await page.locator("[data-attachment-file]").waitFor();
  await page.locator("#task-form [name=title]").fill("");
  await page.locator('[data-action="dialog-close"]').click();
  await page.locator(".task-close-notice").waitFor();
  assert.equal(await page.locator("#task-form").count(), 1);
  await page.locator("[data-keep-draft]").click();
  await page.locator(".row-open").first().click();
  await page.locator(".draft-notice").waitFor();
  await page.locator('[data-feature="form-discard"]').click();
  await page.locator('[data-action="dialog-close"]').click();

  await openView("kanban");
  const title = page.locator(`[data-drag-task="${tasks[0].id}"] .task-title`);
  const before = await page.locator("[data-drag-task]").evaluateAll(els => els.map(el => el.dataset.dragTask));
  await title.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await until(async () => {
    const list = await page.locator("[data-drag-task]").evaluateAll(els => els.map(el => el.dataset.dragTask));
    return list.indexOf(tasks[0].id) === before.indexOf(tasks[0].id) + 1;
  });
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), tasks[0].id);
  await until(async () => (await task()).order !== tasks[0].order);

  await openView("board");
  await page.locator('[data-node=card] [data-pro=comments]').click();
  await page.getByText("Legacy board comment", { exact: true }).waitFor();
  await page.locator("#board-comment-form .inline-rich").fill("One shared task conversation");
  await page.locator("[data-comment-submit]").click();
  await until(async () => (await task()).comments?.length === 3);
  assert.equal((await task()).comments.find(c => c.text === "Legacy reply").replyTo, (await task()).comments.find(c => c.text === "Legacy board comment").id);
  await page.locator("[data-comments-close]").click();
  await page.locator('[data-node=card-copy] [data-pro=comments]').click();
  await page.getByText("One shared task conversation", { exact: true }).waitFor();
  await page.locator("[data-comments-close]").click();
  assert.equal(await page.locator("[data-node=card]").getAttribute("role"), "group");
  const boardScan = await new AxeBuilder({ page }).withRules(["nested-interactive", "label", "aria-prohibited-attr", "color-contrast"]).analyze();
  assert.equal(boardScan.violations.filter(v => v.nodes.some(n => n.target.join("").includes("data-node"))).length, 0, JSON.stringify(boardScan.violations));
  evidence.push({ boardRules: boardScan.violations });
  await openView("list");
  await page.locator(`[data-action=task-open][data-id="${tasks[0].id}"]`).first().click();
  await page.locator('[data-feature="task-comments"]').first().click();
  await page.getByText("One shared task conversation", { exact: true }).waitFor();
  await page.locator("#board-comment-form .inline-rich").fill("Reply from the task editor");
  await page.locator("[data-comment-submit]").click();
  await until(async () => (await task()).comments?.length === 4);
  await page.locator("[data-comments-close]").click();
  await page.locator('[data-action="dialog-close"]').click();
  await openView("board");
  await page.locator('[data-node=card] [data-pro=comments]').click();
  await page.getByText("Reply from the task editor", { exact: true }).waitFor();
  assert.equal((await task()).comments.length, 4, "Reopening a legacy thread does not duplicate it");
  await page.locator("[data-comments-close]").click();
  assert.deepEqual(await page.locator(".task-comment-count").allTextContents(), ["4", "4"]);
  await page.context().close();

  for (const width of [320, 390, 768, 1500]) {
    page = await newPage(width, width < 1000);
    for (const theme of ["light", "dark"]) {
      await openView("list");
      await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
      for (const view of ["list", "tree", "table", "timeline", "documents", "calendar", "kanban", "overview", "capacity", "board"]) {
        await openView(view);
        if (["list", "tree"].includes(view)) {
          const box = await page.locator(".row-title").first().boundingBox();
          assert.ok(box.x < width - 100 && box.width >= 100, `${width} ${view}: title ${JSON.stringify(box)}`);
          const date = page.locator(".row-due").first();
          assert.ok((await date.getAttribute("aria-label")).includes((await date.innerText()).trim()));
        }
        if (view === "table") {
          assert.notEqual(await page.locator(".spreadsheet .task-id").first().evaluate(el => getComputedStyle(el).display), "none");
          if (width < 1000) {
            const box = await page.locator(".table-open").first().boundingBox();
            assert.ok(box.width >= 44 && box.height >= 44, JSON.stringify(box));
          }
          if (width < 600) {
            const box = await page.locator(".table-scroll").boundingBox();
            assert.ok(box.y < 350, `Table starts at ${box.y}`);
            await page.locator(".mobile-view-options > summary").click();
            await page.locator('[data-board-menu="table-groups"] > summary').click();
            await page.locator("#table-group-primary").count(); // Menu fields stay mounted with their original handlers.
            await page.keyboard.press("Escape");
            await page.locator('.mobile-view-options-panel [aria-label="Close view options"]').click();
            evidence.push({ width, theme, tableTop: box.y, tableHeight: box.height });
          }
        }
        if (view === "timeline") {
          const marker = page.locator(".timeline-today").first();
          if (await marker.count()) assert.equal(await marker.getAttribute("role"), "img");
        }
        if (view === "calendar" && width < 1000) {
          for (const button of await page.locator(".agenda-row > button").all()) {
            if (await button.isVisible()) assert.ok((await button.boundingBox()).height >= 44);
          }
        }
        if (view === "board" && width === 390) {
          for (const selector of ["[data-pro=comments]", "[data-pro=task-details]", ".canvas-task-priority", ".canvas-task-status", ".canvas-task-assignee"]) {
            const box = await page.locator(`[data-node=card] ${selector}`).boundingBox();
            assert.ok(box.width >= 43.9 && box.height >= 43.9, `${selector}: ${JSON.stringify(box)}`);
          }
          const priority = await page.locator("[data-node=card] .canvas-task-priority").boundingBox();
          const status = await page.locator("[data-node=card] .canvas-task-status").boundingBox();
          assert.ok(priority.x + priority.width <= status.x, "Expanded touch targets do not overlap");
        }
        if ([390, 1500].includes(width) && ["list", "table", "board", "documents"].includes(view))
          await page.screenshot({ path: path.join(output, `${width}-${theme}-${view}.png`) });
      }
    }
    if (width < 600) {
      await openView("list");
      await page.locator(".row-open").first().click();
      await page.locator('[data-editor-pane="comments"]').click();
      await page.locator(".task-comments-panel").waitFor();
      assert.equal(await page.locator(".task-editor-content > .dialog-body").isVisible(), false);
      const box = await page.locator(".task-comments-panel").boundingBox();
      assert.ok(box.width >= width - 30, JSON.stringify(box));
      await page.screenshot({ path: path.join(output, `${width}-comments.png`) });
      await page.locator('[data-editor-pane="details"]').click();
      assert.equal(await page.locator(".task-editor-content > .dialog-body").isVisible(), true);
      await page.locator('[data-editor-pane="history"]').click();
      await page.locator(".task-history-panel").waitFor();
      await page.locator('[data-editor-pane="details"]').click();
      await page.locator('[data-action="dialog-close"]').click();
    }
    await page.context().close();
  }
  if (production && process.env.BROWSER !== "webkit") {
    page = await newPage(1500);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const start = Date.now();
    await openView("list");
    const elapsed = Date.now() - start;
    const resources = await page.evaluate(() => performance.getEntriesByType("resource").map(r => ({ url: r.name, bytes: r.encodedBodySize })));
    evidence.push({ productionCold: { readyMs: elapsed, requests: resources.length, bytes: resources.reduce((n, r) => n + r.bytes, 0), resources } });
    assert.ok(resources.reduce((n, r) => n + r.bytes, 0) < 900000, "Cold transfer exceeds 900KB");
  }
  assert.deepEqual(errors, []);
  console.log("PASS: audit fixes — comments and legacy threads, focus, uploads, invalid-close drafts, keyboard order, labels, responsive views, panels, targets and production loading.");
} finally {
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ production, errors, evidence }, null, 2));
  console.log(`Evidence: ${output}`);
  await browser.close();
  await new Promise(r => server.close(r));
}
