// Owner request (F0.21-86, 3 November 2026): Timeline's card list never moves sideways, and it can be
// shown in full, as card numbers only (no project key), or hidden, so the timeline has the room.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Timeline list", key: "TL" });
  for (const [title, start, due] of [["Sketch the dashboard", "2026-10-05", "2026-10-09"], ["Map the first journey", "2026-10-12", "2026-10-20"]]) await store.createTask(project.id, { title, start, due });
  await store.createTask(project.id, { title: "Unplanned idea" });
  return { project };
});
const label = (page) => page.locator(".timeline-row .timeline-task-label").first();
async function choose(page, value) {
  const select = await reveal(page.locator("[data-timeline-list]"));
  await select.selectOption(value);
  const close = page.getByRole("button", { name: "Close view options", exact: true });
  if (await close.isVisible()) await close.click();
}

onDevices(["desktop", "ipad-portrait", "phone"], () => test("the card list shows in full, as numbers or hidden, remembered, and never moves sideways", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/timeline`);
  await page.locator(".timeline-row").first().waitFor();
  const scroll = page.locator(".timeline-scroll");
  expect(await scroll.evaluate((el) => getComputedStyle(el).overscrollBehaviorX), "no bounce that pulls the list sideways").toBe("none");
  await expect(page.locator("[data-timeline-list]")).toHaveValue("full");
  // Desktop and iPad keep the toolbar to one row, with Card list waiting in Filters.
  if (device !== "phone") {
    const [search, range] = await Promise.all([page.locator("#view-toolbar #search"), page.locator("#view-toolbar [data-timeline-range]")].map((l) => l.boundingBox()));
    expect(Math.abs(search.y + search.height / 2 - (range.y + range.height / 2)), `${device}: one row`).toBeLessThan(4);
    await expect(page.locator('#view-toolbar [data-board-menu="filters"] [data-timeline-list]')).toHaveCount(1);
  }
  const shown = () => label(page).locator(".timeline-task-open").evaluate((el) => el.innerText.trim());
  expect(await shown()).toBe("TL-1 Sketch the dashboard");
  const full = await label(page).boundingBox();
  expect(full.width).toBeGreaterThanOrEqual(200);

  // Numbers: the card's number only, still named in full for screen readers, in a narrow column.
  await choose(page, "number");
  await expect.poll(async () => (await label(page).boundingBox()).width).toBeLessThanOrEqual(64);
  const open = label(page).locator(".timeline-task-open");
  await expect.poll(shown).toBe("1");
  await expect(open).toHaveAccessibleName(/TL-1 Sketch the dashboard/);
  const column = await page.evaluate(() => {
    const bar = document.querySelector("[data-timeline-task]").getBoundingClientRect(), label = document.querySelector(".timeline-row .timeline-task-label").getBoundingClientRect();
    const svg = document.querySelector(".timeline-dependencies").getBoundingClientRect(), header = document.querySelector(".timeline-header > .timeline-task-label").getBoundingClientRect();
    return { label: label.right, header: header.right, svg: svg.left, bar: bar.left };
  });
  expect(Math.abs(column.header - column.label), "the header's column matches the rows'").toBeLessThan(1.5);
  expect(Math.abs(column.svg - column.label), "dependency arrows start where the track does").toBeLessThan(1.5);
  expect(column.bar, "bars start after the list").toBeGreaterThanOrEqual(column.label - 1);
  const arrows = () => page.evaluate(() => {
    const svg = document.querySelector(".timeline-dependencies").getBoundingClientRect(), sheet = document.querySelector(".timeline-sheet").getBoundingClientRect();
    return Math.abs(svg.right - sheet.right);
  });
  expect(await arrows(), "the arrows' layer reaches the timeline's end").toBeLessThan(1.5);

  // Hidden: no list at all, and the tracks start at the timeline's left edge.
  await choose(page, "hidden");
  await expect(label(page)).toBeHidden();
  const edge = await page.evaluate(() => {
    const scroll = document.querySelector(".timeline-scroll").getBoundingClientRect(), track = document.querySelector(".timeline-track").getBoundingClientRect(), ruler = document.querySelector(".timeline-ruler").getBoundingClientRect();
    return { scroll: scroll.left, track: track.left, ruler: ruler.left };
  });
  expect(Math.abs(edge.track - edge.scroll)).toBeLessThan(2);
  expect(Math.abs(edge.ruler - edge.scroll)).toBeLessThan(2);
  expect(await arrows()).toBeLessThan(1.5);
  // An unscheduled row still names its card.
  const hint = page.locator(".timeline-unplanned .timeline-schedule-hint").first();
  expect(await hint.evaluate((el) => el.innerText)).toContain("TL-3 Unplanned idea");
  await page.reload();
  await page.locator(".timeline-row").first().waitFor();
  await expect(page.locator("[data-timeline-list]"), `${device}: remembered`).toHaveValue("hidden");
  await expect(label(page)).toBeHidden();
  await choose(page, "full");
  await expect(label(page)).toBeVisible();
}));
