// Dependencies: the card editor keeps start and due side by side and leaves dependencies
// to the board, where an arrow between two task cards is a dependency with its own style
// (set in Board settings, undoable, kept on reload and in SVG exports). The arrow's menu
// makes or removes the dependency, and deleting the arrow keeps the dependency.
import fs from "node:fs/promises";
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Dependency lab" });
  const first = await store.createTask(project.id, { title: "Design" });
  const second = await store.createTask(project.id, { title: "Build", dependencies: [first.id] });
  await store.createTask(project.id, { title: "Ship", dependencies: [second.id] });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [first, second].map((task, i) => ({ id: `n${i}`, type: "task", task: task.id, x: 80 + i * 420, y: 200, w: 280, h: 220 })),
    edges: [{ id: "arrow", from: "n0", to: "n1", fromSide: "right", toSide: "left" }],
  });
  return { project, first, second };
});
// One arrow goes through the journey: styled, unmade, made again and finally deleted.
test.describe.configure({ mode: "serial" });

const snap = () => app.store.snapshot(app.project.id);
const dependencies = async () => (await snap()).tasks.find((task) => task.id === app.second.id).dependencies || [];
const arrow = (page) => page.locator('g[data-edge="arrow"] .canvas-edge');
const dependencyGlyphs = (page) => page.locator("g[data-task-dependency=true]");
const openBoard = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("[data-node=n1]").waitFor();
  await arrow(page).waitFor({ state: "attached" });
};
// Clicks the arrow a third of the way along: a selected arrow has its "drag to add bend"
// handle at the midpoint, and pressing that would add a bend instead of just selecting.
async function clickArrow(page) {
  const hit = page.locator('g[data-edge="arrow"] .connector-hit');
  // The arrow is redrawn when its dependency changes, so measure and click the current one.
  await expect(async () => {
    const box = await hit.boundingBox();
    expect(box, "the arrow is drawn").not.toBeNull();
    await hit.click({ force: true, position: { x: box.width / 3, y: box.height / 2 }, timeout: 2000 });
  }).toPass();
}
async function dependencyMenu(page) {
  await clickArrow(page);
  await page.locator('[data-selection-menu="dependency"] summary').click();
}
const hideSidebar = (page) =>
  page.evaluate(() => {
    document.querySelector(".sidebar")?.classList.remove("open");
    document.querySelector(".sidebar-overlay")?.classList.remove("visible");
  });

test("the card editor keeps start and due side by side and leaves dependencies alone", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action=task-open][data-id="${app.second.id}"]`).first().click();
  await page.getByLabel("Start date", { exact: true }).fill("2026-10-16");
  await page.getByLabel("Due date", { exact: true }).fill("2026-10-20");
  await expect.poll(async () => {
    const task = (await snap()).tasks.find((t) => t.id === app.second.id);
    return [task.start, task.due];
  }).toEqual(["2026-10-16", "2026-10-20"]);
  // The open editor is resized from desktop to phone.
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const start = await page.getByLabel("Start date", { exact: true }).boundingBox();
    const due = await page.getByLabel("Due date", { exact: true }).boundingBox();
    expect(start.x < due.x && Math.abs(start.y - due.y) < 1, `Dates stay beside each other at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await expect(page.locator(".task-dependencies,.task-parent-field,#task-form .file-path")).toHaveCount(0);
  expect(await dependencies()).toEqual([app.first.id]);
});

