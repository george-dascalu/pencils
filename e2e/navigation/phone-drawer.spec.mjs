// Owner request, 28 October 2026 (mobile sidebar assessment), revised 29 October 2026 (bottom
// tab bar, option A): views moved to the bottom tab bar (phone-tabbar.spec.mjs), so the phone
// drawer lists the organisation, projects and teams, with Settings and Help in one row at the
// bottom; every text uses the shared type sizes with one left edge. Wider screens keep the
// desktop sidebar.
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

onDevices(["phone", "small"], () => test("the drawer lists organisation, projects and teams, with Settings and Help at the bottom", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  const fit = await page.locator(".sidebar").evaluate((el) => ({ scroll: el.scrollHeight, height: el.clientHeight }));
  assert.ok(fit.scroll <= fit.height + 1, `no scrolling needed ${JSON.stringify(fit)}`);
  for (const selector of [".organisation-switch", ".project-links", ".sidebar-directory"]) assert.ok(await visible(page, selector) > 0, `${selector} shown`);
  assert.equal(await visible(page, "[data-view]"), 0, "no view tiles");
  const row = await page.locator(".sidebar .phone-drawer-utilities :is(button, [data-personal])").evaluateAll((els) => els.filter((el) => el.getClientRects().length).map((el) => [el.getAttribute("aria-label") || el.textContent.trim(), Math.round(el.getBoundingClientRect().top), el.getBoundingClientRect().height]));
  assert.ok(row.length === 2 && new Set(row.map(([, top]) => top)).size === 1, `settings share one row ${JSON.stringify(row)}`);
  assert.deepEqual(row.map(([name]) => name), ["Settings", "Help & guides"]);
  assert.ok(row.every(([, , h]) => h >= 44), "44px tap targets");
  const [teams, settings, sidebar] = await Promise.all([page.locator(".sidebar .sidebar-directory").boundingBox(), page.locator(".sidebar .phone-drawer-utilities").boundingBox(), page.locator(".sidebar").boundingBox()]);
  assert.ok(settings.y >= teams.y + teams.height, "settings below the teams");
  assert.ok(settings.y + settings.height >= sidebar.y + sidebar.height - 120, "settings near the bottom, within thumb reach");
}));

onDevices(["phone"], () => test("drawer text uses the shared touch sizes and one left edge", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  await expect(page.locator(".sidebar .project-links")).toBeVisible();
  const text = await page.evaluate(() => {
    const side = document.querySelector(".sidebar");
    const left = side.getBoundingClientRect().left;
    const items = [...side.querySelectorAll(".project-link, .side-new, .directory-link, .organisation-choice select, .phone-drawer-utilities [aria-label]")].filter((el) => el.getClientRects().length);
    const labels = [...side.querySelectorAll(".side-label, .organisation-choice > span")].filter((el) => el.getClientRects().length);
    const size = (el) => parseFloat(getComputedStyle(el).fontSize);
    const edge = (el) => Math.round(el.getBoundingClientRect().left - left);
    return { itemSizes: items.map((el) => [el.textContent.trim().slice(0, 18), size(el)]), labelSizes: labels.map((el) => [el.textContent.trim(), size(el)]), labelEdges: labels.map(edge), rowEdges: [...side.querySelectorAll(".project-link, .side-new, .directory-links .directory-link, .personal-links > :first-child")].filter((el) => el.getClientRects().length).map(edge) };
  });
  assert.ok(text.itemSizes.every(([, s]) => s >= 14), `items at least 14px ${JSON.stringify(text.itemSizes)}`);
  assert.ok(text.labelSizes.every(([, s]) => s >= 12), `labels at least 12px ${JSON.stringify(text.labelSizes)}`);
  assert.equal(new Set(text.labelEdges).size, 1, `section labels share one left edge ${JSON.stringify(text.labelEdges)}`);
  assert.equal(new Set(text.rowEdges).size, 1, `rows share one left edge ${JSON.stringify(text.rowEdges)}`);
}));

onDevices(["phone"], () => test("choosing a project goes there and closes the drawer, with one New project control", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  assert.equal(await visible(page, '[data-action="project-new"]'), 1, "one New project control");
  const links = await page.locator(".sidebar .project-link").evaluateAll((els) => els.map((el) => [el.textContent.trim(), el.classList.contains("active")]));
  assert.deepEqual(links, [["A little more possibility", true], ["Second project", false]]);
  await page.locator(".sidebar .project-link", { hasText: "Second project" }).click();
  await page.waitForFunction(() => !document.querySelector(".sidebar.open"));
  await page.waitForFunction(() => document.querySelector('.topbar [role="heading"]')?.textContent.includes("Second project"));
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
  assert.equal(await visible(page, "[data-view]"), 0, "no project views");
}));

onDevices(["desktop"], () => test("the desktop sidebar keeps organisation, projects and teams on view", async ({ page }) => {
  await open(page);
  for (const selector of [".organisation-switch", ".project-links", ".sidebar-directory"]) assert.ok(await visible(page, selector) > 0, `${selector} shown`);
  assert.equal(await visible(page, "[data-view]"), 0, "no view tiles");
}));

