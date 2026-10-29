// Project keys and task IDs: renaming the key on the Project settings page (a page, not a
// dialog) renumbers task IDs everywhere. The board's task picker finds tasks by the new ID and
// cards created on the board join the same project records and numbering.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { selectProjectView } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Website", key: "WEB" });
  const task = await store.createTask(project.id, { title: "Original task" });
  return { project, task };
});
const snapshot = () => app.store.snapshot(app.project.id);

test.describe("desktop", () => {
  test.use({ viewportSize: { width: 1500, height: 1100 } });

  test("a renamed project key renumbers tasks, which the board picker and board-created cards share", async ({ page }) => {
    await page.goto(app.base);
    await page.locator(".project-link").click();
    await expect(page.locator("#view-content")).toContainText("WEB-1");
    await page.getByRole("button", { name: "Project settings", exact: true }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.locator(".project-settings-page [name=key]").fill("APP");
    await page.locator("#project-form [type=submit]").click();
    await expect.poll(async () => (await snapshot()).project.key).toBe("APP");
    expect((await snapshot()).tasks[0].key).toBe("APP-1");

    await page.locator(".tabs [data-view=board]").click();
    await page.locator("[data-action=board-task]").click();
    await page.locator("#board-task-search").fill("APP-1");
    await page.locator("[data-action=board-pick]").click();
    await expect.poll(async () => (await snapshot()).boards[0].nodes.some((n) => n.task === app.task.id)).toBe(true);
    await expect(page.locator(".board-node.task")).toContainText("APP-1");
    await page.locator("[data-action=board-create-task]").click();
    await page.locator("#task-form [name=title]").fill("Created on board");
    await page.locator("#task-form [type=submit]").click();
    await expect.poll(async () => { const s = await snapshot(); return [s.tasks.length, s.boards[0].nodes.length]; }).toEqual([2, 2]);

    await selectProjectView(page, "list");
    // List rows edit titles in place (since 0.15.45), so the title is an input value.
    await expect.poll(() => page.locator("#view-content .task-title").evaluateAll((els) => els.map((el) => el.value))).toContain("Created on board");
    await expect(page.locator("#view-content")).toContainText("APP-2");
  });
});

onDevices(["phone"], () => {
  test("the Project settings page fits a phone in the dark theme", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/settings/general`);
    await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    await page.locator("#project-form [name=key]").waitFor();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
});
