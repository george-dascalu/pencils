// Background refreshes (29 October 2026). Changes from other browsers or Obsidian reach an open
// page within a second or two. Saves from this browser, and changes in other projects, no longer
// rebuild the page. When a rebuild does happen, keyboard focus stays on the same control (a board
// object, the board, a task opener) and an open New menu stays open.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Focus", key: "FO" });
  const other = await store.createProject({ title: "Elsewhere", key: "EL" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "n-sticky", type: "sticky", x: 120, y: 120, w: 180, h: 140, text: "Keep me focused" }] });
  return { project, other };
});

async function open(page, view = "board") {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await page.locator(view === "board" ? '#canvas [data-node="n-sticky"]' : ".topbar .new-menu > summary:visible").first().waitFor();
  // Let the first background check after loading settle before marking the page.
  await page.waitForTimeout(1200);
}
const markPage = (page) => page.evaluate(() => { document.querySelector(".shell").dataset.before = "yes"; });
const rebuilt = (page) => page.evaluate(() => !document.querySelector(".shell")?.dataset.before);

// A change from elsewhere in this project refreshes and rebuilds the page.
async function refreshFromElsewhere(page) {
  await markPage(page);
  await app.store.createTask(app.project.id, { title: `Elsewhere ${Date.now()}`, status: "todo" });
  await expect.poll(() => rebuilt(page), { timeout: 8000 }).toBe(true);
}

test("a change from elsewhere in this project appears without reloading", async ({ page }) => {
  await open(page, "list");
  const task = await app.store.createTask(app.project.id, { title: "Arrived from elsewhere", status: "todo" });
  await expect(page.locator(`#view-content [data-action="task-open"][data-id="${task.id}"]`).first()).toBeAttached({ timeout: 8000 });
});

test("moving a sticky saves without rebuilding the page", async ({ page }) => {
  await open(page);
  await markPage(page);
  const sticky = page.locator('#canvas [data-node="n-sticky"]');
  const box = await sticky.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 90, { steps: 8 });
  await page.mouse.up();
  const x = async () => (await app.store.snapshot(app.project.id)).boards[0].nodes.find((n) => n.id === "n-sticky").x;
  await expect.poll(x).not.toBe(120);
  // The refresh that follows this browser's own save finds nothing new.
  await page.waitForTimeout(2500);
  expect(await rebuilt(page), "the page was not rebuilt").toBe(false);
  // Selecting on the board focuses the board, so keyboard shortcuts act on the selection.
  await expect(page.locator("#canvas")).toBeFocused();
  // Put the sticky back for the other tests.
  const board = (await app.store.snapshot(app.project.id)).boards[0];
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: board.nodes.map((n) => (n.id === "n-sticky" ? { ...n, x: 120, y: 120 } : n)) });
});

test("the 30-second check after this browser's own save does not rebuild the page either", async ({ page }) => {
  await page.clock.install();
  await open(page);
  await markPage(page);
  const sticky = page.locator('#canvas [data-node="n-sticky"]');
  const box = await sticky.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 70, { steps: 6 });
  await page.mouse.up();
  const x = async () => (await app.store.snapshot(app.project.id)).boards[0].nodes.find((n) => n.id === "n-sticky").x;
  await expect.poll(x).not.toBe(120);
  await page.clock.runFor(2500);
  await page.clock.runFor(31000);
  // Let the check's request finish.
  await page.waitForTimeout(1000);
  expect(await rebuilt(page), "the page was not rebuilt").toBe(false);
  const board = (await app.store.snapshot(app.project.id)).boards[0];
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: board.nodes.map((n) => (n.id === "n-sticky" ? { ...n, x: 120, y: 120 } : n)) });
});

test("a change in another project does not rebuild this project's page", async ({ page }) => {
  await open(page, "list");
  await markPage(page);
  await app.store.createTask(app.other.id, { title: `Other project ${Date.now()}`, status: "todo" });
  // Nothing should change, so there is no state to wait for.
  await page.waitForTimeout(2500);
  expect(await rebuilt(page)).toBe(false);
});

test("the selected board object keeps focus when the board refreshes", async ({ page }) => {
  await open(page);
  await page.locator('#canvas [data-node="n-sticky"]').click();
  await page.locator('#canvas [data-node="n-sticky"]').focus();
  await refreshFromElsewhere(page);
  await expect(page.locator('#canvas [data-node="n-sticky"]'), "focus is back on the sticky after the rebuild").toBeFocused();
});

test("the board keeps focus when it refreshes with nothing selected", async ({ page }) => {
  await open(page);
  await page.locator("#canvas").focus();
  await refreshFromElsewhere(page);
  await expect(page.locator("#canvas")).toBeFocused();
});

test("a focused task opener keeps focus when the list refreshes", async ({ page }) => {
  const task = await app.store.createTask(app.project.id, { title: "Keep my row focused", status: "todo" });
  await open(page, "list");
  await page.locator(`#view-content [data-action="task-open"][data-id="${task.id}"]:visible`).first().focus();
  await refreshFromElsewhere(page);
  expect(await page.evaluate(() => [document.activeElement?.dataset.action, document.activeElement?.dataset.id])).toEqual(["task-open", task.id]);
});

test("closing the card editor before its save finishes keeps focus on the task", async ({ page }) => {
  const task = await app.store.createTask(app.project.id, { title: "Slow save", status: "todo" });
  await open(page, "list");
  // Hold the save response so the row is redrawn after the editor has closed.
  await page.route("**/api/projects/**", async (route) => {
    if (route.request().method() !== "GET") await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.locator(`#view-content [data-action="task-open"][data-id="${task.id}"]:visible`).first().click();
  await page.locator("#task-form [name=title]").fill("Slow save, renamed");
  // Long enough for autosave to send the change, short of its response.
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForFunction((id) => document.activeElement?.dataset.id === id, task.id);
  await page.evaluate(() => { document.querySelector("#view-content").dataset.before = "yes"; });
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === task.id).title).toBe("Slow save, renamed");
  await page.waitForFunction(() => !document.querySelector("#view-content")?.dataset.before, null, { timeout: 4000 }).catch(() => {});
  expect(await page.evaluate(() => [document.activeElement?.dataset.action, document.activeElement?.dataset.id])).toEqual(["task-open", task.id]);
});

for (const view of ["list", "board"])
  onDevices(["desktop", "phone"], () => {
    test(`an open New menu stays open when the ${view} refreshes`, async ({ page }) => {
      await open(page, view);
      await page.locator(".topbar .new-menu > summary:visible").first().click();
      const item = page.locator('.topbar .new-menu-panel:visible [data-action="task-new"]');
      await item.waitFor();
      await app.store.createTask(app.project.id, { title: `Elsewhere ${Date.now()}`, status: "todo" });
      // The refresh either waits until the menu closes or rebuilds with the menu still open.
      await page.waitForTimeout(2500);
      await expect(item, "the New menu is still open").toBeVisible();
    });
  });
