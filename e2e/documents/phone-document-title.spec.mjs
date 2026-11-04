// Owner request (F0.21-87, 3 November 2026): on phones a document or spreadsheet shows its title in
// the top bar, between the menu and New buttons, with its bookmark star before it; Properties and
// Focus mode move from the document's bar into Document tools (⋯). Desktop and iPad keep them in the bar.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Phone titles", key: "PT" });
  const doc = await store.createDocument(project.id, { title: "Markdown showcase", body: "# Notes\n\nAgenda." });
  const sheet = await store.createDocument(project.id, { title: "A rather long spreadsheet title that phones cut short", document_type: "table" });
  return { project, doc, sheet };
});
const bar = (page) => page.locator("#document-form .document-heading");
const title = (page) => page.locator(".topbar .breadcrumb strong");
const tools = (page) => bar(page).locator('[data-document-action="tools"]');
const open = async (page, doc) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await expect(tools(page)).toBeVisible();
};

onDevices(["phone", "small"], () => test("phones show the document's title in the top bar with its star before it, for documents and spreadsheets", async ({ page }) => {
  for (const [doc, name] of [[app.doc, "Markdown showcase"], [app.sheet, "A rather long spreadsheet title that phones cut short"]]) {
    await open(page, doc);
    await expect(title(page)).toBeVisible();
    await expect(title(page)).toHaveText(name);
    expect((await title(page).boundingBox()).width, "shown, not only for screen readers").toBeGreaterThan(60);
    const star = page.locator(".topbar .breadcrumb > [data-bookmark]");
    await expect(star, `${name}: the star moves to the top bar`).toBeVisible();
    await expect(bar(page).locator("[data-bookmark]")).toHaveCount(0);
    const [menu, mark, heading, add] = await Promise.all([page.locator(".topbar .mobile-menu"), star, title(page), page.locator(".topbar .phone-new-task > summary")].map((l) => l.boundingBox()));
    expect(mark.x, "the star after the menu button").toBeGreaterThanOrEqual(menu.x + menu.width);
    expect(heading.x, "the title after the star").toBeGreaterThanOrEqual(mark.x + mark.width);
    expect(heading.x + heading.width, "the title before New").toBeLessThanOrEqual(add.x);
    for (const box of [mark, heading]) expect(Math.abs(box.y + box.height / 2 - (menu.y + menu.height / 2)), "on the buttons' row").toBeLessThan(4);
    expect(await title(page).evaluate((el) => getComputedStyle(el).textOverflow), "a long title is cut short").toBe("ellipsis");
    // The star still bookmarks.
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "false");
  }
}));

onDevices(["phone"], () => test("on phones Properties and Focus mode live in Document tools, and Focus mode keeps its exit in the bar", async ({ page }) => {
  for (const doc of [app.doc, app.sheet]) {
    await open(page, doc);
    for (const action of ["properties", "focus"]) await expect(bar(page).locator(`:scope > [data-document-action="${action}"]`)).toBeHidden();
    await tools(page).click();
    const menu = page.getByRole("dialog", { name: "Document tools" });
    await menu.getByRole("button", { name: "Properties", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Properties" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Properties" })).toHaveCount(0);
    await expect(tools(page), "⋯ is collapsed again").toHaveAttribute("aria-expanded", "false");
    await tools(page).click();
    await menu.getByRole("button", { name: "Focus mode", exact: true }).click();
    await expect(page.locator(".main")).toHaveClass(/\bdocument-focus\b/);
    const exit = bar(page).locator('[data-document-action="focus"]');
    await expect(exit, "the exit icon stays in the bar").toBeVisible();
    await exit.click();
    await expect(page.locator(".main")).not.toHaveClass(/\bdocument-focus\b/);
    await expect(tools(page), "the keyboard lands on ⋯, as the exit button hides").toBeFocused();
  }
}));

onDevices(["desktop", "ipad"], () => test("desktop and iPad keep Properties and Focus mode in the bar, not in Document tools", async ({ page }) => {
  await open(page, app.doc);
  for (const action of ["properties", "focus"]) await expect(bar(page).locator(`:scope > [data-document-action="${action}"]`)).toBeVisible();
  await tools(page).click();
  const menu = page.getByRole("dialog", { name: "Document tools" });
  await expect(menu.getByRole("button", { name: "Rename", exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Properties", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Focus mode", exact: true })).toHaveCount(0);
}));

test("the star follows the title when a document's window narrows to a phone's and widens again", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await open(page, app.doc);
  const star = page.locator(".topbar .breadcrumb > [data-bookmark]");
  for (const width of [390, 1200, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(star, `${width}px: before the title`).toHaveCount(1);
    await expect(bar(page).locator("[data-bookmark]")).toHaveCount(0);
    await expect(bar(page).locator(':scope > [data-document-action="properties"]')).toBeVisible({ visible: width > 600 });
    if (width <= 600) expect((await title(page).boundingBox()).width, "the title shows on a phone").toBeGreaterThan(60);
  }
  // Leaving Documents puts nothing of the document in the top bar.
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row, .empty").first().waitFor();
  await expect(star).toHaveCount(0);
});
