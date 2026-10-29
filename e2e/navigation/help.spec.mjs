// Help & guides: a wiki-style page opened from the project header (not a modal), with every
// article, full-text search, contents links, keyboard focus, Back/Forward, filters kept,
// reload and deep links, project controls still usable on desktop and phone, both themes and
// accessibility. Help loads entirely from the local server and reading it changes no data.
// Part of the cross-browser release gate.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, useApp } from "../fixtures.mjs";
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
    if (["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) && !r.url().endsWith("/presence")) seen.mutations.push(r.url());
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
  await page.locator('.top-actions [data-action="help"]').click();
  await title(page, "Help & guides");
}

test("Help opens as a page in the project header, and Back restores the filtered project", { tag: "@gate" }, async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await page.locator(".spreadsheet").waitFor();
  const originalHeader = await page.locator(".topbar").boundingBox();
  await page.locator("#search").fill("Keep this filter");
  await page.locator('.top-actions [data-action="help"]').click();
  await title(page, "Help & guides");
  expect(await page.locator(".topbar").boundingBox(), "Opening Help retains the project header geometry").toEqual(originalHeader);
  await expect(page.locator(".breadcrumb strong")).toHaveText(app.project.title);
  await expect(page.locator(".tabs [data-view]")).toHaveCount(5);
  await expect(page.locator('.tabs [aria-current="page"]')).toHaveCount(0);
  await expect(page.locator(".topbar .new-menu > summary:visible")).toHaveCount(1);
  // Since 0.19.31 one Settings button replaces the project gear and the avatar.
  await expect(page.locator('.topbar [data-action="settings"]')).toHaveCount(1);
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
      // In Documents the drawer opens on the document list (0.19.27); go back to the menu first.
      const openHelp = async () => {
        if (phone) {
          await page.locator(".mobile-menu").click();
          if (await page.locator(".sidebar [data-drawer-back]").isVisible()) await page.locator(".sidebar [data-drawer-back]").click();
          await page.locator('.phone-drawer-utilities [data-action="help"]').click();
        } else await page.locator('.top-actions [data-action="help"]').click();
        await title(page, "Help & guides");
      };
      await page.goto(`${app.base}/#project/${app.project.id}/settings/general`);
      await page.locator("[data-settings-form]").waitFor();
      const settingsHeader = await page.locator(".topbar").boundingBox();
      await openHelp();
      expect(await page.locator(".topbar").boundingBox()).toEqual(settingsHeader);
      const switcher = page.locator("#project-view-switcher");
      if (!phone && await switcher.isVisible()) {
        await expect(switcher).toHaveValue("help");
        await switcher.selectOption("documents");
      } else await page.locator('.tabs [data-view="documents"]').click();
      await page.locator(".documents-workspace").waitFor();
      await expect(page.locator(".help-page")).toHaveCount(0);
      await openHelp();
      await newCard(page);
      await page.locator("#task-form").waitFor();
      await page.locator('[data-action="dialog-close"]').click();
      await title(page, "Help & guides");
      if (phone) {
        await page.locator(".mobile-menu").click();
        await page.locator('.phone-drawer-utilities [data-action="settings"]').click();
      } else await page.locator('.topbar [data-action="settings"]').click();
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
