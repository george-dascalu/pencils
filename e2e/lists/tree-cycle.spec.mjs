// Owner request, 30 October 2026: one icon button in Tree cycles through all expanded, all
// collapsed and back to normal, the rows opened and closed by hand. A step that would look the
// same is skipped, and a tree with nothing to expand has no button.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Tree cycle", key: "TC" });
  const a = await store.createTask(project.id, { title: "Parent A" });
  const a1 = await store.createTask(project.id, { title: "Child A1", parent: a.id });
  const b = await store.createTask(project.id, { title: "Parent B" });
  const b1 = await store.createTask(project.id, { title: "Child B1", parent: b.id });
  const flat = await store.createProject({ title: "Flat", key: "FL" });
  await store.createTask(flat.id, { title: "Lonely card" });
  return { project, flat, a, a1, b, b1 };
});
const rows = (page) => page.locator("#view-content [data-task-order-row]").evaluateAll((els) => els.map((el) => el.dataset.taskOrderRow).sort());
const shows = (page, tasks) => expect.poll(() => rows(page)).toEqual(tasks.map((t) => t.id).sort());

onDevices(["phone", "desktop"], () => test("one button cycles all expanded, all collapsed and back to normal", async ({ page, device }) => {
  const { a, a1, b, b1 } = app;
  await page.goto(`${app.base}/#project/${app.project.id}/tree`);
  const cycle = page.locator('[data-action="tree-cycle"]');
  await shows(page, [a, a1, b, b1]);
  await expect(page.locator('[data-action="expand-all"]')).toHaveCount(0);
  await expect(cycle).toHaveAttribute("aria-label", "Subtasks: normal");
  await expect(cycle.locator(".icon")).toHaveCount(1);
  const box = await cycle.boundingBox();
  if (device === "phone") expect(box.width, "a 44px target").toBeGreaterThanOrEqual(44);
  // Normal: B closed by hand.
  await page.locator(`.tree-toggle[data-id="${b.id}"]`).click();
  await shows(page, [a, a1, b]);
  await cycle.click();
  await expect(cycle).toHaveAttribute("aria-label", "Subtasks: all expanded");
  await shows(page, [a, a1, b, b1]);
  await cycle.click();
  await expect(cycle).toHaveAttribute("aria-label", "Subtasks: all collapsed");
  await shows(page, [a, b]);
  await cycle.click();
  await expect(cycle, `${device}: back to the rows as left`).toHaveAttribute("aria-label", "Subtasks: normal");
  await shows(page, [a, a1, b]);
  // Opening a row by hand makes the layout normal; with nothing closed, all expanded would look
  // the same, so the button goes straight to all collapsed.
  await page.locator(`.tree-toggle[data-id="${b.id}"]`).click();
  await shows(page, [a, a1, b, b1]);
  await cycle.click();
  await expect(cycle).toHaveAttribute("aria-label", "Subtasks: all collapsed");
  await page.locator(`.tree-toggle[data-id="${a.id}"]`).click();
  await expect(cycle, "a row opened by hand").toHaveAttribute("aria-label", "Subtasks: normal");
  await shows(page, [a, a1, b]);
  // Leaving Tree in another layout and coming Back, or reloading, shows normal again.
  await cycle.click();
  await expect(cycle).toHaveAttribute("aria-label", "Subtasks: all expanded");
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await expect(page.locator(".main")).toHaveAttribute("data-layout-view", "list");
  await page.goBack();
  await expect(page.locator(".main")).toHaveAttribute("data-layout-view", "tree");
  await expect(cycle, `${device}: Back`).toHaveAttribute("aria-label", "Subtasks: normal");
  await shows(page, [a, a1, b]);
  await cycle.click();
  await expect(cycle).toHaveAttribute("aria-label", "Subtasks: all expanded");
  await page.reload();
  await expect(cycle, `${device}: reload`).toHaveAttribute("aria-label", "Subtasks: normal");
  await shows(page, [a, a1, b]);
}));

test("the keyboard keeps focus on the button, and a tree without subtasks has none", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/tree`);
  const cycle = page.locator('[data-action="tree-cycle"]');
  await cycle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-action="tree-cycle"]')).toBeFocused();
  // Nothing is closed by hand, so all expanded looks the same as normal and is skipped.
  await expect(page.locator('[data-action="tree-cycle"]')).toHaveAttribute("aria-label", "Subtasks: all collapsed");
  await page.goto(`${app.base}/#project/${app.flat.id}/tree`);
  await expect(page.locator(".task-row", { hasText: "FL-1" })).toBeVisible();
  await expect(page.locator('[data-action="tree-cycle"]')).toHaveCount(0);
});
