// Owner request (F0.21-98, 4 November 2026): opening a card from inside the card editor (a
// relationship row) shows it in place with a Back button at the top left that returns to the
// card you came from, one hop at a time; closing the editor forgets the trail.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { chooseCardSection } from "../helpers/card-panes.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Trail", key: "TR" });
  const a = await store.createTask(project.id, { title: "Alpha card" });
  const b = await store.createTask(project.id, { title: "Beta card", parent: a.id });
  const c = await store.createTask(project.id, { title: "Gamma card", parent: b.id });
  return { project, a, b, c };
});
const title = (page) => page.locator("#task-form [name=title]");
const back = (page) => page.locator(".task-editor-header-row [data-action=task-back]");
const open = async (page, card) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action=task-open][data-id="${card.id}"]:visible`).first().click();
  await expect(page.locator(`#task-form[data-id="${card.id}"]`)).toBeVisible();
  // The followed cards open on the same tab (F0.23-10).
  await chooseCardSection(page, "Relationships");
};

onDevices(["desktop", "phone", "ipad"], (device) => {
  test(`Back returns through the cards you followed (${device})`, async ({ page }) => {
    await open(page, app.a);
    await expect(back(page)).toHaveCount(0);
    await page.locator(`[data-relationship-open="${app.b.id}"]`).click();
    await expect(title(page)).toHaveValue(app.b.title);
    await page.locator(`[data-relationship-open="${app.c.id}"]`).click();
    await expect(title(page)).toHaveValue(app.c.title);
    await expect(back(page)).toHaveAccessibleName(`Back to ${app.b.key}`);
    await expect(back(page)).toHaveAttribute("title", `Back to ${app.b.key}`);
    const [row, button] = [await page.locator(".task-editor-header-row").boundingBox(), await back(page).boundingBox()];
    expect(button.x - row.x, "at the top left").toBeLessThanOrEqual(12);
    if (device === "phone") expect(button.height).toBeGreaterThanOrEqual(44);
    // The header row holds its buttons without overflow or overlap, and Back matches its siblings.
    const measure = () => page.locator(".task-editor-header-row").evaluate((row) => {
      const boxes = [...row.querySelectorAll("button")].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect());
      const overlap = boxes.some((x, i) => boxes.some((y, j) => i < j && x.left < y.right - 0.5 && y.left < x.right - 0.5 && x.top < y.bottom - 0.5 && y.top < x.bottom - 0.5));
      return { overflow: row.scrollWidth - row.clientWidth, overlap };
    });
    await expect.poll(async () => (await measure()).overlap, "buttons do not overlap").toBe(false);
    expect((await measure()).overflow, "no horizontal overflow").toBeLessThanOrEqual(0);
    const sibling = await page.locator('.task-editor-header-row [data-action="dialog-close"]').boundingBox();
    expect([button.width, button.height]).toEqual([sibling.width, sibling.height]);
    await back(page).dblclick();
    await expect(title(page)).toHaveValue(app.b.title);
    await expect(back(page)).toHaveAccessibleName(`Back to ${app.a.key}`);
    await back(page).click();
    await expect(title(page)).toHaveValue(app.a.title);
    await expect(back(page)).toHaveCount(0);
  });
});

test("closing the editor forgets the trail", async ({ page }) => {
  await open(page, app.a);
  await page.locator(`[data-relationship-open="${app.b.id}"]`).click();
  await expect(back(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#task-form")).toHaveCount(0);
  await page.locator(`[data-action=task-open][data-id="${app.b.id}"]:visible`).first().click();
  await expect(title(page)).toHaveValue(app.b.title);
  await expect(back(page)).toHaveCount(0);
});

test("an unsaved edit is saved before going back", async ({ page }) => {
  await open(page, app.a);
  await title(page).fill("Alpha renamed");
  await page.locator(`[data-relationship-open="${app.b.id}"]`).click();
  await expect(title(page)).toHaveValue(app.b.title);
  await back(page).click();
  await expect(title(page)).toHaveValue("Alpha renamed");
});

test("Back in the narrowest editor layout does not collide with the other header buttons", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page, app.a);
  await page.locator(`[data-relationship-open="${app.b.id}"]`).click();
  await expect(back(page)).toBeVisible();
  const overlap = await page.locator(".task-editor-header-row").evaluate((row) => {
    const boxes = [...row.querySelectorAll("button")].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect());
    return boxes.some((x, i) => boxes.some((y, j) => i < j && x.left < y.right - 0.5 && y.left < x.right - 0.5 && x.top < y.bottom - 0.5 && y.top < x.bottom - 0.5));
  });
  expect(overlap).toBe(false);
});
