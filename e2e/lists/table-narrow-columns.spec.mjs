// Owner request, 31 October 2026: Table's ID, Type and Assignee columns start narrow, just wide
// enough for their heading and their values, instead of 160px like the other columns.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Narrow columns", key: "WXYZ" });
  for (let i = 1; i <= 10; i++) await store.createTask(project.id, { title: `Card ${i}`, assignee: "Mmmwide" });
  // Project keys run to 12 letters; the ID column widens for them.
  const long = await store.createProject({ title: "Long key", key: "LONGPROJECTK" });
  for (let i = 1; i <= 10; i++) await store.createTask(long.id, { title: `Card ${i}` });
  return { project, long };
});

onDevices(["desktop", "ipad", "phone"], () => test("ID, Type and Assignee start narrow, and their headings and values fit", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await expect(page.locator('td[data-column-key="key"]').first()).toBeVisible();
  for (const [key, most] of [["key", 90], ["type", 100], ["assignee", 128]]) {
    const th = page.locator(`th[data-column-key="${key}"]`);
    expect((await th.boundingBox()).width, `${device} ${key}: narrow`).toBeLessThanOrEqual(most + 1);
    expect(await th.locator(".table-column-name").evaluate((el) => el.scrollWidth <= el.clientWidth), `${device} ${key}: heading fits`).toBe(true);
    const overflow = await page.locator(`td[data-column-key="${key}"]`).evaluateAll((cells) => cells.filter((td) => td.scrollWidth > td.clientWidth).length);
    expect(overflow, `${device} ${key}: values fit`).toBe(0);
  }
  await expect(page.locator('td[data-column-key="key"]').last()).toContainText("WXYZ-10");
  await page.goto(`${app.base}/#project/${app.long.id}/table`);
  await expect(page.locator('td[data-column-key="key"]').last()).toContainText("LONGPROJECTK-10");
  const overflow = await page.locator('td[data-column-key="key"]').evaluateAll((cells) => cells.filter((td) => td.scrollWidth > td.clientWidth).length);
  expect(overflow, `${device}: long IDs fit`).toBe(0);
}));
