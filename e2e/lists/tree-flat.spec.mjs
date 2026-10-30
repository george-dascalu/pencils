// Owner question, 30 October 2026: with no subtasks, Tree looked unlike List, as every row kept an
// empty column for the expand button. A tree with nothing to expand lines its rows up with List's;
// one subtask brings the column back, for every row, so children stay inside their parents.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const flat = await store.createProject({ title: "Flat tree", key: "FT" });
  await store.createTask(flat.id, { title: "Alpha card" });
  await store.createTask(flat.id, { title: "Beta card" });
  const nested = await store.createProject({ title: "Nested tree", key: "NT" });
  const parent = await store.createTask(nested.id, { title: "Alpha card" });
  await store.createTask(nested.id, { title: "Beta card", parent: parent.id });
  return { flat, nested };
});

onDevices(["phone", "ipad", "desktop"], () => test("a tree without subtasks lines up with List", async ({ page, device }) => {
  const title = device === "phone" ? ".phone-task-title" : "input.task-title";
  const left = async (project, view) => {
    await page.goto(`${app.base}/#project/${project.id}/${view}`);
    await expect(page.locator(".main")).toHaveAttribute("data-layout-view", view);
    const row = page.locator(".task-row", { hasText: `${project.key}-1` });
    await expect(row).toBeVisible();
    return (await row.locator(title).boundingBox()).x;
  };
  const list = await left(app.flat, "list");
  expect(await left(app.flat, "tree"), `${device}: same start as List`).toBe(list);
  if (device === "desktop") {
    // The copy a drag lifts, outside the tree, keeps the row's layout.
    const b = await page.locator(".task-row", { hasText: `${app.flat.key}-1` }).locator(".task-reorder-handle").boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 8, { steps: 3 });
    expect((await page.locator(`.task-reorder-ghost ${title}`).boundingBox()).x, "the dragged copy too").toBe(list);
    await page.keyboard.press("Escape");
    await page.mouse.up();
  }
  await expect(page.locator(".tree-toggle")).toHaveCount(2);
  for (const toggle of await page.locator(".tree-toggle").all()) await expect(toggle).toBeHidden();
  expect(await left(app.nested, "tree"), `${device}: room for the expand button`).toBeGreaterThan(list);
  await expect(page.locator(".tree-toggle").first()).toBeVisible();
}));
