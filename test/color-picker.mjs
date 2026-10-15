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
  const picker = host.locator(".color-picker").first();
  await picker.locator("summary").click();
  assert.equal(await picker.locator("[data-color-choice]").count(), 7);
  assert.equal(await picker.locator("[data-color-recents] > *").count(), 6);
  assert.equal(await picker.locator("[data-color-plane]").isVisible(), false);
  await picker.getByRole("button", { name: title, exact: true }).click();
}
async function custom(value, host = page.locator("dialog")) {
  const picker = host.locator(".color-picker").first();
  await picker.locator("summary").click();
  await picker.locator("[data-color-custom-toggle]").click();
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
  await choose("Peach", page.locator("#project-form"));
  await page.getByRole("button", { name: /Save project/ }).click();
  await page.getByText("Project updated.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Back to project", exact: true })
    .click();
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
  await custom("#7755aa", page.locator("#selection-tools"));
  await until(async () => (await current()).nodes[0].color === "#7755aa");
  await page.locator('.edge-label[data-edge="edge"]').dblclick();
  await choose("Rose", page.locator("#selection-tools"));

  await until(async () => (await current()).edges[0].color === "#f1a9a0");
  // Visual picking previews locally; applying creates one saved colour and a recent entry.
  await page.locator('[data-node="one"]').click();
  const objectPicker = page.locator(
    '#selection-tools [data-selection-menu="color"]',
  );
  await objectPicker.locator("summary").click();
  assert.equal(
    await objectPicker.locator("[data-color-plane]").isVisible(),
    false,
  );
  await objectPicker.locator("[data-color-custom-toggle]").click();
  const cameraBefore = await page
    .locator("#canvas-world")
    .getAttribute("style");
  const plane = objectPicker.locator("[data-color-plane]");
  const box = await plane.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3, {
    steps: 5,
  });
  await page.mouse.up();
  await objectPicker.locator("[data-color-hue]").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await objectPicker.locator("[data-color-hue]").inputValue(),
    "1",
  );
  await plane.focus();
  await page.keyboard.press("Shift+ArrowDown");
  const picked = await objectPicker.locator("[data-color-hex]").inputValue();
  assert.match(picked, /^#[a-f0-9]{6}$/);
  assert.notEqual(picked, "#7755aa");
  assert.equal((await current()).nodes[0].color, "#7755aa");
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    cameraBefore,
  );
  await objectPicker.locator("[data-color-apply]").click();
  await until(async () => (await current()).nodes[0].color === picked);
  let recent = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pencils:recent-colours")),
  );
  assert.equal(recent[0], picked);
  assert.equal(recent.length, 6);
  assert.equal(recent.includes("oops"), false);
  await page.locator('[data-node="two"]').click();
  await objectPicker.locator("summary").click();
  await objectPicker.locator(`[data-color-recent="${picked}"]`).click();
  await until(async () => (await current()).nodes[1].color === picked);
  recent = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pencils:recent-colours")),
  );
  assert.equal(recent.filter((v) => v === picked).length, 1);
  // Nested border menus share recent colours and stay inside the viewport.
  await page.locator('[data-selection-menu="geometry"] > summary').click();
  const borderPicker = page
    .locator("#selection-tools .color-picker")
    .filter({ has: page.locator('[name="object-border"]') });
  await borderPicker.locator("summary").click();
  const borderBox = await borderPicker
    .locator(".color-picker-panel")
    .boundingBox();
  assert.ok(borderBox.y >= 0 && borderBox.y + borderBox.height <= 1100);
  await borderPicker.locator(`[data-color-recent="${picked}"]`).click();
  await until(async () => (await current()).nodes[1].borderColor === picked);
  await page.keyboard.press("Escape");
  // Escape discards an unapplied visual edit; reopening matches the saved fill.
  await objectPicker.locator("summary").click();
  await objectPicker.locator("[data-color-custom-toggle]").click();
  await objectPicker.locator("[data-color-plane]").focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Escape");
  await objectPicker.locator("summary").click();
  assert.equal(
    await objectPicker.locator("[data-color-hex]").inputValue(),
    picked,
  );
  await page.keyboard.press("Escape");

  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  const backgroundPicker = page
    .locator("#board-settings-form .color-picker")
    .first();
  await backgroundPicker.locator("summary").click();
  assert.equal(
    await backgroundPicker.locator("[data-color-plane]").isVisible(),
    false,
  );
  await backgroundPicker.locator(`[data-color-recent="${picked}"]`).click();
  assert.equal(
    await page
      .locator('#board-settings-form [name="background-color"]')
      .inputValue(),
    picked,
  );
  await page
    .getByRole("button", { name: "Close board settings", exact: true })
    .click();
  await until(
    async () => (await current()).settings.background.color === picked,
  );
  await page.reload();
  await page.locator("[data-action=project-edit]").click();
  assert.equal(await page.locator("[name=color]").inputValue(), "#edc48b");
  assert.equal(
    await page.locator(`[data-color-recent="${picked}"]`).count(),
    1,
  );
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 390)
      await page.evaluate(
        () => (document.documentElement.dataset.theme = "dark"),
      );
    await page.locator(".color-picker > summary").click();
    const box = await page.locator(".color-picker-panel").boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.x + box.width <= width &&
        box.y >= 0 &&
        box.y + box.height <= 1000,
    );
    await page.screenshot({
      path: `/tmp/pencils-colour-${width}.png`,
      animations: "disabled",
    });
    await page.locator("[data-color-custom-toggle]").focus();
    await page.keyboard.press("Enter");
    assert.ok(await page.locator("[data-color-plane]").isVisible());
    const expanded = await page.locator(".color-picker-panel").boundingBox();
    assert.ok(
      expanded.x >= 0 &&
        expanded.x + expanded.width <= width &&
        expanded.y >= 0 &&
        expanded.y + expanded.height <= 1000,
    );
    await page.locator("[data-color-custom-toggle]").click();
    assert.equal(await page.locator("[data-color-plane]").isVisible(), false);
    await page.keyboard.press("Escape");
    assert.ok(
      await page.locator("#project-form").isVisible(),
      "Escape closes picker before leaving settings",
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
