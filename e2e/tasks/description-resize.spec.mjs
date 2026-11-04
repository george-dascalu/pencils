// Owner request (F0.21-99, 4 November 2026): the card editor's description can be resized by
// dragging a grip at its bottom edge or with Arrow Up/Down; the height is kept for the next card.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Resize", key: "RS" });
  const a = await store.createTask(project.id, { title: "First", body: "Line\n\n".repeat(40) });
  const b = await store.createTask(project.id, { title: "Second", body: "Short" });
  return { project, a, b };
});
const open = async (page, card) => {
  await page.locator(`[data-action=task-open][data-id="${card.id}"]:visible`).first().click();
  await expect(page.locator("#task-form [name=title]")).toHaveValue(card.title);
};
const editor = (page) => page.locator(".task-dialog .task-description .inline-rich");
const grip = (page) => page.getByRole("separator", { name: "Resize description" });
const height = async (page) => (await editor(page).boundingBox()).height;

test("dragging the grip resizes the description and the height is kept for the next card", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page, app.a);
  const before = await height(page);
  const g = await grip(page).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + 120, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => height(page)).toBeGreaterThan(before + 100);
  const after = await height(page);
  expect(await editor(page).evaluate((el) => getComputedStyle(el).maxHeight), "no old cap").not.toBe("330px");
  await expect(grip(page)).toHaveAttribute("aria-valuenow", String(Math.round(after)));
  await page.keyboard.press("Escape");
  await expect(page.locator("#task-form")).toHaveCount(0);
  await open(page, app.b);
  expect(Math.abs((await height(page)) - after)).toBeLessThanOrEqual(1);
});

test("Arrow Up and Down on the grip change the height, down to a minimum", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page, app.b);
  const before = await height(page);
  await grip(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => height(page)).toBeGreaterThan(before + 10);
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowUp");
  const min = await height(page);
  expect(min).toBe(80);
  await expect(grip(page)).toHaveAttribute("aria-valuenow", "80");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(grip(page)).toHaveAttribute("aria-valuenow", "176");
  for (let i = 0; i < 15; i++) await page.keyboard.press("Shift+ArrowDown");
  expect(await height(page), "capped at the viewport share or the maximum").toBeLessThanOrEqual(1200);
  expect(min).toBeLessThan(before);
});

test("the card board's fixed description panel has no grip", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page, app.b);
  await expect(grip(page)).toBeVisible();
  await page.locator('.task-dialog [data-feature="task-board"]').click();
  await expect(page.locator(".task-dialog.card-board")).toBeVisible();
  await expect(grip(page)).toBeHidden();
});

test("a large stored height still leaves the grip on screen on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pencils:description-height", "1200"));
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page, app.a);
  await grip(page).scrollIntoViewIfNeeded();
  const g = await grip(page).boundingBox();
  expect(g.y + g.height).toBeLessThanOrEqual(844);
  expect(await height(page)).toBeLessThanOrEqual(844 * 0.7 + 1);
});
