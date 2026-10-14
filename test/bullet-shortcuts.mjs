import { openBoardSearch } from "./menu-controls.mjs";
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
      id: "frame",
      type: "frame",
      text: "Plain frame title",
      x: 80,
      y: 700,
      w: 400,
      h: 300,
    },
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
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page
    .locator(`#canvas-find-results [data-pro=find-result][data-id="${id}"]`)
    .click();
  await page.waitForTimeout(100);
}
const rich = page.locator(".inline-rich");
async function content(markdown = "") {
  await page.locator("[data-rich-mode=source]").click();
  await page.locator(".inline-source").fill(markdown);
  await page.locator("[data-rich-mode=rich]").click();
}
try {
  await enter();
  await find("note", "First idea");
  await page.locator("[data-node=note]").dblclick();
  for (const marker of ["-", "*", "+"]) {
    await content();
    await page.keyboard.type(marker);
    assert.equal(await rich.locator("li").count(), 0);
    await page.keyboard.press("Space");
    assert.equal(
      await rich.locator("ul > li").count(),
      1,
      `${marker} and Space create a bullet immediately`,
    );
    assert.equal(
      (await rich.innerText()).trim(),
      "",
      "The typed marker is removed",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Bullet list", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    if (marker === "-") {
      await page.keyboard.press("Control+z");
      assert.equal(
        await rich.locator("li").count(),
        0,
        "Native Undo reverses the conversion",
      );
      await page.keyboard.press("Control+Shift+z");
      assert.equal(
        await rich.locator("li").count(),
        1,
        "Native Redo restores the conversion",
      );
    }
    await page.keyboard.type("First point");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second point");
    assert.deepEqual(await rich.locator("li").allTextContents(), [
      "First point",
      "Second point",
    ]);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("After the list");
    assert.equal(await rich.locator("li").count(), 2);
  }
  await content("Intro paragraph");
  await rich.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("New paragraph bullet");
  assert.equal(
    await rich.locator("ul > li").innerText(),
    "New paragraph bullet",
  );
  assert.ok((await rich.innerText()).startsWith("Intro paragraph"));

  await content("Existing **formatted** text");
  await rich.press("Control+Home");
  await page.keyboard.type("- ");
  assert.equal(
    await rich.locator("ul > li").innerText(),
    "Existing formatted text",
  );
  assert.equal(await rich.locator("li strong,li b").innerText(), "formatted");

  // Literal text, code and an existing list must not accidentally convert.
  for (const [markdown, suffix, lists] of [
    ["Normal prose", " - ", 0],
    ["", "-- ", 0],
    ["", "-word ", 0],
    ["```text\ncode\n```", "- ", 0],
    ["- Existing item", "- ", 1],
  ]) {
    await content(markdown);
    await rich.press("Control+End");
    await page.keyboard.type(suffix);
    assert.equal(await rich.locator("ul").count(), lists, markdown + suffix);
    assert.ok((await rich.innerText()).trimEnd().endsWith(suffix.trimEnd()));
  }
  await content();
  await page.keyboard.type("-");
  assert.equal(
    await rich.evaluate((el) =>
      el.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: " ",
          isComposing: true,
        }),
      ),
    ),
    true,
    "Composition is left to the input method",
  );
  assert.equal(await rich.locator("li").count(), 0);
  // Virtual keyboards send beforeinput without a physical keydown.
  assert.equal(
    await rich.evaluate((el) =>
      el.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: " ",
        }),
      ),
    ),
    false,
  );
  assert.equal(await rich.locator("li").count(), 1);
  await page.keyboard.type("Saved shortcut bullet");
  await page.locator('[data-pro="search-toggle"]').click();
  await until(async () =>
    (await current()).nodes
      .find((n) => n.id === "note")
      .text.includes("Saved shortcut bullet"),
  );
  assert.match(
    (await current()).nodes.find((n) => n.id === "note").text,
    /^- +Saved shortcut bullet/,
  );
  await page.reload();
  await page.locator("#canvas").waitFor();
  await find("note", "Saved shortcut bullet");
  assert.equal(
    await page.locator("[data-node=note] ul > li").innerText(),
    "Saved shortcut bullet",
  );
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").text ===
      "First idea",
  );

  // Markdown mode stays literal until rendered; plain frame labels stay plain.
  await find("note", "First idea");
  await page.locator("[data-node=note]").dblclick();
  await page.locator("[data-rich-mode=source]").click();
  await page.locator(".inline-source").fill("");
  await page.keyboard.type("- ");
  assert.equal(await page.locator(".inline-source").inputValue(), "- ");
  await page.keyboard.press("Escape");
  await find("frame", "Plain frame title");
  await page.locator("[data-node=frame] .frame-title").dblclick();
  await rich.fill("");
  await page.keyboard.type("- ");
  assert.equal((await rich.innerText()).replaceAll("\u00a0", " "), "- ");
  assert.equal(await rich.locator("li").count(), 0);
  await page.locator('[data-pro="search-toggle"]').click();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: Markdown bullet typing shortcuts, new paragraphs, formatted text, literal/code/list guards, composition, virtual keyboard input, autosave, reload and undo",
  );
} catch (error) {
  console.error(errors);
  await page.screenshot({
    path: "/tmp/pencils-bullet-shortcut-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
