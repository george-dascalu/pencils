// Owner request, 28 October 2026 (mobile sidebar assessment), revised 29 October 2026 (bottom
// tab bar, option A): views moved to the bottom tab bar (phone-tabbar.spec.mjs), so the phone
// drawer lists the organisation, projects and teams, with Settings and Help in one row at the
// bottom; every text uses the shared type sizes with one left edge. Wider screens keep the
// desktop sidebar. Since 0.20.85 (owner request T13) Organisation and Projects share one style:
// a title with + on its right over a dropdown.
import assert from "node:assert/strict";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSidebar } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "A little more possibility", key: "PD" });
  const other = await store.createProject({ title: "Second project", key: "SP" });
  await store.createTask(project.id, { title: "First task", status: "todo" });
  await store.createTask(other.id, { title: "Other task", status: "todo" });
  const old = await store.createProject({ title: "Old project", key: "OP" });
  const archived = await store.updateProject(old.id, { revision: old.revision, archived: true });
  return { project, archived };
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

onDevices(["phone", "small"], () => test("the drawer lists organisation and projects, with Settings and Help at the bottom", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  const fit = await page.locator(".sidebar").evaluate((el) => ({ scroll: el.scrollHeight, height: el.clientHeight }));
  assert.ok(fit.scroll <= fit.height + 1, `no scrolling needed ${JSON.stringify(fit)}`);
  for (const selector of [".organisation-switch", ".project-switch"]) assert.ok(await visible(page, selector) > 0, `${selector} shown`);
  assert.equal(await visible(page, "[data-view]"), 0, "no view tiles");
  const row = await page.locator(".sidebar .phone-drawer-utilities :is(button, [data-personal])").evaluateAll((els) => els.filter((el) => el.getClientRects().length).map((el) => [el.getAttribute("aria-label") || el.textContent.trim(), Math.round(el.getBoundingClientRect().top), el.getBoundingClientRect().height]));
  assert.ok(row.length === 3 && new Set(row.map(([, top]) => top)).size === 1, `settings share one row ${JSON.stringify(row)}`);
  assert.deepEqual(row.map(([name]) => name), ["Settings", "Roadmap", "Help & guides"]);
  assert.ok(row.every(([, , h]) => h >= 44), "44px tap targets");
  const [projects, settings, sidebar] = await Promise.all([page.locator(".sidebar .project-switch").boundingBox(), page.locator(".sidebar .phone-drawer-utilities").boundingBox(), page.locator(".sidebar").boundingBox()]);
  assert.ok(settings.y >= projects.y + projects.height, "settings below the projects");
  assert.ok(settings.y + settings.height >= sidebar.y + sidebar.height - 120, "settings near the bottom, within thumb reach");
}));

onDevices(["phone"], () => test("drawer text uses the shared touch sizes and one left edge", async ({ page }) => {
  await open(page);
  await openDrawer(page);
  await expect(page.locator(".sidebar .project-switch")).toBeVisible();
  const text = await page.evaluate(() => {
    const side = document.querySelector(".sidebar");
    const left = side.getBoundingClientRect().left;
    const items = [...side.querySelectorAll(".directory-link, .sidebar-choice select, .phone-drawer-utilities [aria-label]")].filter((el) => el.getClientRects().length);
    const labels = [...side.querySelectorAll(".side-label")].filter((el) => el.getClientRects().length);
    const size = (el) => parseFloat(getComputedStyle(el).fontSize);
    const edge = (el) => Math.round(el.getBoundingClientRect().left - left);
    return { itemSizes: items.map((el) => [el.textContent.trim().slice(0, 18), size(el)]), labelSizes: labels.map((el) => [el.textContent.trim(), size(el)]), labelEdges: labels.map(edge), rowEdges: [...side.querySelectorAll(".project-link, .personal-links > :first-child")].filter((el) => el.getClientRects().length).map(edge) };
  });
  assert.ok(text.itemSizes.every(([, s]) => s >= 14), `items at least 14px ${JSON.stringify(text.itemSizes)}`);
  assert.ok(text.labelSizes.every(([, s]) => s >= 12), `labels at least 12px ${JSON.stringify(text.labelSizes)}`);
  assert.equal(new Set(text.labelEdges).size, 1, `section labels share one left edge ${JSON.stringify(text.labelEdges)}`);
  assert.equal(new Set(text.rowEdges).size, 1, `rows share one left edge ${JSON.stringify(text.rowEdges)}`);
}));

