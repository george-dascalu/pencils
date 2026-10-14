import { clickControl } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-canvas-ui-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Board lab" }),
  a = await store.createTask(project.id, {
    title: "Write specification",
    assignee: "Alice",
    due: "2020-01-01",
    body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n",
  }),
  b = await store.createTask(project.id, {
    title: "Build prototype",
    assignee: "Bob",
  });
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "note",
      type: "sticky",
      text: "First idea",
      x: 80,
      y: 150,
      w: 240,
      h: 200,
      color: "#f5e7a2",
    },
    { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
    { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
    {
      id: "far",
      type: "text",
      text: "A distant idea",
      x: 6000,
      y: 3000,
      w: 300,
      h: 150,
    },
  ],
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({
  headless: true,
  args: process.env.BROWSER === "firefox" ? [] : ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  }),
  page = await context.newPage(),
  errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (!r.url().startsWith(base) && !r.url().startsWith("data:"))
    external.push(r.url());
});
page.setDefaultTimeout(12000);
const pro = (name, p = page) => p.locator(`[data-pro="${name}"]`).first();
const snap = () => store.snapshot(project.id);
const current = async () =>
  (await snap()).boards.find((x) => x.id === board.id);
async function until(fn, label = "condition") {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out: " + label);
}
async function enter(p = page) {
  await p.goto(base);
  await p.locator(".project-link").click();
  await p.locator("[data-view=board]").click();
  await p.locator("#canvas").waitFor();
}
async function saved() {
  await until(
    () =>
      page
        .locator("#board-save")
        .textContent()
        .then((t) => /All (canvas )?changes saved/.test(t)),
    "save",
  );
}
async function find(id, text) {
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro=find-result][data-id="${id}"]`).click();
  await page.waitForTimeout(100);
}
try {
  await enter();
  assert.equal(await page.locator("[data-node=far]").count(), 0);
  await page.locator("[data-node=note]").dblclick();
  await page.locator("#canvas-inline-form textarea").fill("An **inline** idea");
  await page.locator("#canvas-inline-form textarea").press("Control+Enter");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").text ===
      "An **inline** idea",
  );
  assert.equal(
    await page.locator("[data-node=note] strong").textContent(),
    "inline",
  );
  console.log("PASS: inline Markdown and offscreen object culling");
  await page.locator("[data-node=task-a]").click();
  await clickControl(pro("embed"));
  await page.locator("#canvas-embed-form input").fill("#Scope");
  await page.locator("#canvas-embed-form button").last().click();
  await saved();
  await page.locator("[data-node=task-a] .task-title").dblclick();
  await page
    .locator("#canvas-inline-form textarea")
    .fill("## Scope\nEdited from canvas.\n\n");
  await page.locator("#canvas-inline-form textarea").press("Control+Enter");
  await until(async () =>
    (await snap()).tasks
      .find((t) => t.id === a.id)
      .body.includes("Edited from canvas."),
  );
  assert.match(
    (await snap()).tasks.find((t) => t.id === a.id).body,
    /## Other\nKeep this/,
  );
  console.log("PASS: live heading edits preserve the rest of the source note");
  await page.locator("[data-node=task-a]").click();
  const port = await page
      .locator("[data-source=task-a][data-port=right]")
      .boundingBox(),
    target = await page.locator("[data-node=task-b]").boundingBox();
  await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 10, target.y + 80, { steps: 8 });
  await page.mouse.up();
  await until(async () => (await current()).edges.length === 1, "connector");
  const edge = (await current()).edges[0];
  const edgePoint = await page
    .locator(`path[data-edge="${edge.id}"]`)
    .evaluate((el) => {
      const p = el.getPointAtLength(el.getTotalLength() / 2),
        r = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
      return { x: r.x, y: r.y };
    });
  await page.mouse.dblclick(edgePoint.x, edgePoint.y);
  await page
    .locator("#canvas-edge-form [name=relationship]")
    .selectOption("blocks");
  await page.locator("#canvas-edge-form [name=routing]").selectOption("elbow");
  await page.locator("#canvas-edge-form [name=dependency]").check();
  await page.locator("#canvas-edge-form button[type=submit]").click();
  await until(
    async () =>
      (await snap()).tasks
        .find((t) => t.id === b.id)
        .dependencies?.includes(a.id),
    "dependency",
  );
  await page.locator("dialog").waitFor({ state: "detached" });
  assert.equal((await current()).edges[0].routing, "elbow");
  console.log("PASS: connection handles, routes and real task dependencies");
  await page.locator("[data-node=note]").click();
  await clickControl(pro("comments"));
  await page
    .locator("#canvas-comment-form textarea")
    .fill("Discuss this idea in the next planning session.");
  await page.locator("#canvas-comment-form button[type=submit]").click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").comments?.length ===
      1,
  );
  await page.locator("[data-action=dialog-close]").first().click();
  await page.locator("[data-node=note]").click();
  await clickControl(pro("convert"));
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").type === "task",
  );
  assert.equal(
    (await current()).nodes.find((n) => n.id === "note").comments.length,
    1,
  );
  await clickControl(pro("query-add"));
  await page.locator("#canvas-query-form [name=title]").fill("Alice’s work");
  await page.locator("#canvas-query-form [name=assignee]").fill("Alice");
  await page.locator("#canvas-query-form button[type=submit]").click();
  await until(async () =>
    (await current()).nodes.some((n) => n.type === "query"),
  );
  assert.match(
    await page.locator(".query-rows").textContent(),
    /Write specification/,
  );
  console.log(
    "PASS: anchored comments, sticky conversion and live task queries",
  );
  await clickControl(pro("templates"));
  await page.locator("[data-pro=template-insert][data-id=roadmap]").click();
  await until(
    async () =>
      (await current()).nodes.filter((n) => n.type === "frame").length === 3,
  );
  await page.locator("[data-action=board-fit]").click();
  await clickControl(pro("outline"));
  const frame = (await current()).nodes.find(
    (n) => n.type === "frame" && n.text === "Now",
  );
  await page
    .locator(`#canvas-outline [data-pro=collapse][data-id="${frame.id}"]`)
    .click();
  await saved();
  assert.ok((await current()).nodes.find((n) => n.id === frame.id).collapsed);
  await clickControl(pro("present"));
  await page.locator("#presentation-controls").waitFor();
  await page.keyboard.press("ArrowRight");
  assert.match(
    await page.locator("#presentation-controls").textContent(),
    /2 \/ 3/,
  );
  await page.keyboard.press("Escape");
  console.log(
    "PASS: reusable templates, frame outline, collapse and presentation",
  );
  // Independent browser tabs share one board without sharing their pending-write queues.
  const second = await context.newPage();
  second.on("pageerror", (e) => errors.push(e.message));
  await enter(second);
  await until(
    () =>
      page
        .locator("#canvas-presence")
        .textContent()
        .then((t) => t.includes("2 here")),
    "presence",
  );
  assert.equal(
    (await second.evaluate(() => sessionStorage.getItem("pencils:client"))) ===
      (await page.evaluate(() => sessionStorage.getItem("pencils:client"))),
    false,
  );
  await find("task-a", "Write specification");
  await page.locator("[data-node=task-a]").click();
  await until(
    () =>
      second
        .locator(".participant-selection")
        .count()
        .then((n) => n > 0),
    "selection presence",
  );
  await second.locator("#canvas-find").fill("Build prototype");
  await second.locator("[data-pro=find-result][data-id=task-b]").click();
  await second.locator("[data-node=task-b]").click();
  await Promise.all([
    page.keyboard.press("ArrowRight"),
    second.keyboard.press("ArrowDown"),
  ]);
  await until(async () => {
    const c = await current();
    return (
      c.nodes.find((n) => n.id === "task-a").x > 420 &&
      c.nodes.find((n) => n.id === "task-b").y > 150
    );
  }, "simultaneous edits");
  await clickControl(pro("activity"));
  await page.locator(".operation-list article").first().waitFor();
  assert.ok((await page.locator(".operation-list article").count()) > 5);
  await clickControl(pro("activity-close"));
  console.log(
    "PASS: two-tab presence, selections, concurrent edits and durable activity",
  );
  await second.close();
  await find("far", "distant");
  assert.equal(await page.locator("[data-node=far]").count(), 1);
  await page.screenshot({
    path: "/tmp/pencils-canvas-pro.png",
    fullPage: true,
  });
  // Native export is a full-fidelity file, with real file cards and connector ports.
  const download = page.waitForEvent("download");
  await clickControl(page.locator("[data-feature=canvas-json]"));
  const data = JSON.parse(
    await fs.readFile(await (await download).path(), "utf8"),
  );
  assert.ok(data.nodes.some((n) => n.type === "file"));
  assert.ok(data.edges[0].fromSide);
  assert.ok(data.pencils.operations.length);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: object search, native export, no browser errors or internet requests",
  );
} catch (e) {
  await page.screenshot({
    path: "/tmp/pencils-canvas-pro-failure.png",
    fullPage: true,
  });
  console.error("Browser errors:", errors);
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
