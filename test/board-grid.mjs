import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-grid-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Grid lab" }),
  initial = (await store.snapshot(project.id)).boards[0];
await store.updateBoard(project.id, initial.id, {
  revision: initial.revision,
  nodes: [],
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
    process.env.BROWSER === "firefox" ? firefox : chromium
  ).launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const current = async () => (await store.snapshot(project.id)).boards[0];
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await page.waitForTimeout(70);
  }
  throw Error("Save did not settle");
}
const cell = (r, c) =>
  page.locator(
    `.board-node.grid.selected [data-grid-row="${r}"][data-grid-column="${c}"]`,
  );
const camera = () =>
  page.locator("#canvas-world").evaluate((el) => el.style.transform);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await page.locator('[aria-label="Add grid"]').click();
  const box = await page.locator("#canvas").boundingBox();
  await page.mouse.click(box.x + 300, box.y + 220);
  await until(async () =>
    (await current()).nodes.some((n) => n.type === "grid"),
  );
  assert.equal(await page.locator(".grid-cell").count(), 9);
  const before = await camera();
  const title = page.locator(".grid-title");
  assert.equal(await title.textContent(), "Add a title…");
  assert.ok(
    Math.abs(
      (await title.evaluate(
        (el) =>
          parseFloat(getComputedStyle(el).fontSize) *
          new DOMMatrix(
            getComputedStyle(document.querySelector("#canvas-world")).transform,
          ).a,
      )) - 14,
    ) < 0.1,
  );
  assert.ok(
    Math.abs((await page.locator(".grid-grip").boundingBox()).height - 24) <
      0.1,
  );
  await title.dblclick();
  await page
    .getByRole("textbox", { name: "Grid title", exact: true })
    .fill("Release planning");
  await page.mouse.click(box.x + 950, box.y + 600);
  await until(
    async () => (await current()).nodes[0].grid.title === "Release planning",
  );
  assert.equal(await title.textContent(), "Release planning");
  assert.match((await current()).nodes[0].text, /^## Release planning/);
  await page.locator('[aria-label="Undo canvas change"]').click();
  await until(async () => !(await current()).nodes[0].grid.title);
  assert.equal(await title.textContent(), "Add a title…");
  await page.locator('[aria-label="Redo canvas change"]').click();
  await until(
    async () => (await current()).nodes[0].grid.title === "Release planning",
  );
  await page
    .getByRole("button", { name: "Edit grid title", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Grid title", exact: true })
    .fill("Roadmap & milestones");
  await page.keyboard.press("Enter");
  await until(
    async () =>
      (await current()).nodes[0].grid.title === "Roadmap & milestones",
  );
  await page
    .getByRole("button", { name: "Edit grid title", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Grid title", exact: true }).fill("");
  await page.keyboard.press("Enter");
  await until(async () => !(await current()).nodes[0].grid.title);
  assert.equal(await title.textContent(), "Add a title…");
  await page.locator('[aria-label="Undo canvas change"]').click();
  await until(
    async () =>
      (await current()).nodes[0].grid.title === "Roadmap & milestones",
  );
  await page
    .getByRole("button", { name: "Edit grid title", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Grid title", exact: true })
    .fill("Release planning");
  // Moving straight into a cell commits the title without replacing cell text.
  await page.locator('[data-grid-row="1"][data-grid-column="1"]').click();
  await until(
    async () => (await current()).nodes[0].grid.title === "Release planning",
  );
  await page.locator(".inline-rich").fill("A useful grid");
  await page.mouse.click(box.x + 950, box.y + 600);
  await until(
    async () =>
      (await current()).nodes[0].grid.cells[1][1].text === "A useful grid",
  );
  await page.locator(".grid-grip").click();
  await cell(1, 1).click();
  await page.locator('summary[aria-label="Row controls"]').click();
  await page.locator('[data-grid-action="rows:add"]').click();
  await until(async () => (await current()).nodes[0].grid.rows.length === 4);
  await page.locator('summary[aria-label="Column controls"]').click();
  await page.locator('[data-grid-action="columns:add"]').click();
  await until(async () => (await current()).nodes[0].grid.columns.length === 4);
  await cell(2, 2).click();
  await cell(2, 2).evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "One\tTwo\nThree\tFour");
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => "One\tTwo\nThree\tFour" },
    });
    el.dispatchEvent(event);
  });
  await until(
    async () => (await current()).nodes[0].grid.cells[3][3].text === "Four",
  );
  await cell(1, 1).click();
  await page.locator('summary[aria-label="Cell colour"]').click();
  await page.locator('[data-color-choice="#edc48b"]:visible').click();
  await until(
    async () => (await current()).nodes[0].grid.cells[1][1].color === "#edc48b",
  );
  await page.locator('[aria-label="Text alignment"]').first().click();
  await page.locator('#selection-tools [data-text-align="center"]').click();
  await until(
    async () => (await current()).nodes[0].grid.cells[1][1].align === "center",
  );
  assert.equal(
    await cell(1, 1)
      .locator(".grid-cell-text")
      .evaluate((el) => getComputedStyle(el).textAlign),
    "center",
  );
  // Tab commits one cell and keeps editing the next; clicking another cell also commits.
  await cell(0, 0).dblclick();
  await page.locator(".inline-rich").fill("First heading");
  await page.keyboard.press("Tab");
  await page.locator(".inline-rich").fill("Second heading");
  await cell(0, 2).click();
  await page.locator(".inline-rich").fill("Third heading");
  await page.mouse.click(box.x + 1000, box.y + 600);
  await until(
    async () =>
      (await current()).nodes[0].grid.cells[0][2].text === "Third heading",
  );
  assert.equal(
    (await current()).nodes[0].grid.cells[0][0].text,
    "First heading",
  );
  await page.locator(".grid-grip").click();
  // Real OS clipboard paste must win over the board's object clipboard.
  if (process.env.BROWSER !== "firefox") {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.keyboard.press("Control+c");
    await page.evaluate(() =>
      navigator.clipboard.writeText("Clipboard A\tClipboard B"),
    );
    await cell(3, 0).click();
    await page.keyboard.press("Control+v");
    await until(
      async () =>
        (await current()).nodes[0].grid.cells[3][1].text === "Clipboard B",
    );
  }
  const widths = (await current()).nodes[0].grid.columns;
  const handle = await page
    .locator(".grid-track-handle.column")
    .first()
    .boundingBox();
  await page.mouse.move(handle.x + 4, handle.y + 30);
  await page.mouse.down();
  await page.mouse.move(handle.x + 34, handle.y + 30, { steps: 6 });
  await page.mouse.up();
  await until(
    async () => (await current()).nodes[0].grid.columns[0] !== widths[0],
  );
  assert.equal(await camera(), before);
  const resized = (await current()).nodes[0];
  assert.ok(resized.grid.columns[0] > widths[0]);
  for (let i = 1; i < widths.length; i++)
    assert.ok(Math.abs(resized.grid.columns[i] - widths[i]) < 0.01);
  // Outer border scales every column; Escape restores the full gesture.
  const edge = await page.locator(".grid-edge-handle.right").boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + 40);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + 50, edge.y + 40, {
    steps: 8,
  });
  assert.equal(await page.locator(".grid-resize-dimensions").count(), 1);
  const labelWidth = await page
    .locator('[data-grid-axis="columns"][data-track="0"]')
    .evaluate((el) => parseFloat(el.style.width));
  assert.ok(labelWidth > resized.grid.columns[0]);
  await page.screenshot({ path: "/tmp/pencils-grid-resize.png" });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await page.locator(".grid-resize-dimensions").count(), 0);
  assert.deepEqual((await current()).nodes[0].grid, resized.grid);
  // Commit an outer-edge resize, then undo it as one action.
  const right = await page.locator(".grid-edge-handle.right").boundingBox();
  await page.mouse.move(right.x + right.width / 2, right.y + 40);
  await page.mouse.down();
  await page.mouse.move(right.x + right.width / 2 + 50, right.y + 40, {
    steps: 8,
  });
  await page.mouse.up();
  await until(async () => (await current()).nodes[0].w > resized.w + 30);
  const scaled = (await current()).nodes[0];
  for (let i = 0; i < widths.length; i++) {
    assert.ok(scaled.grid.columns[i] > resized.grid.columns[i]);
    assert.ok(
      Math.abs(
        scaled.grid.columns[i] / resized.grid.columns[i] - scaled.w / resized.w,
      ) < 0.001,
    );
  }
  await page.locator('[aria-label="Undo canvas change"]').click();
  await until(async () => (await current()).nodes[0].w === resized.w);
  await page.locator(".grid-grip").click();
  // Final row has its own handle, independently of the outer all-row edge.
  const lastRow = await page
    .locator(".grid-track-handle.row.last-track")
    .boundingBox();
  await page.mouse.move(lastRow.x + 10, lastRow.y + lastRow.height / 2);
  await page.mouse.down();
  await page.mouse.move(lastRow.x + 10, lastRow.y + lastRow.height / 2 + 30, {
    steps: 6,
  });
  await page.mouse.up();
  await until(async () => (await current()).nodes[0].h > resized.h + 20);
  const finalRows = (await current()).nodes[0].grid.rows;
  for (let i = 0; i < finalRows.length - 1; i++)
    assert.ok(Math.abs(finalRows[i] - resized.grid.rows[i]) < 0.01);
  assert.equal(await camera(), before);
  await cell(0, 0).click();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page
      .locator(".grid-cell.active-cell")
      .getAttribute("data-grid-column"),
    "1",
  );
  const download = page.waitForEvent("download");
  await page.locator('[data-grid-action="csv"]').click();
  assert.equal((await download).suggestedFilename(), "grid.csv");
  await page.locator('[data-feature="duplicate"]').click();
  await until(async () => (await current()).nodes.length === 2);
  const nodes = (await current()).nodes;
  assert.deepEqual(nodes[0].grid, nodes[1].grid);
  assert.equal(await camera(), before);
  await page.locator('[aria-label="Undo canvas change"]').click();
  await until(async () => (await current()).nodes.length === 1);
  await page.reload();
  await page.locator(".board-node.grid").waitFor();
  assert.equal(await title.textContent(), "Release planning");
  assert.equal(await page.locator(".grid-cell").count(), 16);
  assert.match(
    await page.locator(".board-node.grid").innerText(),
    /A useful grid/,
  );
  await page.locator(".grid-grip").click();
  await page.screenshot({ path: "/tmp/pencils-grid-desktop.png" });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({ path: "/tmp/pencils-grid-dark.png" });
  await page.locator('[data-personal="sidebar"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="board-fit"]').click();
  await page.waitForTimeout(300);
  const toolbarBounds = await page.locator("#selection-tools").boundingBox();
  assert.ok(
    toolbarBounds.x >= 0 && toolbarBounds.x + toolbarBounds.width <= 391,
  );
  const mobileHandle = await page
    .locator(".grid-track-handle.column")
    .first()
    .boundingBox();
  assert.ok(
    Math.abs(mobileHandle.width - 8) < 0.2,
    "Resize target stays 8 screen pixels wide when zoomed out",
  );
  await page
    .getByRole("button", { name: "Edit grid title", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Grid title", exact: true })
    .fill("Mobile planning");
  await page.keyboard.press("Enter");
  await until(
    async () => (await current()).nodes[0].grid.title === "Mobile planning",
  );
  assert.equal(await title.textContent(), "Mobile planning");
  for (const action of ["zoom-out", "zoom-out", "zoom-in"]) {
    await page.locator(`[data-action="${action}"]`).click();
    await page.waitForFunction(
      () => !document.querySelector("#canvas").classList.contains("zooming"),
    );
    const header = await page.locator(".grid-grip").boundingBox();
    const pencil = await page.locator(".grid-title-edit").boundingBox();
    assert.ok(
      Math.abs(header.height - 24) < 0.2,
      "Title bar stays 24 screen pixels high",
    );
    assert.ok(
      Math.abs(pencil.width - 20) < 0.2,
      "Title edit button stays usable at any zoom",
    );
    const column = await page
      .locator(".grid-axis-label.column")
      .first()
      .boundingBox();
    assert.ok(
      column.y + column.height <= header.y,
      "Column handles do not cover the title",
    );
  }
  await page
    .getByRole("button", { name: "Edit grid title", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Grid title", exact: true })
    .fill("Zoomed title");
  await page.keyboard.press("Enter");
  await until(
    async () => (await current()).nodes[0].grid.title === "Zoomed title",
  );
  await page.screenshot({ path: "/tmp/pencils-grid-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Board grid: editable titles, autosave, title undo/redo, placement, inline save, structure, paste, colour, alignment, track resize, navigation, CSV, duplicate/undo and reload passed.",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-grid-failure.png" });
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  store.close?.();
  await fs.rm(root, { recursive: true, force: true });
}
