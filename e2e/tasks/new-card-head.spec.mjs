// Owner request (F0.21-93, 4 November 2026, desktop screenshot): the new card popup has its close
// button at the right of the title, with no empty row above the title, and its dates on one line,
// also when the project turns assignee, status and priority off.
import { test, expect, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const full = await store.createProject({ title: "All fields", key: "AF" });
  let bare = await store.createProject({ title: "Few fields", key: "FF" });
  bare = await store.updateProject(bare.id, { revision: bare.revision, schema: { ...bare.schema, off: ["type", "assignee", "status", "priority", "tags"] } });
  const card = await store.createTask(full.id, { title: "Existing" });
  return { full, bare, card };
});
const openNew = async (page, project) => {
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator("#view-toolbar").waitFor();
  await newCard(page);
  await page.locator("#task-form.task-create-form").waitFor();
};

for (const which of ["full", "bare"]) test(`a new card's close button sits right of the title with nothing above it, and its dates fit one line (${which === "full" ? "all fields" : "assignee, status and priority off"})`, async ({ page }) => {
  await openNew(page, app[which]);
  const dialog = page.locator(".task-dialog"), title = page.locator("#task-form [name=title]"), close = dialog.locator('[data-action="dialog-close"]');
  await expect(close).toHaveCount(1);
  await expect(close).toBeVisible();
  await expect(dialog.locator(".task-editor-header-row"), "no row above the title").toHaveCount(0);
  const [d, t, c] = [await dialog.boundingBox(), await title.boundingBox(), await close.boundingBox()];
  expect(c.x, "right of the title").toBeGreaterThanOrEqual(t.x + t.width);
  expect(d.x + d.width - (c.x + c.width), "at the dialog's right edge").toBeLessThanOrEqual(16);
  expect(Math.abs(c.y + c.height / 2 - (t.y + t.height / 2)), "level with the title").toBeLessThanOrEqual(2);
  expect(t.y - d.y, "the title starts the popup").toBeLessThanOrEqual(16);
  const danger = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement("span"));
    probe.style.color = "var(--danger, #b64132)";
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  expect(await close.evaluate((el) => getComputedStyle(el).color), "red, as in every card editor").toBe(danger);
  const [start, due] = [await page.locator("#task-form [name=start]").boundingBox(), await page.locator("#task-form [name=due]").boundingBox()];
  expect(Math.abs(start.y - due.y), "dates on one line").toBeLessThanOrEqual(1);
  expect(due.x, "due after start").toBeGreaterThan(start.x + start.width);
  // Close still closes it.
  await close.click();
  await expect(page.locator("#task-form")).toHaveCount(0);
});

test("an existing card keeps its actions row, with close at its end", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.full.id}/list`);
  await page.locator(`[data-task-order-row="${app.card.id}"] [data-action="task-open"]`).first().click();
  const row = page.locator(".task-dialog .task-editor-header-row");
  await expect(row).toBeVisible();
  await expect(row.locator(':scope > [data-action="dialog-close"]')).toBeVisible();
});
