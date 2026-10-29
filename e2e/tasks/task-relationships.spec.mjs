// Card relationships: parent/child, blocks/blocked-by and related links are added and
// removed from the card editor, saving both ends while keeping other edits; related rows
// show assignee, status and priority and sort without changing data; cycles are refused;
// links show from either end; failed saves are shown and retried; the board's editor and
// the picker fit desktop and phone in light and dark themes.
import { test, expect, useApp } from "../fixtures.mjs";
import { relationshipTypes } from "../../public/task-relationship-model.js";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Relationships" });
  const parent = await store.createTask(project.id, { title: "Release", type: "epic" });
  const main = await store.createTask(project.id, { title: "Build", parent: parent.id });
  const child = await store.createTask(project.id, { title: "Test with a long title that wraps correctly in narrow panels" });
  const blocker = await store.createTask(project.id, { title: "Design" });
  const successor = await store.createTask(project.id, { title: "Ship", dependencies: [blocker.id] });
  const related = await store.createTask(project.id, { title: "Notes", assignee: "George", priority: "high", status: "in-progress" });
  const urgent = await store.createTask(project.id, { title: "Urgent follow-up", assignee: "Alice", priority: "urgent", status: "done" });
  const lowest = await store.createTask(project.id, { title: "Later", priority: "none", status: "backlog" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "build", type: "task", task: main.id, x: 80, y: 100, w: 280, h: 220 }] });
  return { project, parent, main, child, blocker, successor, related, urgent, lowest };
});
// The links built in the first test are sorted, refused, followed and removed in order.
test.describe.configure({ mode: "serial" });