test("the dependency arrow style is set in Board settings, undone with Ctrl+Z, kept on reload and exported to SVG", async ({ page }) => {
  await openBoard(page);
  await dependencyGlyphs(page).first().waitFor();
  await expect(arrow(page)).toHaveAttribute("stroke", "#8863b2");
  await expect(arrow(page)).toHaveAttribute("style", /stroke-width:3;stroke-dasharray:8 5/);
  await clickArrow(page);
  await page.getByRole("button", { name: "Dependency arrow style in Board settings", exact: true }).click();
  const settings = page.locator(".dependency-style-settings");
  await settings.locator('[name="dependency-width"]').click();
  await page.locator("#shared-select-menu").getByRole("option", { name: "5 px", exact: true }).click();
  await settings.locator('[name="dependency-lineStyle"]').selectOption("dotted");
  await settings.locator('[name="dependency-toEnd"]').selectOption("arrow");
  await settings.locator(".color-picker summary").click();
  await settings.getByRole("button", { name: "Rose", exact: true }).click();
  const preview = settings.locator(".dependency-style-preview path").last();
  await expect(preview).toHaveAttribute("stroke", "#f1a9a0");
  await expect(preview).toHaveAttribute("style", /stroke-width:5;stroke-dasharray:1 5/);
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await hideSidebar(page);
    if (width < 780) {
      await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
      await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    }
    await settings.scrollIntoViewIfNeeded();
    expect(await settings.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${width}px: no overflow`).toBe(true);
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  const style = async () => (await snap()).boards[0].settings?.dependency_style;
  await expect.poll(async () => (await style())?.color).toBe("#f1a9a0");
  expect(await style()).toEqual({ color: "#f1a9a0", width: 5, lineStyle: "dotted", toEnd: "arrow" });
  await page.locator("[data-board-settings-reset]").click();
  await expect.poll(async () => (await style()).color).toBe("#8863b2");
  await page.locator("#board-settings-form").press("Control+z");
  await expect.poll(async () => (await style()).color).toBe("#f1a9a0");
  await expect(settings.locator('[name="dependency-width"]')).toHaveValue("5");
  await expect(settings.locator('[name="dependency-color"]')).toHaveValue("#f1a9a0");
  await page.getByRole("button", { name: "Close board settings", exact: true }).click();
  await page.reload();
  await expect(arrow(page)).toHaveAttribute("stroke", "#f1a9a0");
  await expect(arrow(page)).toHaveAttribute("style", /stroke-width:5;stroke-dasharray:1 5/);
  const more = page.locator(".board-toolbar details").filter({ has: page.locator('[data-feature="canvas-svg"]') });
  await more.locator("summary").click();
  const download = page.waitForEvent("download");
  await page.locator('[data-feature="canvas-svg"]').click();
  const svg = await fs.readFile(await (await download).path(), "utf8");
  expect(svg).toMatch(/stroke="#f1a9a0"/);
  expect(svg).toMatch(/stroke-width:5;stroke-dasharray:1 5/);
});

test("removing the dependency from its arrow restores the ordinary connector style", async ({ page }) => {
  await openBoard(page);
  await expect(page.locator('g[data-edge="arrow"] .edge-label')).toHaveText("blocks");
  await dependencyMenu(page);
  await page.getByRole("button", { name: "Remove dependency", exact: true }).click();
  await expect.poll(dependencies).not.toContain(app.first.id);
  await expect(dependencyGlyphs(page)).toHaveCount(0);
  await expect(arrow(page), "Ordinary connectors recover their own style").toHaveAttribute("stroke", "#78906f");
});

test("making a dependency from the arrow keeps the card editor free of dependency sections on desktop and phone", async ({ page }) => {
  await openBoard(page);
  await dependencyMenu(page);
  await page.getByRole("button", { name: "Make dependency", exact: true }).click();
  await expect.poll(dependencies).toContain(app.first.id);
  await page.locator("[data-node=n1] [data-pro=task-details]").click();
  await page.locator("#task-form").waitFor();
  await expect(page.locator(".task-dependencies")).toHaveCount(0);
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    await hideSidebar(page);
    if (width < 780) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
    expect(await page.locator("#task-form").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${width}px: no overflow`).toBe(true);
  }
  await page.locator("[data-action=dialog-close]").click();
  // Still at phone width: removing it there sticks after Escape.
  await dependencyMenu(page);
  await page.getByRole("button", { name: "Remove dependency", exact: true }).click();
  await expect.poll(dependencies).not.toContain(app.first.id);
  await expect(dependencyGlyphs(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dependencyGlyphs(page)).toHaveCount(0);
});

test("deleting a dependency arrow keeps the dependency", async ({ page }) => {
  await openBoard(page);
  await dependencyMenu(page);
  await page.getByRole("button", { name: "Make dependency", exact: true }).click();
  await expect.poll(dependencies).toContain(app.first.id);
  await clickArrow(page);
  await page.getByRole("button", { name: "Delete connector", exact: true }).click();
  await expect.poll(async () => (await snap()).boards[0].edges.length).toBe(0);
  expect(await dependencies()).toEqual([app.first.id]);
});
