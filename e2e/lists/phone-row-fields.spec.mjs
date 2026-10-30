// Owner request, 29 October 2026 (note-taking item 16): on phones, tapping a List or Tree row's
// assignee, status or priority opens that field's picker and saves the choice without opening the
// card; tapping anywhere else on the row still opens the card.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Phone fields", key: "PF" });
  const task = await store.createTask(project.id, { title: "Tap my fields", status: "todo", priority: "low", assignee: "Alex" });
  await store.createTask(project.id, { title: "A very long card title that keeps going well past the width of any phone screen", status: "todo", priority: "low" });
  // Keys of different lengths, statuses, assignees and dates for the aligned boxes.
  for (let i = 0; i < 10; i++) await store.createTask(project.id, { title: `Row ${i}`, status: i % 2 ? "in-progress" : "todo", assignee: i % 3 ? "Alexandra" : "", due: i % 2 ? "2026-11-28" : "" });
  // A deep Tree branch with next year's dates.
  let parent = null;
  for (let depth = 0; depth < 5; depth++) parent = await store.createTask(project.id, { title: `Depth ${depth}`, status: "in-progress", assignee: "Alexandra", due: "2027-02-03", ...(parent ? { parent: parent.id } : {}) });
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

// Owner request, 30 October 2026: the assignee, status and priority box has one width on every
// row, so the boxes line up down the list. Since it holds the date too (the same day), it sits at the
// row's end, leaving the key the rest of the line.
onDevices(["phone", "small"], () => test("every row's field box has the same width and position, at the row's end", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row .phone-task-fields").first().waitFor();
  const boxes = await page.locator(".task-row .phone-task-fields").evaluateAll((els) => els.map((el) => {
    const box = el.getBoundingClientRect(), meta = el.closest(".phone-task-meta").getBoundingClientRect();
    return { left: box.left, width: box.width, end: box.right - meta.right, priority: el.querySelector('[data-field="priority"]').getBoundingClientRect().left };
  }));
  expect(boxes.length).toBeGreaterThan(10);
  for (const box of boxes) {
    expect(Math.abs(box.left - boxes[0].left), `${device}: boxes share a left edge`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(box.width - boxes[0].width), `${device}: boxes share a width`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(box.end), `${device}: at the row's end`).toBeLessThanOrEqual(1);
    expect(Math.abs(box.priority - boxes[0].priority), `${device}: priorities line up, whatever the date`).toBeLessThanOrEqual(0.5);
  }
  const clipped = await page.locator(".task-row .phone-task-meta > span:not([class])").evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent));
  expect(clipped, `${device}: short keys show whole`).toEqual([]);
  // Every row, also cramped ones (320px, deep Tree rows, next year's dates), keeps the key, box
  // and date apart, and the status inside its box.
  for (const [view, width] of [["list", null], ["tree", null], ["list", 320], ["tree", 320]]) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    await page.locator(".task-row .phone-task-fields").first().waitFor();
    // Below 360px, Tree rows under the top level have less room than the four 44px targets need.
    const rows = await page.locator(width === 320 && view === "tree" ? ".task-row:is([style*='--depth:0'], :not([style])) .phone-task-meta" : ".task-row .phone-task-meta").evaluateAll((els) => els.map((meta) => ({
      parts: [...meta.children].map((el) => el.getBoundingClientRect().toJSON()),
      box: meta.querySelector(".phone-task-fields").getBoundingClientRect().toJSON(),
      status: meta.querySelector(".phone-task-status").getBoundingClientRect().toJSON(),
      meta: meta.getBoundingClientRect().toJSON(),
    })));
    const where = `${device} ${view} ${width || ""}`;
    for (const row of rows) {
      for (let i = 1; i < row.parts.length; i++) expect(row.parts[i].left, `${where}: meta parts don't overlap ${JSON.stringify(row.parts)}`).toBeGreaterThanOrEqual(row.parts[i - 1].right - 0.5);
      expect(row.status.left >= row.box.left - 0.5 && row.status.right <= row.box.right + 0.5, `${where}: the status stays in its box`).toBe(true);
      expect(row.parts.at(-1).right, `${where}: the line fits its row`).toBeLessThanOrEqual(row.meta.right + 0.5);
    }
  }
}));
