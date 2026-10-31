// Owner request (T24, 31 October 2026): an internal roadmap, a simple list of the feature
// requests with their status and when each was started and done, kept up to date with every
// release (public/roadmap.js). A Roadmap tile sits between Settings and Help at the bottom of
// the sidebar and opens the list as a help page.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSidebar } from "../helpers/menu-controls.mjs";
import { axeViolations } from "../helpers/documents.mjs";
import { roadmap, shortWhen, took } from "../../public/roadmap.js";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Roadmap", key: "RM" }) }));

onDevices(["desktop", "ipad", "phone"], () => test("the sidebar's Roadmap tile opens the list of requests with their status and dates", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await openSidebar(page);
  const tiles = page.locator(".sidebar .phone-drawer-utilities button");
  await expect(tiles).toHaveText(["Settings", "Roadmap", "Help"]);
  expect(await tiles.evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1 || [...el.querySelectorAll("span")].some((s) => s.scrollWidth > s.clientWidth + 1)).map((el) => el.textContent.trim())), `${device}: every tile's label fits`).toEqual([]);
  await tiles.nth(1).click();
  await expect(page.locator("#help-title")).toHaveText("Roadmap");
  await expect(page.locator(".sidebar"), "choosing closes the sidebar").not.toHaveClass(/\bopen\b/);
  expect(await axeViolations(page, ".help-page"), `${device}: accessible`).toEqual([]);
  await expect(page).toHaveURL(/#help\/roadmap$/);
  const sections = page.locator(".help-section h2");
  await expect(sections).toHaveText(["In progress", "Requested", "Done"]);
  // Every item appears once, under its status, with its id, dates and release.
  for (const item of roadmap) {
    const row = page.locator(`.help-section tr[data-roadmap="${item.id}"]`);
    await expect(row, `${device}: ${item.id}`).toHaveCount(1);
    expect(await row.evaluate((el) => el.closest(".help-section").querySelector("h2").textContent), item.id).toBe({ "in progress": "In progress", requested: "Requested", done: "Done" }[item.status]);
    await expect(row).toContainText(item.title);
    // Times in short form (T29): "31 Oct 20:05", a bare date as "31 Oct"; Took from started to done.
    for (const value of [item.requested, item.started, item.done].filter(Boolean)) await expect(row).toContainText(shortWhen(value));
    if (item.version) await expect(row).toContainText(item.version);
    await expect(row.locator("td").nth(5), `${item.id} took`).toHaveText(took(item.started, item.done));
  }
  await expect(page.locator('.help-section:has(h2:text-is("Done")) thead th')).toHaveText(["ID", "Request", "Requested", "Started", "Done", "Took", "Release"]);
  expect(roadmap.some((i) => took(i.started, i.done)), "at least one item shows how long it took").toBe(true);
  const done = page.locator('.help-section:has(h2:text-is("Done")) tbody tr');
  expect(await done.evaluateAll((rows) => rows.map((r) => r.dataset.roadmap)), "done items newest first").toEqual(roadmap.filter((i) => i.status === "done").sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }) || b.id.localeCompare(a.id, undefined, { numeric: true })).map((i) => i.id));
  // The tables stay inside the page; on narrow screens each scrolls within its own region.
  expect(await page.locator(".help-article").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${device}: no sideways overflow`).toBe(true);
  expect(await page.locator(".help-table").evaluateAll((els) => els.every((el) => getComputedStyle(el).overflowX !== "visible")), `${device}: tables scroll within their region`).toBe(true);
}));
