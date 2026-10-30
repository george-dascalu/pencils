// Owner request, 30 October 2026: the Sort menu starts with Manual order, groups the sorts under
// Card, Progress and Dates, and adds Card ID, Parent and Assignee.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Sort options", key: "SO" });
  const [b, a] = [await store.createTask(project.id, { title: "Parent B" }), await store.createTask(project.id, { title: "Parent A" })];
  await store.createTask(project.id, { title: "Child of A", parent: a.id, assignee: "Ann" });
  await store.createTask(project.id, { title: "Child of B", parent: b.id, assignee: "Zoe" });
  // Ten or more cards, so SO-10 must follow SO-9.
  for (let i = 5; i <= 10; i++) await store.createTask(project.id, { title: `Card ${i}` });
  return { project };
});

test("the Sort menu groups its sorts, Manual order first, with Card ID, Parent and Assignee", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const sort = page.locator("[data-sort-menu]"), menu = page.locator("#shared-select-menu"), rows = page.locator(".task-row");
  await sort.click();
  await expect(menu.locator('[role="option"], .select-menu-group')).toHaveText([
    /^Manual order/, "Card", /^Card ID/, /^Title A–Z/, /^Parent/, /^Assignee/, "Progress", /^Status/, /^Priority/, "Dates", /^Due date/, /^Date created/,
  ]);
  const choose = async (name) => {
    if (!(await menu.isVisible())) await sort.click();
    await menu.getByRole("option", { name: new RegExp(`^${name}`) }).click();
    await expect(sort).toHaveAttribute("aria-label", `Sort: ${name}`);
  };
  await choose("Card ID");
  await expect(rows.first(), "SO-1 first").toContainText("Parent B");
  await expect(rows.last(), "SO-10 after SO-9").toContainText("Card 10");
  // Assignees A to Z, unassigned cards after them.
  await choose("Assignee");
  await expect(rows.nth(0)).toContainText("Child of A");
  await expect(rows.nth(1)).toContainText("Child of B");
  // Cards with the same parent together, in their parents' ID order; cards with no parent after.
  await choose("Parent");
  await expect(rows.nth(0)).toContainText("Child of B");
  await expect(rows.nth(1)).toContainText("Child of A");
});