const saved = async (id) => (await app.store.snapshot(app.project.id)).tasks.find((task) => task.id === id);
const section = (page) => page.getByRole("region", { name: "Relationships", exact: true });
const row = (page, kind, task) => section(page).locator(`[data-relationship-remove="${task.id}"][data-relationship-kind="${kind}"]`);
const openCard = async (page, task = app.main) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action=task-open][data-id="${task.id}"]`).first().click();
  await section(page).waitFor();
};
async function picker(page, kind, query = "") {
  if (!(await section(page).locator("[data-relationship-picker]").isVisible())) await section(page).locator("[data-relationship-toggle]").click();
  await section(page).getByLabel("Relationship type", { exact: true }).click();
  await page.locator("#shared-select-menu").getByRole("option", { name: relationshipTypes.find(([value]) => value === kind)[1], exact: true }).click();
  await section(page).getByLabel("Find a task to link", { exact: true }).fill(query);
}
async function add(page, kind, task) {
  await picker(page, kind, task.key);
  await section(page).locator(`[data-relationship-add="${task.id}"]`).click();
  await expect(section(page).locator("[data-relationship-picker]")).toBeHidden();
}

test("adding parent/child, blocking and related links saves both ends and keeps description edits", async ({ page }) => {
  const { main, parent, child, blocker, successor, related, urgent, lowest } = app;
  await openCard(page);
  await expect(row(page, "parent", parent)).toHaveCount(1);
  await page.locator('.task-description [contenteditable="true"]').fill("Keep these description edits");
  await add(page, "child", child);
  await expect.poll(async () => (await saved(child.id)).parent).toBe(main.id);
  expect((await saved(main.id)).body).toMatch(/Keep these description edits/);
  await add(page, "blocked-by", blocker);
  await expect.poll(async () => (await saved(main.id)).dependencies).toContain(blocker.id);
  await add(page, "blocks", successor);
  await expect.poll(async () => (await saved(successor.id)).dependencies).toContain(main.id);
  expect((await saved(successor.id)).dependencies, "Existing blockers survive").toContain(blocker.id);
  await add(page, "related", related);
  await expect.poll(async () => (await saved(main.id)).related_records).toContain(related.id);
  await add(page, "related", urgent);
  await add(page, "related", lowest);
  await expect.poll(async () => (await saved(main.id)).related_records).toEqual(expect.arrayContaining([related.id, urgent.id, lowest.id]));
});

test("related rows show assignee, status and priority, and sorting never changes task data", async ({ page }) => {
  const { related, urgent, lowest } = app;
  await openCard(page);
  const relatedGroup = section(page).locator(".task-relationship-group").filter({ has: page.getByRole("heading", { name: "Related to", exact: true }) });
  const order = () => relatedGroup.locator("[data-relationship-open]").evaluateAll((els) => els.map((el) => el.dataset.relationshipOpen));
  const beforeSort = (await app.store.snapshot(app.project.id)).tasks;
  const meta = section(page).locator(`[data-relationship-open="${related.id}"] .task-relationship-metadata`);
  // Assignee is an avatar with its name in the accessible label, then status, then priority (0.19.9).
  await expect(meta.getByRole("img", { name: /^Assignee: George/ })).toHaveAttribute("title", /George/);
  await expect(meta).toContainText("In progress");
  expect(await meta.innerText()).not.toMatch(/George/);
  await expect(meta.getByRole("img", { name: "Priority: High" })).toHaveAttribute("title", "High");
  await expect(meta.locator('[data-task-color="assignee"],[data-task-color="priority"],[data-task-color="status"]')).toHaveCount(3);
  await section(page).locator(".task-relationship-sort > summary").click();
  // The options show straight away (29 Oct), without a second control to open.
  const sortBy = (name) => section(page).locator(".task-relationship-sort").getByRole("option", { name, exact: true }).click();
  await expect(section(page).locator(".task-relationship-sort").getByRole("option")).toHaveText(["Relationship order", "Assignee", "Status", "Priority"]);
  await expect(section(page).getByRole("option", { name: "Relationship order" })).toHaveAttribute("aria-selected", "true");
  await sortBy("Assignee");
  await expect(section(page).getByRole("option", { name: "Assignee" })).toHaveAttribute("aria-selected", "true");
  await expect.poll(order).toEqual([urgent.id, related.id, lowest.id]);
  await sortBy("Priority");
  await expect.poll(order).toEqual([urgent.id, related.id, lowest.id]);
  await section(page).getByRole("button", { name: "Reverse relationship sort" }).click();
  await expect.poll(order).toEqual([lowest.id, related.id, urgent.id]);
  await sortBy("Priority");
  await expect(section(page).getByRole("button", { name: "Reverse relationship sort" }), "Choosing the current sort keeps Reverse order").toHaveAttribute("aria-pressed", "true");
  await section(page).getByRole("option", { name: "Priority" }).press("ArrowDown");
  await expect(section(page).getByRole("option", { name: "Relationship order" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(section(page).getByRole("option", { name: "Priority" })).toBeFocused();
  await sortBy("Status");
  await expect.poll(order).toEqual([lowest.id, related.id, urgent.id]);
  expect((await app.store.snapshot(app.project.id)).tasks, "Sorting never changes task data").toEqual(beforeSort);
  await row(page, "related", urgent).click();
  await expect(row(page, "related", urgent)).toHaveCount(0);
  await row(page, "related", lowest).click();
  await expect(row(page, "related", lowest)).toHaveCount(0);
});

test("the picker refuses parent/child cycles and blocking loops, and Escape closes only the picker", async ({ page }) => {
  await openCard(page);
  await picker(page, "parent", app.child.key);
  await expect(section(page).locator(`[data-relationship-add="${app.child.id}"]`)).toBeDisabled();
  await expect(section(page).locator("[data-relationship-options]")).toContainText(/parent\/child cycle/);
  await picker(page, "blocked-by", app.successor.key);
  await expect(section(page).locator(`[data-relationship-add="${app.successor.id}"]`)).toBeDisabled();
  await page.getByLabel("Find a task to link", { exact: true }).press("Escape");
  await expect(page.locator(".task-dialog")).toBeVisible();
  await expect(section(page).locator("[data-relationship-picker]")).toBeHidden();
});

test("a related link shows on the other card, which can follow and remove it", async ({ page }) => {
  await openCard(page);
  await section(page).locator(`[data-relationship-open="${app.related.id}"]`).click();
  await expect(page.locator("#task-form")).toHaveAttribute("data-id", app.related.id);
  await expect(row(page, "related", app.main)).toHaveCount(1);
  await row(page, "related", app.main).click();
  await expect.poll(async () => (await saved(app.main.id)).related_records || []).not.toContain(app.related.id);
});

test("removing parent, child and blocking links clears both ends and keeps other blockers", async ({ page }) => {
  const { main, parent, child, blocker, successor } = app;
  await openCard(page);
  for (const [kind, target] of [
    ["parent", parent],
    ["child", child],
    ["blocked-by", blocker],
    ["blocks", successor],
  ]) {
    await row(page, kind, target).click();
    await expect(row(page, kind, target)).toHaveCount(0);
  }
  await expect.poll(async () => [(await saved(main.id)).parent, (await saved(child.id)).parent, (await saved(main.id)).dependencies, (await saved(successor.id)).dependencies]).toEqual([null, null, [], [blocker.id]]);
});

test("a failed relationship save is shown and retried by the save queue", async ({ page }) => {
  const { main, child } = app;
  await openCard(page);
  const url = `**/api/projects/${app.project.id}/tasks/${child.id}`;
  await page.route(url, (route) =>
    route.request().method() === "PATCH" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Relationship test outage" }) }) : route.continue(),
  );
  await add(page, "child", child);
  await expect(section(page).locator("[data-relationship-status]")).toContainText(/outage/);
  expect((await saved(child.id)).parent).toBe(null);
  await page.unroute(url);
  await expect.poll(async () => (await saved(child.id)).parent, { timeout: 15000 }).toBe(main.id);
  await expect(section(page).locator("[data-relationship-status]")).toContainText(/saved/);
});

test("the board's card editor shows the links, and the picker fits desktop and phone in both themes", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-node="build"] [data-pro="task-details"]').click();
  await expect(row(page, "child", app.child)).toHaveCount(1);
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 780) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
    await picker(page, "blocked-by", app.blocker.key);
    await section(page).scrollIntoViewIfNeeded();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      expect(await section(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${width}px ${theme}: no overflow`).toBe(true);
      const box = await section(page).boundingBox();
      expect(box.x >= 0 && box.x + box.width <= width + 1, `${width}px ${theme}: on screen`).toBe(true);
    }
    await section(page).getByRole("button", { name: "Close relationship picker", exact: true }).click();
  }
});
