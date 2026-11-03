// Owner request (T24, 31 October 2026): an internal roadmap, a simple list of the feature
// requests with their status and when each was started and done, kept up to date with every
// release (public/roadmap.js). A Roadmap tile sits between Settings and Help at the bottom of
// the sidebar and opens the list as a help page.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSidebar } from "../helpers/menu-controls.mjs";
import { axeViolations } from "../helpers/documents.mjs";
import { roadmap, shortWhen, took } from "../../public/roadmap.js";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Roadmap", key: "RM" }) }));

onDevices(["desktop", "ipad", "phone"], () => test("the sidebar's Roadmap tile opens the list of requests with their status and dates", { tag: '@gate' }, async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await openSidebar(page);
  const tiles = page.locator(".sidebar .phone-drawer-utilities button");
  await expect(tiles).toHaveText(["Settings", "Roadmap", "Help"]);
  expect(await tiles.evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1 || [...el.querySelectorAll("span")].some((s) => s.scrollWidth > s.clientWidth + 1)).map((el) => el.textContent.trim())), `${device}: every tile's label fits`).toEqual([]);
  await tiles.nth(1).click();
  await expect(page.locator("#help-title")).toHaveText("Roadmap");
  await expect(page.locator('.help-intro, .help-contents')).toHaveCount(0);
  await expect(page.locator(".sidebar"), "choosing closes the sidebar").not.toHaveClass(/\bopen\b/);
  expect(await axeViolations(page, ".help-page"), `${device}: accessible`).toEqual([]);
  await expect(page).toHaveURL(/#help\/roadmap$/);
  const sections = page.locator(".help-section h2");
  await expect(sections).toHaveText(["In progress", "Requested", "Done"]);
  // Every item appears once, under its status, with its id, dates and release.
  await expect(page.locator('.help-section tr[data-roadmap]')).toHaveCount(roadmap.length);
  const records = await page.locator('.help-section tr[data-roadmap]').evaluateAll(rows => rows.map(row => ({
    id: row.dataset.roadmap,
    section: row.closest('.help-section').querySelector('h2').textContent,
    cells: [...row.querySelectorAll('td')].map(cell => cell.textContent.trim()),
    model: row.querySelector('.roadmap-model')?.textContent,
    effort: row.querySelector('.roadmap-effort')?.textContent,
  })));
  expect(new Set(records.map(row => row.id)).size, 'no duplicate roadmap IDs').toBe(roadmap.length);
  const byId = new Map(records.map(row => [row.id, row]));
  for (const item of roadmap) {
    const row = byId.get(item.id);
    expect(row, `${device}: ${item.id}`).toBeTruthy();
    expect(row.section, item.id).toBe({ "in progress": "In progress", requested: "Requested", done: "Done" }[item.status]);
    expect(row.cells[0], item.id).toBe(item.id);
    expect(row.cells[1], item.id).toBe(item.title);
    // Times in short form (T29): "31 Oct 20:05", a bare date as "31 Oct"; Took from started to done.
    for (const [index, value] of [item.requested, item.started, item.done].entries()) expect(row.cells[index + 2], `${item.id} date ${index}`).toBe(shortWhen(value) || '—');
    expect(row.cells[7], `${item.id} version`).toBe(item.version || '');
    expect(row.cells[5], `${item.id} took`).toBe(took(item.started, item.done) || '—');
    expect(row.model, `${item.id} model`).toBe(item.model);
    expect(row.effort, `${item.id} effort`).toBe(item.model ? item.effort || 'Not recorded' : undefined);
  }
  await expect(page.locator('.help-section:has(h2:text-is("Done")) thead th')).toHaveText(["ID", "Request", "Requested", "Started", "Done", "Took", "Model / effort", "Release"]);
  const newest = page.locator('[data-roadmap="F0.21-67"]');
  await expect(newest.locator('td').first()).toHaveCSS('white-space', 'nowrap');
  expect(await newest.locator('td').first().evaluate(el => ({ width: el.getBoundingClientRect().width, fits: el.scrollWidth <= el.clientWidth }))).toEqual({ width: expect.any(Number), fits: true });
  expect(await newest.locator('td').first().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(112);
  await expect(newest.locator('time')).toHaveCount(3);
  for (const time of await newest.locator('time').all()) {
    await expect(time).toContainText(/\d{1,2} \w{3} \d{2}:\d{2}/);
    await expect(time).toHaveAttribute('title', /2026.*GMT/);
  }
  const older = page.locator('[data-roadmap="T101"]');
  await expect(older.locator('time')).toHaveCount(3);
  await expect(older.locator('td').nth(6)).toContainText('gpt-6-astra');
  await expect(page.locator('[data-roadmap="T2"] td').nth(6)).toHaveText('—');
  expect(roadmap.some((i) => took(i.started, i.done)), "at least one item shows how long it took").toBe(true);
  const done = page.locator('.help-section:has(h2:text-is("Done")) tbody tr');
  expect(await done.evaluateAll((rows) => rows.map((r) => r.dataset.roadmap)), "done items newest first").toEqual(roadmap.filter((i) => i.status === "done").sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }) || b.id.localeCompare(a.id, undefined, { numeric: true })).map((i) => i.id));
  // The tables stay inside the page; on narrow screens each scrolls within its own region.
  expect(await page.locator(".help-article").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${device}: no sideways overflow`).toBe(true);
  expect(await page.locator(".help-table").evaluateAll((els) => els.every((el) => getComputedStyle(el).overflowX !== "visible")), `${device}: tables scroll within their region`).toBe(true);
  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(page.locator('.help-intro')).toBeVisible();
  await expect(page.locator('.help-contents')).toBeVisible();
}));
