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
  await find("note", "First idea");
  await page.locator("[data-node=note]").click();
  const card = await page.locator("[data-node=note]").boundingBox();
  const toolbar = await page.locator("#selection-tools").boundingBox();
  assert.ok(
    toolbar.y + toolbar.height <= card.y || toolbar.y >= card.y + card.height,
    "Toolbar sits above or below the selected card",
  );
  assert.equal(
    await page.locator(".board-selection").count(),
    0,
    "No duplicate top-right card toolbar",
  );
  const presence = await page.locator("#canvas-presence").boundingBox();
  assert.ok(
    toolbar.y >= presence.y + presence.height,
    "Card actions do not overlap presence",
  );
  // Place the card at the edge before editing; expanded controls must stay visible.
  await page.locator("#canvas").evaluate((el) => {
    el.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        deltaY: 180,
      }),
    );
  });
  await pro("inline").click();
  const editorBounds = await page.locator(".inline-editing").boundingBox();
  const canvasBounds = await page.locator("#canvas").boundingBox();
  assert.ok(
    editorBounds.x >= canvasBounds.x && editorBounds.y >= canvasBounds.y,
  );
  assert.ok(
    editorBounds.x + editorBounds.width <=
      canvasBounds.x + canvasBounds.width + 1,
  );
  assert.ok(
    editorBounds.y + editorBounds.height <=
      canvasBounds.y + canvasBounds.height + 1,
  );

  const source = page.locator("#canvas-inline-form textarea[name=text]");
  await source.fill(
    "## Rich notes\n\nA **bold** idea with [[Build prototype]].\n\n- First item\n- Second item\n\n[Guide](https://example.com)\n",
  );
  await pro("inline-preview").click();
  assert.ok(await source.isHidden());
  assert.equal(
    await page.locator(".inline-preview h2").textContent(),
    "Rich notes",
  );
  const editor = await page.locator(".inline-editing").boundingBox();
  const preview = await page.locator(".inline-preview").boundingBox();
  assert.ok(
    preview.y >= editor.y &&
      preview.y + preview.height <= editor.y + editor.height + 1,
    "Preview stays inside the card",
  );
  await page.getByRole("button", { name: "Back to edit", exact: true }).click();
  assert.ok(await source.isVisible());
  await page.locator("[data-rich-mode=rich]").click();
  const rich = page.getByRole("textbox", {
    name: "Rich text editor",
    exact: true,
  });
  assert.equal(await rich.locator("strong").textContent(), "bold");
  await rich.locator("h2").evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    el.parentElement.focus();
  });
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  assert.ok(await rich.locator("h2 i, h2 em").count());
  await rich.locator("a").evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    el.closest("[contenteditable]").focus();
  });
  await page.locator("[data-rich-link]").click();
  await page
    .getByRole("textbox", { name: "Link URL", exact: true })
    .fill("https://example.com/updated");
  await page.locator("[data-rich-link-save]").click();

  await pro("inline-preview").click();
  assert.ok(await rich.isHidden());
  assert.ok(await page.locator(".inline-preview h2 em").count());
  await page.locator("#canvas-inline-form [type=submit]").click();
  await saved();
  await until(
    async () =>
      /\*Rich notes\*|_Rich notes_/.test(
        (await current()).nodes.find((n) => n.id === "note").text,
      ),
    "rich formatting persisted",
  );
  const text = (await current()).nodes.find((n) => n.id === "note").text;
  assert.ok(
    text.includes("[[Build prototype]]"),
    "Visual editing preserves wiki links",
  );
  assert.ok(text.includes("https://example.com/updated"));
  assert.ok(text.includes("**bold**"));
  await page.reload();
  await page.locator("#canvas").waitFor();
  await find("note", "Rich notes");
  assert.ok(await page.locator("[data-node=note] h2 em").count());
  console.log(
    "PASS: rich-text formatting, Markdown/wiki-link persistence, bounded preview and attached card toolbar",
  );

  await page.locator("#board-expand").click();
  let canvas = await page.locator("#canvas").boundingBox();
  assert.equal(canvas.x, 0);
  assert.equal(canvas.y, 0);
  assert.equal(canvas.width, 1600);
  assert.equal(canvas.height, 1100);
  await page.locator("[data-node=note]").dblclick();
  await pro("inline-cancel").click();
  assert.ok(
    await page
      .locator("#canvas")
      .evaluate((el) => el.classList.contains("board-expanded")),
    "expanded state survives re-render",
  );
  await page.keyboard.press("Escape");
  assert.ok(
    !(await page
      .locator("#canvas")
      .evaluate((el) => el.classList.contains("board-expanded"))),
  );
  if (process.env.BROWSER !== "firefox") {
    await page
      .getByRole("button", { name: "Full screen", exact: true })
      .click();
    await until(
      () => page.evaluate(() => !!document.fullscreenElement),
      "native full screen",
    );
    await page.locator("#board-expand").click();
    await until(
      () => page.evaluate(() => !document.fullscreenElement),
      "exit full screen",
    );
  }
  await page.screenshot({
    path: "/tmp/pencils-board-editor.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: expanded window, full-screen exit, no errors or external requests",
  );
} catch (e) {
  await page.screenshot({
    path: "/tmp/pencils-board-editor-failure.png",
    fullPage: true,
  });
  console.error(errors);
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
