// Visual workflow and hierarchy rules in Project settings: connections are added and
// removed on the diagram (Connect, then a source and a destination; or the remove chip),
// the hierarchy mode can be enforced, edits persist through Save changes and a reload,
// and the diagram fits desktop and phone widths in light and dark themes.
import { test, expect, useApp } from "../fixtures.mjs";
import { selectSettingsPage } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => ({
  project: await store.createProject({
    title: "Visual rules",
    schema: { statuses: ["todo", "doing", "done"], done: ["done"], types: ["epic", "task", "bug"] },
  }),
}));

test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1440, height: 1000 } });

const diagram = (page, id) => page.locator(`[data-rule-diagram="${id}"]`);
const schema = (page) => page.locator("[name=workflowSchema]").inputValue().then(JSON.parse);
const saved = async () => (await app.store.snapshot(app.project.id)).project.schema;
async function openSettings(page, section) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  // Since 0.19.31 the top bar's single Settings button replaces the project gear.
  await page.locator(".top-actions [data-action=settings]").click();
  await selectSettingsPage(page, section);
}

test("workflow rules connect only once enabled, and a transition can be added and removed", async ({ page }) => {
  await openSettings(page, "workflow");
  await expect(diagram(page, "workflow").locator("[data-rule-connect]")).toBeDisabled();
  await page.locator("[data-workflow-rules]").check();
  const workflow = diagram(page, "workflow");
  await workflow.locator("[data-rule-connect]").click();
  await workflow.locator("[data-rule-node=todo]").click();
  await workflow.locator("[data-rule-node=done]").click();
  expect((await schema(page)).transitions.todo).not.toContain("done");
  await workflow.locator("[data-rule-node=todo]").click();
  await workflow.locator("[data-rule-node=done]").click();
  expect((await schema(page)).transitions.todo).toContain("done");
  await workflow.locator("[data-rule-remove=done]").click();
  expect((await schema(page)).transitions.todo).not.toContain("done");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Changes saved", { exact: true }).waitFor();
  await expect.poll(async () => (await saved()).transitions.todo).not.toContain("done");
});

test("hierarchy links are edited on the diagram, the enforced mode saves, and both survive a reload", async ({ page }) => {
  await openSettings(page, "hierarchy");
  const hierarchy = diagram(page, "hierarchy");
  await hierarchy.locator("[data-rule-node=epic]").click();
  await hierarchy.locator("[data-rule-remove=bug]").click();
  expect((await schema(page)).hierarchy.children.epic).not.toContain("bug");
  await hierarchy.locator("[data-rule-connect]").click();
  await hierarchy.locator("[data-rule-node=epic]").click();
  await hierarchy.locator("[data-rule-node=bug]").click();
  expect((await schema(page)).hierarchy.children.epic).toContain("bug");
  await page.locator("[data-hierarchy-mode]").selectOption("enforced");
  await hierarchy.locator('[data-rule-node="@root"]').click();
  await hierarchy.locator("[data-rule-remove=bug]").click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(async () => (await saved()).hierarchy?.mode).toBe("enforced");
  const stored = await saved();
  expect(stored.transitions.todo).not.toContain("done");
  expect(stored.hierarchy.roots).not.toContain("bug");
  await page.reload();
  await page.getByRole("button", { name: "Back to project", exact: true }).click();
  await page.locator(".top-actions [data-action=settings]").click();
  await selectSettingsPage(page, "hierarchy");
  expect((await schema(page)).transitions.todo).not.toContain("done");
  expect((await schema(page)).hierarchy.roots).not.toContain("bug");
});

test("the hierarchy diagram fits desktop and phone widths in light and dark", async ({ page }) => {
  await openSettings(page, "hierarchy");
  const hierarchy = diagram(page, "hierarchy");
  await hierarchy.locator("[data-rule-node=epic]").click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${width} ${theme}: no horizontal scroll`).toBe(false);
      await hierarchy.scrollIntoViewIfNeeded();
      await expect(hierarchy).toBeInViewport();
    }
  }
});
