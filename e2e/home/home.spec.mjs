// The personal Home (owner request T22, 31 October 2026): each person's own page of panels on a
// 12-column grid, opened at start, from the brand, a Home row at the top of the sidebar and the
// phone bar's first tab. Edit layout moves and resizes panels by hand (push-down placement),
// adds from a catalogue and removes; it autosaves per person. Phones stack the panels in reading
// order without dragging.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSidebar } from "../helpers/menu-controls.mjs";
import { axeViolations } from "../helpers/documents.mjs";
import { defaultPanels } from "../../server/home.js";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Home lab", key: "HL" });
  await store.createTask(project.id, { title: "Mine, due soon", assignee: "George", due: "2026-11-02" });
  return { project };
});
const panel = (page, type) => page.locator(`.home-panel[data-type="${type}"]`);
const layout = (page) => page.evaluate(async () => (await (await fetch("/api/home")).json()).panels);
const at = (page, type) => panel(page, type).evaluate((el) => ["x", "y", "w", "h"].map((k) => Number(el.style.getPropertyValue(`--${k}`))));
async function dragBy(page, handle, dx, dy) {
  // Centred first, so the whole drag stays inside the viewport (iPad landscape is short).
  await handle.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx / 2, box.y + box.height / 2 + dy / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 4 });
  await page.mouse.up();
}

onDevices(["desktop", "ipad", "phone"], () => test("Home opens at start, from the brand, the sidebar's Home row and the phone bar, with the default panels", async ({ page, device }) => {
  await page.goto(app.base);
  await expect(page).toHaveURL(/#(home|organisation\/[\w-]+\/home)$/);
  await expect(page.locator(".topbar strong")).toHaveText("Home");
  await expect(page.locator(".home-grid .home-panel")).toHaveCount(5);
  expect(await page.locator(".home-grid .home-panel").evaluateAll((els) => els.map((el) => el.dataset.type))).toEqual(["projects", "bookmarks", "recent", "stat", "tasks"]);
  await expect(panel(page, "projects").locator(".project-card")).toHaveCount(1);
  expect(await axeViolations(page, ".home"), `${device}: accessible`).toEqual([]);
  // Open a project, then come back each way.
  await panel(page, "projects").locator(".project-card").click();
  await expect(page.locator(".task-row")).toHaveCount(1);
  if (device !== "desktop") {
    const first = page.locator(".topbar .tabs .tab").first();
    await expect(first).toHaveAttribute("aria-label", "Home");
    await first.click();
    await expect(page).toHaveURL(/#(home|organisation\/[\w-]+\/home)$/);
    await page.locator(".home-grid").waitFor();
    await page.goBack();
    await expect(page.locator(".task-row")).toHaveCount(1);
  }
  await openSidebar(page);
  const row = page.locator(".sidebar .personal-links button").first();
  await expect(row).toHaveText("Home");
  await row.click();
  await expect(page).toHaveURL(/#(home|organisation\/[\w-]+\/home)$/);
  await page.locator(".home-grid").waitFor();
  await expect(page.locator(".sidebar"), "choosing closes the sidebar").not.toHaveClass(/\bopen\b/);
  await panel(page, "projects").locator(".project-card").click();
  await expect(page.locator(".task-row")).toHaveCount(1);
  await openSidebar(page);
  await page.locator(".sidebar .brand").click();
  await expect(page).toHaveURL(/#(home|organisation\/[\w-]+\/home)$/);
  await page.locator(".home-grid").waitFor();
}));

onDevices(["desktop", "ipad"], () => test("Edit layout drags, resizes, removes and adds panels, pushing overlapped panels down, and the layout persists", async ({ page, device }) => {
  await page.goto(app.base);
  await page.locator(".home-grid").waitFor();
  // Layouts are per person: start from the defaults whatever an earlier test saved.
  await page.evaluate((panels) => fetch("/api/home", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ panels }) }), defaultPanels());
  await page.reload();
  await page.locator(".home-grid").waitFor();
  await expect(page.locator("[data-home-drag]")).toHaveCount(0);
  await page.locator('[data-home="edit"]').click();
  await expect(page.locator('[data-home="edit"]')).toHaveAttribute("aria-pressed", "true");
  const grid = await page.locator(".home-grid").boundingBox();
  const cell = (grid.width + 12) / 12, row = 52; // a column or row plus the 12px gap
  expect(await at(page, "stat")).toEqual([8, 4, 4, 3]);
  expect(await at(page, "tasks")).toEqual([0, 10, 12, 6]);
  // Dragging Stat down onto the task list pushes the list below it.
  await dragBy(page, panel(page, "stat").locator("[data-home-drag]"), 0, 7 * row);
  await expect.poll(() => at(page, "stat"), `${device}: moved`).toEqual([8, 11, 4, 3]);
  expect(await at(page, "tasks")).toEqual([0, 14, 12, 6]);
  await expect.poll(() => layout(page).then((p) => p.find((x) => x.type === "stat").y), "saved").toBe(11);
  // Resizing from the corner.
  await dragBy(page, panel(page, "stat").locator("[data-home-resize]"), -1 * cell, 2 * row);
  await expect.poll(() => at(page, "stat")).toEqual([8, 11, 3, 5]);
  // Removing and adding.
  await panel(page, "recent").locator('[data-board-menu^="panel-"] > summary').click();
  await page.locator('[data-home-panel-action="remove"]:visible').click();
  await expect(page.locator(".home-grid .home-panel")).toHaveCount(4);
  await page.locator('[data-board-menu="home-add"] > summary').click();
  await page.locator('[data-home-add="note"]').click();
  await expect(panel(page, "note")).toHaveCount(1);
  expect((await at(page, "note"))[1], "added below everything").toBeGreaterThanOrEqual(20);
  await page.reload();
  await page.locator(".home-grid").waitFor();
  expect(await page.locator(".home-grid .home-panel").evaluateAll((els) => els.map((el) => el.dataset.type))).toEqual(["projects", "bookmarks", "stat", "tasks", "note"]);
  expect(await at(page, "stat")).toEqual([8, 11, 3, 5]);
  await expect(page.locator('[data-home="edit"]'), "editing is off after a reload").toHaveAttribute("aria-pressed", "false");
}));

onDevices(["phone"], () => test("phones stack the panels in reading order without drag handles, and still add and remove", async ({ page }) => {
  await page.goto(app.base);
  await page.locator(".home-grid").waitFor();
  await page.evaluate((panels) => fetch("/api/home", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ panels }) }), defaultPanels());
  await page.reload();
  await page.locator(".home-grid").waitFor();
  const lefts = await page.locator(".home-grid .home-panel").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
  expect(new Set(lefts).size, "one column").toBe(1);
  const tops = await page.locator(".home-grid .home-panel").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);
  await page.locator('[data-home="edit"]').click();
  await expect(page.locator("[data-home-drag]:visible, [data-home-resize]:visible")).toHaveCount(0);
  await page.locator('[data-board-menu="home-add"] > summary').click();
  await page.locator('[data-home-add="note"]').click();
  await expect(panel(page, "note")).toHaveCount(1);
  await panel(page, "note").locator('[data-board-menu^="panel-"] > summary').click();
  await page.locator('[data-home-panel-action="remove"]:visible').click();
  await expect(panel(page, "note")).toHaveCount(0);
}));
