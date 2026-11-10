// Owner request (F0.21-99, 4 November 2026): the card editor's description can be resized by
// dragging a grip at its bottom edge or with Arrow Up/Down; the height is kept for the next card.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";

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

// Owner request (F0.22-95): a toolbar button expands the description to the editor's full height.
onDevices(["desktop", "phone"], () => {
  test("the Expand description button fills the editor, keeps typed text and Escape restores it first", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await open(page, app.b);
    const button = page.getByRole("button", { name: "Expand description" });
    await expect(button).toHaveAttribute("aria-pressed", "false");
    const box = await button.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--control-height"))));
    await editor(page).click();
    await page.keyboard.type(" typed");
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#task-form [name=title]")).toBeHidden();
    const viewport = page.viewportSize().height;
    await expect.poll(async () => (await editor(page).boundingBox()).height).toBeGreaterThan(viewport * 0.6);
    expect(await editor(page).evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(editor(page)).toContainText("Short typed");
    await page.keyboard.press("Escape");
    await expect(page.locator("#task-form")).toHaveCount(1);
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#task-form [name=title]")).toBeVisible();
    await expect(editor(page)).toContainText("Short typed");
    await page.keyboard.press("Escape");
    await expect(page.locator("#task-form")).toHaveCount(0);
  });

  test("while expanded the way back and Create card stay in view, with one accessible name", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await newCard(page);
    const button = page.locator("#task-form [data-description-expand]");
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Restore description" }), "one name, not a name and a state").toHaveCount(0);
    await expect(button).toHaveAttribute("title", "Restore description");
    // Scroll the toolbar to its start: the toggle must still be on screen.
    await page.locator("#task-form .rich-toolbar").evaluate((el) => (el.scrollLeft = 0));
    const inView = async (locator) => { const b = await locator.boundingBox(); const v = page.viewportSize(); return b && b.x >= 0 && b.y >= 0 && b.x + b.width <= v.width && b.y + b.height <= v.height; };
    await expect.poll(() => inView(button)).toBe(true);
    await expect.poll(() => inView(page.locator("#task-form button[type=submit]"))).toBe(true);
  });
});
