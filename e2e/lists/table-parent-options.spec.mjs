// F0.22-44: each Table row's Parent menu lists every card, so drawing them all made a 3,000-card
// project's page 300,000 options. A row holds only its own parent until its menu is used.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Parents", key: "PA" });
  const cards = [];
  for (let i = 1; i <= 30; i++) cards.push(await store.createTask(project.id, { title: `Card ${i}` }));
  await store.updateTask(project.id, cards[1].id, { parent: cards[0].id, revision: cards[1].revision });
  return { project, cards };
});

test("Table rows hold their own parent until the Parent menu is used, which lists every card", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  const parent = (card) => page.locator(`[data-table-task="${card.id}"] select[data-task-field="parent"]`);
  await expect(parent(app.cards[1])).toHaveValue(app.cards[0].id);
  // A row shows its parent and "No parent"; nothing more until the menu is used.
  expect(await page.locator('select[data-task-field="parent"] option').count()).toBeLessThanOrEqual(30 * 2);
  await expect(parent(app.cards[1]).locator("option")).toHaveCount(2);
  await expect(parent(app.cards[2]).locator("option")).toHaveCount(1);
  // Opening the menu lists every other card; choosing one saves it.
  await parent(app.cards[2]).click();
  const menu = page.locator("#shared-select-menu");
  await expect(menu.getByRole("option")).toHaveCount(30);
  await menu.getByRole("option", { name: "Card 5", exact: true }).click();
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.cards[2].id).parent).toBe(app.cards[4].id);
  await expect(page.locator(`[data-table-task="${app.cards[2].id}"] td[data-column-key="parent"] .table-cell-value`)).toHaveText("Card 5");
});
