// Kanban swimlanes: lanes by assignee, priority or type with defaults, collapse and
// persistence; dragging across lanes updates the lane field and status, while fields
// managed by a connected source stay protected; lanes fill the window with status columns
// aligned in every lane, sticky headers, Back restoration, touch opening and both themes.
// Desktop tests belong to the cross-browser release gate.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal, selectProjectView } from "../helpers/menu-controls.mjs";

const gate = { tag: "@gate" };
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Kanban swimlanes" });
  const a = await store.createTask(project.id, { title: "Design the compact cards", status: "todo", assignee: "George", priority: "high" });
  const b = await store.createTask(project.id, { title: "Review the plan", status: "todo", assignee: "Pat", priority: "low", type: "bug" });
  await store.createTask(project.id, { title: "Unassigned work", status: "backlog" });
  const imported = await store.createTask(project.id, { title: "Source task", status: "todo", assignee: "George", priority: "high" });
  const file = store.file(project.id, "tasks", imported.id), record = await store.read(file);
  await store.write(file, { ...record.data, source: { provider: "jira", external_id: "one", key: "JIRA-1" } }, record.body, record);
  return { project, a, b, imported };
});
test.use({ viewportSize: { width: 1600, height: 1000 } });

const board = (page) => page.locator("#view-content > .kanban");
const group = (page) => page.locator("#kanban-group");
const lane = (page, value) => page.locator(`.kanban-lane[data-lane-value="${value}"]`);
const column = (page, value, status) => lane(page, value).locator(`[data-drop-status="${status}"]`);
const card = (page, id) => page.locator(`[data-drag-task="${id}"]`);
// Sorted by ID: the store does not promise an order.
const snapshot = async () => (await app.store.snapshot(app.project.id)).tasks.sort((x, y) => x.id.localeCompare(y.id));
const task = async (id) => (await snapshot()).find((t) => t.id === id);

async function open(page, grouping) {
  await page.goto(`${app.base}/#project/${app.project.id}/kanban`);
  await group(page).waitFor({ state: "attached" });
  if (grouping) await group(page).selectOption(grouping);
}
async function reload(page) {
  await Promise.all([page.waitForEvent("domcontentloaded"), page.evaluate(() => location.reload())]);
  await group(page).waitFor();
}
async function move(page, id, value, status) {
  const response = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().endsWith(`/tasks/${id}`));
  // Drop near the column's top: the drop placeholder grows the lane downward while dragging,
  // so a centre point computed beforehand can land on the next lane (cards are taller since 0.19.10).
  await card(page, id).dragTo(column(page, value, status), { targetPosition: { x: 40, y: 24 } });
  expect((await response).status()).toBe(200);
  await column(page, value, status).locator(`[data-drag-task="${id}"]`).waitFor();
}
async function fits(page) {
  const metrics = await board(page).evaluate((el) => ({
    width: el.clientWidth,
    scrollWidth: el.scrollWidth,
    height: el.clientHeight,
    bottom: el.getBoundingClientRect().bottom,
    parent: el.parentElement.getBoundingClientRect().bottom,
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
  }));
  expect(metrics.height > 200 && metrics.parent - metrics.bottom < 20, `lanes fill the component ${JSON.stringify(metrics)}`).toBe(true);
  expect(metrics.pageWidth <= metrics.viewportWidth && metrics.pageHeight <= metrics.viewportHeight + 1, `no page scrolling ${JSON.stringify(metrics)}`).toBe(true);
  const rows = await page.locator(".kanban-lane-row").evaluateAll((els) => els.filter((el) => !el.hidden).map((el) => [...el.children].map((c) => c.getBoundingClientRect().x)));
  expect(rows.every((row) => row.every((x, i) => Math.abs(x - rows[0][i]) < 2)), "Status columns align in every lane").toBe(true);
}

test("grouping by assignee shows lanes without editing tasks, and Add in a lane presets its assignee and status", gate, async ({ page }) => {
  await open(page);
  await expect(group(page)).toHaveValue("none");
  const initial = await snapshot();
  await group(page).selectOption("assignee");
  await expect(page.locator(".kanban-lane")).toHaveCount(3);
  await expect(lane(page, "George").locator(".kanban-card")).toHaveCount(2);
  await expect(lane(page, "").locator(".kanban-lane-heading")).toHaveText("Unassigned1");
  expect(await snapshot(), "Grouping does not edit tasks").toEqual(initial);
  await column(page, "Pat", "in-progress").locator(".add-row").click();
  await page.locator("#task-form").waitFor({ timeout: 5000 });
  await expect(page.locator("#task-form [name=assignee]")).toHaveValue("Pat");
  await expect(page.locator("#task-form [name=status]")).toHaveValue("in-progress");
  await page.locator('[data-action="dialog-close"]').click();
});

