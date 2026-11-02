// Owner request, 2 November 2026: routine cell saves are silent; failed and
// pending saves still explain what happened and retain the edit for recovery.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Quiet saves", key: "QS" });
  const task = await store.createTask(project.id, { title: "Edit without notifications", priority: "medium", status: "todo" });
  return { project, task };
});
const saved = async () => (await app.store.snapshot(app.project.id)).tasks.find((task) => task.id === app.task.id);
const field = (page, key) => page.locator(`[data-table-task="${app.task.id}"] [data-task-field="${key}"]`);

async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await expect(field(page, "priority")).toBeAttached();
  // Record notifications even if one disappears before the assertion runs.
  await page.evaluate(() => {
    window.cellSaveNotifications = [];
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes)
        if (node instanceof Element && node.matches(".toast")) window.cellSaveNotifications.push(node.textContent);
    }).observe(document.querySelector("#toasts"), { childList: true });
  });
}
async function choose(page, key, name) {
  await field(page, key).click();
  await page.locator("#shared-select-menu").getByRole("option", { name, exact: true }).click();
}

onDevices(["desktop", "ipad", "phone"], () => {
  test("cell edits persist without success notifications", async ({ page }) => {
    await open(page);
    const before = await saved();
    const priority = before.priority === "high" ? "low" : "high";
    await choose(page, "priority", priority === "high" ? "High" : "Low");
    await expect(field(page, "priority")).toHaveAttribute("data-saved", "true");
    await expect.poll(async () => (await saved()).priority).toBe(priority);
    const status = before.status === "done" ? "todo" : "done";
    await choose(page, "status", status === "done" ? "Done" : "To do");
    await expect(field(page, "status")).toHaveAttribute("data-saved", "true");
    await expect.poll(async () => (await saved()).status).toBe(status);
    expect(await page.evaluate(() => window.cellSaveNotifications)).toEqual([]);
    await page.reload();
    await expect(field(page, "priority")).toHaveValue(priority);
    await expect(field(page, "status")).toHaveValue(status);
  });

  test("a refused cell save still shows its error", async ({ page }) => {
    await open(page);
    const before = await saved(), priority = before.priority === "high" ? "low" : "high";
    await page.route(`**/api/projects/${app.project.id}/tasks/${app.task.id}`, (route) => route.request().method() === "PATCH"
      ? route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "This card cannot be changed right now." }) })
      : route.continue());
    await choose(page, "priority", priority === "high" ? "High" : "Low");
    await expect(page.locator("#toasts .toast.error[role=alert]")).toContainText("This card cannot be changed right now.");
    expect((await saved()).priority).toBe(before.priority);
  });

  test("an offline cell edit still shows that it is waiting to sync", async ({ page }) => {
    await open(page);
    const before = await saved(), priority = before.priority === "high" ? "low" : "high";
    await page.route(`**/api/projects/${app.project.id}/tasks/${app.task.id}`, (route) => route.request().method() === "PATCH" ? route.abort() : route.continue());
    await choose(page, "priority", priority === "high" ? "High" : "Low");
    await expect(page.locator("#toasts .toast")).toContainText("Edit retained. Open Recovery to review pending saves.");
    expect((await saved()).priority).toBe(before.priority);
    await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("pencils:pending:") && !key.endsWith(":lease") && JSON.parse(localStorage.getItem(key) || "[]").length));
  });
});
