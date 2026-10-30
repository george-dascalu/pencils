// Owner request, 29 October 2026 (note-taking item 17): the card editor's Info button shows only
// where it switches panes. Where the details stay beside History and Comments (1100px in the board's
// panel, 1320px in the project editor) the group holds just those two.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Panes", key: "PN" });
  return { project, task: await store.createTask(project.id, { title: "Pane card", status: "todo" }) };
});

onDevices(["desktop", "ipad", "phone"], () => test("the Info button shows only where it switches panes", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${app.task.id}"]:visible`).first().click();
  const panes = page.locator(".task-pane-switcher");
  await expect(panes.getByRole("button", { name: "Version history", exact: true })).toBeVisible();
  await expect(panes.getByRole("button", { name: "Task comments", exact: true })).toBeVisible();
  const info = panes.getByRole("button", { name: "Task details", exact: true });
  if (device !== "desktop") {
    await expect(info).toBeVisible();
    return;
  }
  // The project editor docks History and Comments over its details until 1320px, so Info stays there.
  await page.setViewportSize({ width: 1180, height: 900 });
  await expect(info).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(info).toBeHidden();
  await panes.getByRole("button", { name: "Task comments", exact: true }).click();
  await expect(page.locator(".task-comments-panel")).toBeVisible();
  await expect(page.locator(".task-editor-content > .dialog-body"), "the details stay beside the comments").toBeVisible();
  // With no Info button, a second tap on the open pane returns to the details alone.
  await panes.getByRole("button", { name: "Task comments", exact: true }).click();
  await expect(page.locator(".task-comments-panel")).toHaveCount(0);
  await expect(panes.getByRole("button", { name: "Task comments", exact: true }), "focus stays on the button").toBeFocused();
  await panes.getByRole("button", { name: "Version history", exact: true }).click();
  await expect(page.locator(".task-history-panel")).toBeVisible();
  await panes.getByRole("button", { name: "Version history", exact: true }).click();
  await expect(page.locator(".task-history-panel")).toBeHidden();
}));