test("a collapsed lane stays collapsed after reload", gate, async ({ page }) => {
  await open(page, "assignee");
  await lane(page, "George").locator("[data-kanban-collapse]").click();
  await expect(lane(page, "George").locator(".kanban-lane-row")).toBeHidden();
  await reload(page);
  await expect(group(page)).toHaveValue("assignee");
  await expect(lane(page, "George").locator(".kanban-lane-row")).toBeHidden();
  await lane(page, "George").locator("[data-kanban-collapse]").click();
  await expect(lane(page, "George").locator(".kanban-lane-row")).toBeVisible();
});

test("dragging across lanes sets the lane's assignee, priority or type, and source tasks keep their assignee", gate, async ({ page }) => {
  await open(page, "assignee");
  await move(page, app.a.id, "Pat", "in-progress");
  expect((await task(app.a.id)).assignee).toBe("Pat");
  expect((await task(app.a.id)).priority).toBe("high");
  expect((await task(app.b.id)).status).toBe("todo");
  await card(page, app.imported.id).dragTo(column(page, "Pat", "in-progress"));
  await expect(lane(page, "George").locator(`[data-drag-task="${app.imported.id}"]`)).toBeVisible();
  expect((await task(app.imported.id)).assignee).toBe("George");
  await group(page).selectOption("priority");
  await move(page, app.a.id, "low", "in-progress");
  expect((await task(app.a.id)).priority).toBe("low");
  await group(page).selectOption("type");
  await move(page, app.a.id, "bug", "in-progress");
  expect((await task(app.a.id)).type).toBe("bug");
});

test("lane grouping is remembered across reload without a named view, and an empty search keeps one full-size lane", gate, async ({ page }) => {
  await open(page, "priority");
  await expect(page.locator('#saved-view,[data-feature="view-save"]')).toHaveCount(0);
  await page.reload();
  await group(page).waitFor({ state: "attached" });
  await expect(group(page)).toHaveValue("priority");
  await group(page).selectOption("none");
  await expect(page.locator(".kanban-lane")).toHaveCount(0);
  await group(page).selectOption("priority");
  await expect(group(page)).toHaveValue("priority");
  await page.locator("#search").fill("No matching cards");
  await page.waitForFunction(() => !document.querySelector(".kanban-card"));
  await expect(page.locator(".kanban-lane")).toHaveCount(1);
  await fits(page);
  await page.locator("#search").fill("");
  await card(page, app.a.id).waitFor();
});

test("lanes fill the window and align their status columns at desktop and phone width, in both themes", gate, async ({ page }) => {
  await open(page, "priority");
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await fits(page);
    }
  }
});

test("lane headers stay put while lanes scroll, and Back restores the vertical position", gate, async ({ page }) => {
  for (let i = 0; i < 20; i++) await app.store.createTask(app.project.id, { title: `Extra ${i}`, status: "todo", priority: "high" });
  await open(page, "priority");
  await page.waitForFunction(() => document.querySelectorAll(".kanban-card").length >= 24);
  const header = await page.locator(".kanban-lanes-header").boundingBox();
  await board(page).evaluate((el) => (el.scrollTop = 300));
  expect(Math.abs((await page.locator(".kanban-lanes-header").boundingBox()).y - header.y)).toBeLessThan(2);
  await page.waitForFunction(() => history.state?.scroll?.kanbanY >= 300);
  await selectProjectView(page, "overview");
  await page.goBack();
  await page.waitForFunction(() => document.querySelector(".kanban")?.scrollTop >= 300);
  await expect(group(page)).toHaveValue("priority");
});

onDevices(["phone"], () => {
  test.use({ viewportSize: null });
  test("tapping a card in a lane opens it", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/kanban`);
    await board(page).waitFor();
    await (await reveal(group(page))).selectOption("priority");
    await page.locator(".mobile-view-options").evaluateAll((els) => els.forEach((el) => (el.open = false)));
    await page.waitForFunction(() => document.querySelector(".kanban")?.dataset.group === "priority");
    await page.locator(".kanban-card .card-bottom").first().tap();
    await page.locator("#task-form").waitFor();
    await page.locator('[data-action="dialog-close"]').click();
  });
});
