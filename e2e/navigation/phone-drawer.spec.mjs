// Owner request, 28 October 2026 (mobile sidebar assessment): the phone drawer
// fits one screen. Project and organisation share one switcher at the top
// (organisation, projects and teams appear when it opens), New stays under it
// (PEN-1/PEN-6), the views are compact tiles, settings sit in one row at the
// bottom, and every text uses the shared type sizes with one left edge.
// Wider screens keep the desktop sidebar. 
import assert from "node:assert/strict";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "A little more possibility", key: "PD" });
  const other = await store.createProject({ title: "Second project", key: "SP" });
  await store.createTask(project.id, { title: "First task", status: "todo" });
  await store.createTask(other.id, { title: "Other task", status: "todo" });
  return { project };
});
const open = async (page, hash = `#project/${app.project.id}/list`) => {
  await page.goto(`${app.base}/${hash}`);
  await page.locator(".topbar").waitFor();
};

const openDrawer = async (page) => {
  await page.locator(".mobile-menu").click();
  await page.locator(".sidebar.open").waitFor();
};
const visible = (page, selector) => page.locator(`.sidebar ${selector}`).evaluateAll((els) => els.filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden").length);

onDevices(["phone", "small"], () => test("the drawer fits one screen with the switcher, New, view tiles and a settings row", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  const fit = await page.locator(".sidebar").evaluate((el) => ({ scroll: el.scrollHeight, height: el.clientHeight }));
  assert.ok(fit.scroll <= fit.height + 1, `no scrolling needed ${JSON.stringify(fit)}`);
  const switcher = page.locator(".sidebar [data-drawer-switcher]");
  assert.match(await switcher.innerText(), /A little more possibility[\s\S]*Our organisation/, "the switcher names the project and its organisation");
  assert.equal(await switcher.getAttribute("aria-expanded"), "false");
  // Organisation, projects and teams wait behind the switcher.
  for (const selector of [".organisation-switch", ".project-links", ".sidebar-directory"]) assert.equal(await visible(page, selector), 0, `${selector} hidden until the switcher opens`);
  // New stays directly under the switcher (PEN-1, PEN-6).
  const [s, n, firstTile] = await Promise.all([switcher.boundingBox(), page.locator(".sidebar .phone-project-navigation .new-menu > summary").boundingBox(), page.locator(".sidebar .phone-project-navigation [data-view]").first().boundingBox()]);
  assert.ok(s.y + s.height <= n.y + 1 && n.y + n.height <= firstTile.y + 1, "switcher, then New, then the views");
  // Ten views as tiles: several per row, each a full tap target.
  const tiles = await page.locator(".sidebar .phone-project-navigation [data-view]").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { view: el.dataset.view, top: Math.round(r.top), w: r.width, h: r.height, current: el.getAttribute("aria-current") }; }));
  assert.equal(tiles.length, 10);
  assert.ok(new Set(tiles.map((t) => t.top)).size <= 4, `views share rows ${JSON.stringify(tiles.map((t) => t.top))}`);
  assert.ok(tiles.every((t) => t.h >= 44 && t.w >= 44), "44px tap targets");
  assert.deepEqual(tiles.filter((t) => t.current).map((t) => t.view), ["list"]);
  // Settings in one row. Since 0.19.31 one Settings button replaces Project settings and
  // Personal settings ("You"), and Feature requests are gone, leaving Settings and Help.
  const row = await page.locator(".sidebar .phone-drawer-utilities :is(button, [data-personal])").evaluateAll((els) => els.filter((el) => el.getClientRects().length).map((el) => [el.getAttribute("aria-label") || el.textContent.trim(), Math.round(el.getBoundingClientRect().top)]));
  assert.ok(row.length === 2 && new Set(row.map(([, top]) => top)).size === 1, `settings share one row ${JSON.stringify(row)}`);
  assert.deepEqual(row.map(([name]) => name), ["Settings", "Help & guides"]);
}));