onDevices(["desktop", "phone"], () => test("Organisation and Projects are each a title with + on its right over a dropdown, and choosing a project goes there", async ({ page }) => {
  await open(page);
  await openSidebar(page);
  const sections = await page.locator(".sidebar .sidebar-switch").evaluateAll((els) => els.map((el) => {
    const label = el.querySelector(".side-label"), plus = label.querySelector("button"), select = el.querySelector(".sidebar-choice select");
    const [l, p, c] = [label, plus, select].map((e) => e.getBoundingClientRect());
    return { title: label.firstChild.textContent.trim(), plus: plus.getAttribute("aria-label"), plusAtRight: p.right >= l.right - 20 && p.top >= l.top - 1 && p.bottom <= l.bottom + 1, below: c.top >= l.bottom - 1, select: select.getAttribute("aria-label"), font: getComputedStyle(select).fontSize };
  }));
  expect(sections.map(({ font, ...rest }) => rest)).toEqual([
    { title: "ORGANISATION", plus: "New organisation", plusAtRight: true, below: true, select: "Switch organisation" },
    { title: "PROJECTS", plus: "New project", plusAtRight: true, below: true, select: "Open project" },
  ]);
  expect(sections[0].font, "one type size").toBe(sections[1].font);
  await expect(page.locator(".sidebar :is(.organisation-actions, .project-link, .workspace-icon)")).toHaveCount(0);
  await expect(page.locator('.sidebar [data-action="project-new"]'), "one New project control").toHaveCount(1);
  expect(await page.locator("#project-select option").evaluateAll((els) => els.map((o) => [o.textContent.trim(), o.selected]))).toEqual([["A little more possibility", true], ["Second project", false]]);
  // The app's menu, as for every dropdown.
  await page.locator("#project-select").click();
  await page.locator('.select-menu [role="option"]', { hasText: "Second project" }).click();
  await page.waitForFunction(() => !document.querySelector(".sidebar.open"));
  await page.waitForFunction(() => document.querySelector('.topbar [role="heading"]')?.textContent.includes("Second project"));
}));

// A keyboard choice closes the sidebar and leaves focus on its menu button, as Escape does.
onDevices(["desktop"], () => test("choosing a project with the keyboard keeps focus in the page", async ({ page }) => {
  await open(page);
  await openSidebar(page);
  await page.locator("#project-select").focus();
  await page.keyboard.press("ArrowDown");
  await page.locator('.select-menu [role="option"]').first().waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector('.topbar [role="heading"]')?.textContent.includes("Second project"));
  await expect(page.locator(".topbar .mobile-menu")).toBeFocused();
}));

onDevices(["desktop"], () => test("an open archived project stays named in the Projects dropdown", async ({ page }) => {
  await open(page, `#project/${app.archived.id}/list`);
  await openSidebar(page);
  await expect(page.locator("#project-select")).toHaveValue(app.archived.id);
  await expect(page.locator("#project-select option:checked")).toHaveText("Old project");
}));

onDevices(["phone"], () => test("without a project the drawer offers the projects straight away", async ({ page }) => {
  await open(page, "#");
  // Home (the brand) leaves the project; the drawer then leads with projects.
  await openDrawer(page);
  await page.locator(".sidebar .brand").click();
  await page.waitForFunction(() => !document.querySelector(".sidebar.open"));
  await expect(page.locator(".topbar strong")).toHaveText("Projects");
  await openDrawer(page);
  expect(await page.locator("#project-select option").evaluateAll((els) => els.map((o) => [o.textContent.trim(), o.selected, o.disabled]))).toEqual([["Choose a project", true, true], ["A little more possibility", false, false], ["Second project", false, false]]);
  assert.equal(await visible(page, "[data-view]"), 0, "no project views");
}));

onDevices(["desktop"], () => test("the desktop sidebar holds organisation and projects", async ({ page }) => {
  await open(page);
  await openSidebar(page);
  for (const selector of [".organisation-switch", ".project-switch"]) assert.ok(await visible(page, selector) > 0, `${selector} shown`);
  assert.equal(await visible(page, "[data-view]"), 0, "no view tiles");
}));

