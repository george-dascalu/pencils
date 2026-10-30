// Owner request, 29 October 2026 (note-taking item 16): on phones, tapping a List or Tree row's
// assignee, status or priority opens that field's picker and saves the choice without opening the
// card; tapping anywhere else on the row still opens the card.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Phone fields", key: "PF" });
  const task = await store.createTask(project.id, { title: "Tap my fields", status: "todo", priority: "low", assignee: "Alex" });
  await store.createTask(project.id, { title: "A very long card title that keeps going well past the width of any phone screen", status: "todo", priority: "low" });
  return { project, task };
});
const saved = async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.task.id);

onDevices(["phone"], () => test("row fields change from their own picker; the rest of the row opens the card", async ({ page }) => {
  for (const [view, field, label, option, value] of [["list", "status", "Status", "In progress", "in-progress"], ["tree", "priority", "Priority", "High", "high"], ["list", "assignee", "Assignee", "Unassigned", ""]]) {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    const row = page.locator(`.task-row[data-task-order-row="${app.task.id}"]`);
    const button = row.getByRole("button", { name: `${label} for Tap my fields`, exact: false });
    await expect(button).toBeVisible();
    const box = await button.boundingBox(), title = await row.locator(".phone-task-title").boundingBox();
    expect(box.y, `${field}: its target stays below the title`).toBeGreaterThanOrEqual(title.y + title.height);
    expect(box.height >= 44 && box.width >= 44, `${field}: 44px target ${JSON.stringify(box)}`).toBe(true);
    await button.click();
    await page.getByRole("listbox").getByRole("option", { name: option, exact: true }).click();
    await expect.poll(async () => (await saved())[field] || "", `${field} saved`).toBe(value);
    await expect(page.locator("#task-form"), `${field}: the card stays closed`).toHaveCount(0);
    await expect(row.locator(`.phone-field[data-field="${field}"]`), `${field}: focus returns to the field`).toBeFocused();
  }
  const long = page.locator(".task-row", { hasText: "A very long card title" });
  const [text, summary] = [await long.locator(".phone-task-title").boundingBox(), await long.locator(".phone-task").boundingBox()];
  expect(text.x + text.width, "a long title stays inside its summary").toBeLessThanOrEqual(summary.x + summary.width + 1);
  const row = page.locator(`.task-row[data-task-order-row="${app.task.id}"]`);
  // The card ID sits on the open button's stretched tap area, so tap the spot rather than the element.
  const key = await row.locator(".phone-task-meta > span:not([class])").boundingBox();
  await page.mouse.click(key.x + key.width / 2, key.y + key.height / 2);
  await expect(page.locator("#task-form")).toBeVisible();
}));
