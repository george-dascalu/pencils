import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-colours-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Colours" });
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "one",
      type: "sticky",
      text: "First idea",
      x: 100,
      y: 230,
      w: 220,
      h: 180,
      color: "#f5e7a2",
    },
    {
      id: "two",
      type: "sticky",
      text: "Second idea",
      x: 600,
      y: 230,
      w: 220,
      h: 180,
    },
  ],
  edges: [{ id: "edge", from: "one", to: "two", label: "Connect" }],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }),
  errors = [];
page.setDefaultTimeout(10000);
page.on("pageerror", (e) => errors.push(e.message));
const current = async () => (await store.snapshot(project.id)).boards[0];
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Save timed out");
}
async function choose(title, host = page.locator("dialog")) {
  const picker = host.locator(".color-picker");
  await picker.locator("summary").click();
  assert.equal(await picker.locator("[data-color-choice]").count(), 7);
  await picker.getByRole("button", { name: title, exact: true }).click();
}
async function custom(value, host = page.locator("dialog")) {
  const picker = host.locator(".color-picker");
  await picker.locator("summary").click();
  await picker.locator("[data-color-hex]").fill(value);
  await picker.locator("[data-color-apply]").click();
}
async function save(form) {
  await page.locator(`${form} .dialog-foot button.primary`).click();
  await page.locator("dialog").waitFor({ state: "detached" });
}
try {
  await page.goto(base);
  await page.locator(".project-link").click();
  await page.locator("[data-action=project-edit]").click();
  await choose("Peach");
  await save("#project-form");
  assert.equal((await store.snapshot(project.id)).project.color, "#edc48b");
  await page.locator("[data-action=organisation-edit]").click();
  await custom("oops");
  assert.ok(await page.locator(".color-error").isVisible());
  await page.locator("[data-color-hex]").fill("#123abc");
  await page.locator("[data-color-hex]").press("Enter");
  assert.equal(await page.locator("[name=color]").inputValue(), "#123abc");
  await save("#organisation-form");
  await page.locator("[data-action=organisation-edit]").click();
  assert.equal(await page.locator("[name=color]").inputValue(), "#123abc");
  await page.locator("[data-action=dialog-close]").first().click();
  await page.locator("[data-view=board]").click();
  await page.locator('[data-node="one"]').click();
  await choose("Sky", page.locator("#selection-tools"));
  await until(async () => (await current()).nodes[0].color === "#aed7dc");
  await page.locator('[data-pro="object-style"]').click();
  await custom("#7755aa");
  await save("#canvas-style-form");
  await until(async () => (await current()).nodes[0].color === "#7755aa");
  await page.locator('.edge-label[data-edge="edge"]').dblclick();
  await choose("Rose", page.locator("#selection-tools"));

  await until(async () => (await current()).edges[0].color === "#f1a9a0");
  await page.reload();
  await page.locator("[data-action=project-edit]").click();
  assert.equal(await page.locator("[name=color]").inputValue(), "#edc48b");
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator(".color-picker > summary").click();
    const box = await page.locator(".color-picker-panel").boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.x + box.width <= width &&
        box.y >= 0 &&
        box.y + box.height <= 1000,
    );
    await page.screenshot({ path: `/tmp/pencils-colour-${width}.png` });
    await page.keyboard.press("Escape");
    assert.ok(
      await page.locator("dialog").isVisible(),
      "Escape closes picker before dialog",
    );
    assert.equal(
      await page.locator(".color-picker").evaluate((el) => el.open),
      false,
    );
  }
  assert.equal(await page.locator('input[type="color"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: shared palette and custom colours save for projects, organisations, objects and connectors; validation, keyboard, mobile bounds and reload persistence.",
  );
} catch (error) {
  await page.screenshot({
    path: "/tmp/pencils-colour-failure.png",
    fullPage: true,
  });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