onDevices(["phone"], () => test("drawer text uses the shared touch sizes and one left edge", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  await page.locator(".sidebar [data-drawer-switcher]").click();
  await expect(page.locator(".sidebar .project-links")).toBeVisible();
  const text = await page.evaluate(() => {
    const side = document.querySelector(".sidebar");
    const left = side.getBoundingClientRect().left;
    const items = [...side.querySelectorAll(".phone-project-navigation [data-view], .phone-project-navigation .new-menu > summary, [data-drawer-switcher], .project-link, .side-new, .directory-link, .organisation-choice select, .phone-drawer-utilities [aria-label]")].filter((el) => el.getClientRects().length);
    const labels = [...side.querySelectorAll(".phone-navigation-group > span, .side-label, .organisation-choice > span")].filter((el) => el.getClientRects().length);
    const size = (el) => parseFloat(getComputedStyle(el).fontSize);
    const edge = (el) => Math.round(el.getBoundingClientRect().left - left);
    return { itemSizes: items.map((el) => [el.textContent.trim().slice(0, 18), size(el)]), labelSizes: labels.map((el) => [el.textContent.trim(), size(el)]), labelEdges: labels.map(edge), rowEdges: [...side.querySelectorAll("[data-drawer-switcher], .project-link, .side-new, .directory-link, .phone-project-navigation .new-menu > summary")].filter((el) => el.getClientRects().length).map(edge) };
  });
  assert.ok(text.itemSizes.every(([, s]) => s >= 14), `items at least 14px ${JSON.stringify(text.itemSizes)}`);
  assert.ok(text.labelSizes.every(([, s]) => s >= 12), `labels at least 12px ${JSON.stringify(text.labelSizes)}`);
  assert.equal(new Set(text.labelEdges).size, 1, `section labels share one left edge ${JSON.stringify(text.labelEdges)}`);
  assert.equal(new Set(text.rowEdges).size, 1, `rows share one left edge ${JSON.stringify(text.rowEdges)}`);
}));

onDevices(["phone"], () => test("the switcher shows organisation, projects and teams, without duplicate New project", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  const switcher = page.locator(".sidebar [data-drawer-switcher]");
  await switcher.click();
  await expect(switcher).toHaveAttribute("aria-expanded", "true");
  assert.equal(await page.locator(".sidebar.open").count(), 1, "the drawer stays open");
  for (const selector of [".organisation-switch", ".project-links", ".sidebar-directory"]) assert.ok(await visible(page, selector) > 0, `${selector} shown`);
  assert.equal(await visible(page, '[data-action="project-new"]'), 1, "one New project control");
  const links = await page.locator(".sidebar .project-link").evaluateAll((els) => els.map((el) => [el.textContent.trim(), el.classList.contains("active")]));
  assert.deepEqual(links, [["A little more possibility", true], ["Second project", false]]);
  // Choosing a project goes there and closes the drawer.
  await page.locator(".sidebar .project-link", { hasText: "Second project" }).click();
  await page.waitForFunction(() => !document.querySelector(".sidebar.open"));
  await page.waitForFunction(() => document.querySelector('.topbar [role="heading"]')?.textContent.includes("Second project"));
}));

onDevices(["phone"], () => test("views still open from the drawer, which then closes", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  await page.locator('.sidebar .phone-project-navigation [data-view="kanban"]').click();
  await page.waitForFunction(() => !document.querySelector(".sidebar.open"));
  assert.equal(await page.evaluate(() => document.querySelector(".main").dataset.layoutView), "kanban");
}));

onDevices(["phone"], () => test("without a project the drawer lists projects straight away", async ({ page }) => {
  await open(page, "#");
  // Home (the brand) leaves the project; the drawer then leads with projects.
  await openDrawer(page);
  await page.locator(".sidebar .brand").click();
  await page.waitForFunction(() => !document.querySelector(".sidebar.open"));
  await expect(page.locator(".topbar strong")).toHaveText("Projects");
  await openDrawer(page);
  assert.ok(await visible(page, ".project-link") >= 2, "projects listed");
  assert.equal(await visible(page, ".phone-project-navigation"), 0, "no project views");
}));

onDevices(["desktop"], () => test("the desktop sidebar keeps organisation, projects and teams on view", async ({ page }) => {
  await open(page);
  for (const selector of [".organisation-switch", ".project-links", ".sidebar-directory"]) assert.ok(await visible(page, selector) > 0, `${selector} shown`);
  assert.equal(await visible(page, "[data-drawer-switcher]"), 0, "no phone switcher");
  assert.equal(await visible(page, ".phone-project-navigation"), 0, "no phone view tiles");
}));

