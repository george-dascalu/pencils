// Help & guides: a wiki-style page opened from the project header (not a modal), with every
// article, full-text search, contents links, keyboard focus, Back/Forward, filters kept,
// reload and deep links, project controls still usable on desktop and phone, both themes and
// accessibility. Help loads entirely from the local server and reading it changes no data.
// Part of the cross-browser release gate.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, useApp } from "../fixtures.mjs";
import { openHelp } from "../helpers/menu-controls.mjs";
import { helpArticles } from "../../public/help-content.js";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Help workspace" });
  await store.createTask(project.id, { title: "Keep this filter" });
  return { project };
});

// Every test: Help loads entirely from the local server and changes no project data or integrations.
const traffic = new WeakMap();
test.beforeEach(async ({ page }) => {
  const seen = { external: [], mutations: [] };
  traffic.set(page, seen);
  page.on("request", (r) => {
    if (r.url().startsWith("http") && !r.url().startsWith(app.base)) seen.external.push(r.url());
    // Presence and the person's own visits (Home's Recent panel) aren't project data.
    if (["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) && !r.url().endsWith("/presence") && !r.url().endsWith("/visits")) seen.mutations.push(r.url());
  });
});
test.afterEach(async ({ page }) => {
  const seen = traffic.get(page);
  expect(seen.external, "Help loads entirely from the local server").toEqual([]);
  expect(seen.mutations, "Reading help changes no project data or integrations").toEqual([]);
});

const title = (page, text) => expect(page.locator("#help-title")).toHaveText(text);
async function helpFromTable(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await page.locator(".spreadsheet").waitFor();
  await openHelp(page);
  await title(page, "Help & guides");
}

test("Help opens as a page in the project header, and Back restores the filtered project", { tag: "@gate" }, async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await page.locator(".spreadsheet").waitFor();
  const originalHeader = await page.locator(".topbar").boundingBox();
  await page.locator("#search").fill("Keep this filter");
  await openHelp(page);
  await title(page, "Help & guides");
  expect(await page.locator(".topbar").boundingBox(), "Opening Help retains the project header geometry").toEqual(originalHeader);
  await expect(page.locator(".breadcrumb strong")).toHaveText(app.project.title);
  await expect(page.locator(".tabs [data-view]")).toHaveCount(5);
  await expect(page.locator('.tabs [aria-current="page"]')).toHaveCount(0);
  await expect(page.locator(".topbar .new-menu > summary:visible")).toHaveCount(1);
  // Since 0.19.31 one Settings button replaces the project gear and the avatar.
  await expect(page.locator(".sidebar [data-action=settings]")).toHaveCount(1);
  await expect(page.locator("dialog"), "Help is a page, not a modal").toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("#help/start");
  await page.goBack();
  await page.locator(".spreadsheet").waitFor();
  await expect(page.locator("#search"), "Back restores the filtered project").toHaveValue("Keep this filter");
  await page.goForward();
  await title(page, "Help & guides");
});

test("search, contents and article links move keyboard focus and survive Back and reload", { tag: "@gate" }, async ({ page }) => {
  await helpFromTable(page);
  await page.locator("#help-search").fill("Files.Read.All");
  await expect(page.locator("#help-navigation a:not([hidden])")).toHaveCount(1);
  await page.locator("#help-search").press("Enter");
  await title(page, "SharePoint Excel");
  await expect(page.locator("#help-title")).toBeFocused();
  await page.locator('[data-help-section="identifiers"]').click();
  await expect(page.locator("#help-section-identifiers")).toBeFocused();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.locator('#help-navigation [data-id="jira"]').click();
  await title(page, "Jira Cloud");
  await page.locator('[data-action="help-back"]').click();
  await title(page, "SharePoint Excel");
  await Promise.all([page.waitForEvent("domcontentloaded"), page.evaluate(() => location.reload())]);
  await title(page, "SharePoint Excel");
  expect(new URL(page.url()).hash).toBe("#help/excel");
  await expect(page.locator(".breadcrumb strong"), "Reloading Help preserves its project context").toHaveText(app.project.title);
});

test("every guide opens with its sections and working links", { tag: "@gate" }, async ({ page }) => {
  await helpFromTable(page);
  await page.locator("#help-search").fill("zznomatch");
  await expect(page.locator("#help-search-status")).toHaveText(/No guides found/);
  await page.locator("#help-search").press("Escape");
  await expect(page.locator("#help-navigation a:not([hidden])")).toHaveCount(helpArticles.length);
  for (const article of helpArticles) {
    await page.locator(`#help-navigation [data-id="${article.id}"]`).click();
    await title(page, article.title);
    await expect(page.locator(".help-section h2")).toHaveCount(article.sections.length);
    for (const href of await page.locator('.help-article a[href^="#help/"]').evaluateAll((links) => links.map((a) => a.hash)))
      expect(helpArticles.some((a) => href === `#help/${a.id}`), `Working article link: ${href}`).toBe(true);
  }
});

// Project controls remain usable from Help in desktop and mobile layouts.
for (const width of [1600, 1180, 390]) {
  test.describe(`${width}px wide`, () => {
    test.use({ viewportSize: { width, height: 900 } });
    test("project navigation, New and settings stay usable from Help", { tag: "@gate" }, async ({ page }) => {
      const phone = width <= 600;
      // Help is at the bottom of the sidebar, which opens over the page (0.20.24).
      const showHelp = async () => {
        await page.locator(".mobile-menu").click();
        await page.locator('.phone-drawer-utilities [data-action="help"]').click();
        await title(page, "Help & guides");
      };
      await page.goto(`${app.base}/#project/${app.project.id}/settings/general`);
      await page.locator("[data-settings-form]").waitFor();
      const settingsHeader = await page.locator(".topbar").boundingBox();
      await showHelp();
      expect(await page.locator(".topbar").boundingBox()).toEqual(settingsHeader);
      const switcher = page.locator("#project-view-switcher");
      if (!phone && await switcher.isVisible()) {
        await expect(switcher).toHaveValue("help");
        await switcher.selectOption("documents");
      } else await page.locator('.tabs [data-view="documents"]').click();
      await page.locator(".documents-workspace").waitFor();
      await expect(page.locator(".help-page")).toHaveCount(0);
      await showHelp();
      await newCard(page);
      await page.locator("#task-form").waitFor();
      await page.locator('[data-action="dialog-close"]').click();
      await title(page, "Help & guides");
      await page.locator(".mobile-menu").click();
      await page.locator('.phone-drawer-utilities [data-action="settings"]').click();
      await page.locator("[data-settings-form]").waitFor();
      await expect(page.locator(".help-page")).toHaveCount(0);
    });
  });
}

test("a fresh standalone Help link does not select an unrelated project", { tag: "@gate" }, async ({ page }) => {
  await page.goto(`${app.base}/#help/miro`);
  await page.locator("#help-title").waitFor();
  await expect(page.locator(".tabs"), "A fresh standalone Help link does not select an unrelated project").toHaveCount(0);
});

// Owner request T40, 1 November 2026 (T80, audit B16): on phones Back, search and the guide list share
// one row above the article, and the Roadmap's tables scroll inside their box.
test.describe("phone help", () => {
  test.use({ viewportSize: { width: 390, height: 844 } });
  test("Back, search and the guide list share one row, and tables scroll inside their box", async ({ page }) => {
    await page.goto(`${app.base}/#help/roadmap`);
    await page.locator("#help-title").waitFor();
    const centre = async (locator) => { const box = await locator.boundingBox(); return box.y + box.height / 2; };
    const back = await centre(page.locator('[data-action="help-back"]'));
    expect(Math.abs((await centre(page.locator("#help-search"))) - back), "search beside Back").toBeLessThanOrEqual(4);
    expect(Math.abs((await centre(page.locator(".help-navigation > summary"))) - back), "the guide list beside Back").toBeLessThanOrEqual(4);
    expect((await page.locator("#help-title").boundingBox()).y, "the article starts near the top").toBeLessThan(200);
    await expect(page.locator('[data-action="help-back"]')).toHaveAccessibleName("Back");
    await expect(page.locator("#help-search")).toHaveAccessibleName("Search help");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no page overflow").toBe(true);
    const table = page.locator(".help-table").first();
    expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === "auto"), "the table scrolls in its box").toBe(true);
    // The guide list opens below its button, inside the window, and a guide opens from it.
    await page.locator(".help-navigation > summary").click();
    const list = page.locator("#help-navigation");
    await expect(list).toBeVisible();
    const box = await list.boundingBox();
    expect(box.x >= 0 && box.x + box.width <= 390 && box.y + Math.min(box.height, 400) <= 844, JSON.stringify(box)).toBe(true);
    // Like a menu, it closes with Escape or a press outside.
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await page.locator(".help-navigation > summary").click();
    // The list covers the top of the article on a phone: press the article below it (a stray redraw
    // used to close the list before this press).
    const below = await list.boundingBox();
    await page.mouse.click(below.x + below.width / 2, below.y + below.height + 60);
    await expect(list).toBeHidden();
    // A search with no match shows its message, not an empty list over it.
    await page.locator("#help-search").fill("zznomatch");
    await expect(page.locator("#help-search-status")).toBeVisible();
    await expect(list).toBeHidden();
    await page.locator("#help-search").fill("obsidian");
    await expect(list).toBeVisible();
    await list.locator('[data-id="obsidian"]').click();
    await expect(page.locator("#help-title")).toHaveText("Obsidian");
  });
});

for (const width of [1600, 390]) {
  test.describe(`${width}px wide`, () => {
    test.use({ viewportSize: { width, height: 900 } });
    test("direct links, search, layout and accessibility hold in both themes", { tag: "@gate" }, async ({ page }) => {
      // Direct links also work in a fresh browser tab with no project selected.
      await page.goto(`${app.base}/#help/start`);
      await title(page, "Help & guides");
      for (const theme of ["light", "dark"]) {
        await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
        // Only the hash changes, so the page (and its theme) stays loaded.
        await page.goto(`${app.base}/#help/obsidian`);
        await title(page, "Obsidian");
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.locator("#help-search").fill("SharePoint Excel");
        await expect(page.locator('#help-navigation [data-id="excel"]'), "Mobile search reveals article links").toBeVisible();
        await page.locator('#help-navigation [data-id="excel"]').click();
        await title(page, "SharePoint Excel");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal page overflow").toBe(true);
        const accessibility = await new AxeBuilder({ page }).include(".help-page").analyze();
        expect(accessibility.violations.map((v) => `${v.id}: ${v.description}`), `Accessible help page in ${theme}`).toEqual([]);
      }
    });
  });
}
