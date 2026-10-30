// Owner request, 30 October 2026: a card, a project view, a board or a document can be bookmarked
// from its own bar, and the search popup lists the bookmarks first.
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Garden", key: "GA" });
  const card = await store.createTask(project.id, { title: "Plant bulbs" });
  const doc = await store.createDocument(project.id, { title: "Planting plan" });
  return { project, card, doc };
});
const dialog = (page) => page.locator("dialog[open]");
const search = async (page) => {
  await page.locator(".topbar .tabs").getByRole("button", { name: "Search", exact: true }).click();
  return dialog(page).locator("#bookmark-results .search-result");
};
const star = async (page, scope) => {
  const button = page.locator(`${scope} [data-bookmark]`);
  await clickControl(button);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  // Phones star from View options, which stays open like its filters.
  const close = page.getByRole("button", { name: "Close view options", exact: true });
  if (await close.isVisible()) await close.click();
};

// Owner request, 30 October 2026: on phones the star sits in View options, leaving the search field
// room for its whole placeholder, also on 360px screens.
onDevices(["small"], () => test("on phones the star sits in View options and the search field shows its placeholder", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const field = page.locator("#view-toolbar #search");
  await field.waitFor();
  await expect(page.locator("#view-toolbar .toolbar-left > [data-bookmark]")).toHaveCount(0);
  await expect(page.locator("#view-toolbar .mobile-view-options-panel [data-bookmark]")).toHaveCount(1);
  const fit = await field.evaluate((input) => {
    const style = getComputedStyle(input), context = document.createElement("canvas").getContext("2d");
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return { text: context.measureText(input.placeholder).width, room: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
  });
  expect(fit.text, `the placeholder fits ${JSON.stringify(fit)}`).toBeLessThanOrEqual(fit.room);
  // The star shows its name inside its own button there.
  await page.locator("#view-toolbar .mobile-view-options > summary").click();
  const star = await page.locator("#view-toolbar .mobile-view-options-panel [data-bookmark]").evaluate((el) => ({ width: el.clientWidth, content: el.scrollWidth, height: el.clientHeight }));
  expect(star.content <= star.width && star.width > star.height, `the label fits the button ${JSON.stringify(star)}`).toBe(true);
  await page.getByRole("button", { name: "Close view options", exact: true }).click();
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator(".board-toolbar").waitFor();
  await expect(page.locator(".board-toolbar > [data-bookmark]")).toHaveCount(0);
  await expect(page.locator(".board-toolbar .mobile-view-options-panel [data-bookmark]")).toHaveCount(1);
}));

onDevices(["desktop", "phone"], () => test("bookmarks made from each bar come first in search and open what they mark", async ({ page }) => {
  await fs.rm(path.join(app.store.root, ".pencils", "bookmarks.json"), { force: true });
  const { project, card, doc } = app;
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await star(page, "#view-toolbar");
  await page.locator(`[data-action=task-open][data-id="${card.id}"]:visible`).first().click();
  await star(page, ".task-title-row");
  await page.keyboard.press("Escape");
  await page.goto(`${app.base}/#project/${project.id}/documents/${doc.id}`);
  await star(page, ".document-heading");
  await page.goto(`${app.base}/#project/${project.id}/board`);
  await star(page, ".board-toolbar");

  await page.reload();
  await expect(page.locator(".board-toolbar [data-bookmark]"), "bookmarks stay after a reload").toHaveAttribute("aria-pressed", "true");
  const bookmarks = await search(page);
  await expect(bookmarks, "all of them before typing, newest first").toHaveText([/Project canvas/, /Planting plan/, /GA-1 Plant bulbs/, /List/]);
  await page.locator("#global-search-input").fill("plant");
  await expect(bookmarks, "the matching ones as you type").toHaveText([/Planting plan/, /GA-1 Plant bulbs/]);
  await page.locator("#global-search-input").fill('"planting plan" -bulbs');
  await expect(bookmarks, "quotes and the server's operators don't hide a bookmark").toHaveText([/Planting plan/]);
  await bookmarks.first().click();
  await expect(page).toHaveURL(new RegExp(`documents/${doc.id}`));
  await (await search(page)).filter({ hasText: "List" }).click();
  await expect(page).toHaveURL(/\/list$/);
  await expect(page.locator(".task-row")).toHaveCount(1);

  // Pressing the star again removes the bookmark.
  const view = page.locator("#view-toolbar [data-bookmark]");
  await clickControl(view);
  await expect(view).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await expect(await search(page)).toHaveCount(3);
  expect(card.key).toBe("GA-1");
}));
