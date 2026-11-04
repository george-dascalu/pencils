// Owner requests (F0.21-89, 4 November 2026): Timeline's range uses the Agenda range menu's style
// (dates on one side, quick ranges on the other); the Day/Week/Month dropdown goes, the scale
// following the dates shown; Review schedule leaves the toolbar (it stays in a card's
// Dependencies); and weekends stand out a little more.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal } from "../helpers/menu-controls.mjs";
import { accessibilityReport } from "../helpers/accessibility.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Timeline toolbar", key: "TT" });
  await store.createTask(project.id, { title: "Short job", start: "2026-10-05", due: "2026-10-09" });
  await store.createTask(project.id, { title: "Next job", start: "2026-10-12", due: "2026-10-16" });
  const embedded = await store.createProject({ title: "Board timeline", key: "BT" });
  await store.createTask(embedded.id, { title: "Board job", start: "2026-10-05", due: "2026-10-09" });
  const board = (await store.snapshot(embedded.id)).boards[0];
  await store.updateBoard(embedded.id, board.id, { revision: board.revision, nodes: [{ id: "timeline", type: "query", text: "Live timeline", x: 20, y: 20, w: 1100, h: 520, viewType: "timeline", query: {} }], edges: [] });
  return { project, embedded, board };
});
const root = (page) => page.locator('[data-timeline="project"]');
const trigger = (page) => page.locator("[data-timeline-range]");
const panel = (page) => page.locator("#timeline-range-popover");
const closeOptions = async (page) => {
  const close = page.getByRole("button", { name: "Close view options", exact: true });
  if (await close.isVisible()) await close.click();
};
async function openRange(page) {
  await (await reveal(trigger(page))).click();
  await expect(panel(page)).toBeVisible();
}
const today = () => new Date().toLocaleDateString("en-CA");
const shift = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

onDevices(["desktop", "phone"], () => test("the range menu matches Agenda's, the scale follows the dates, and no Scale or Review schedule", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/timeline`);
  await root(page).locator(".timeline-row").first().waitFor();
  await expect(page.locator("[data-timeline-scale]"), "no Day/Week/Month dropdown").toHaveCount(0);
  await expect(page.locator('#view-toolbar [data-feature="schedule-preview"], #view-content [data-feature="schedule-preview"]'), "no Review schedule").toHaveCount(0);
  // Two weeks of cards: days.
  await expect(root(page)).toHaveAttribute("data-scale", "day");
  await expect(await reveal(trigger(page))).toHaveAccessibleName("Timeline range: All cards");
  await openRange(page);
  const quick = panel(page).locator("[data-range-quick]");
  await expect(quick).toHaveText(["All cards", "This week", "Next week", "This month", "Next month", "Next 7 days", "Next 14 days", "Next 30 days", "Next 90 days"]);
  await expect(quick.filter({ hasText: "All cards" })).toHaveAttribute("aria-pressed", "true");
  const form = panel(page).locator("form.range-dates");
  await expect(form.locator("strong")).toHaveText("Dates");
  const [dates, list] = await Promise.all([form.boundingBox(), panel(page).locator(".range-quick").boundingBox()]);
  if (device === "desktop") expect(dates.x + dates.width, "dates beside the quick ranges").toBeLessThanOrEqual(list.x + 1);
  else expect(dates.y + dates.height, "dates above the quick ranges").toBeLessThanOrEqual(list.y + 1);
  const box = await panel(page).boundingBox(), viewport = page.viewportSize();
  expect(box.x >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, JSON.stringify(box)).toBe(true);
  if (device === "phone") for (const height of await quick.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(height).toBeGreaterThanOrEqual(44);
  // The menu's look: Agenda's quick-range rows, with the chosen one highlighted.
  const [chosen, other] = await Promise.all([quick.first(), quick.nth(1)].map((l) => l.evaluate((el) => getComputedStyle(el).backgroundColor)));
  expect(chosen).not.toBe(other);

  // A quick range: closes, names itself, moves with today and picks weeks for 90 days.
  await quick.filter({ hasText: "Next 90 days" }).click();
  await expect(panel(page)).toHaveCount(0);
  await closeOptions(page);
  await expect(root(page)).toHaveAttribute("data-range-start", today());
  await expect(root(page)).toHaveAttribute("data-range-end", shift(today(), 89));
  await expect(root(page)).toHaveAttribute("data-scale", "week");
  await page.reload();
  await root(page).locator(".timeline-row").first().waitFor();
  await expect(await reveal(trigger(page))).toHaveAccessibleName("Timeline range: Next 90 days");

  // Dates: checked first, then shown; a month of days uses days.
  await openRange(page);
  await form.locator('input[name="from"]').fill("2026-10-31");
  await form.locator('input[name="to"]').fill("2026-10-01");
  await form.getByRole("button", { name: "Show dates", exact: true }).click();
  await expect(form.locator("[data-range-error]")).toBeVisible();
  await form.locator('input[name="from"]').fill("2026-10-01");
  await form.locator('input[name="to"]').fill("2026-10-31");
  await form.getByRole("button", { name: "Show dates", exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await closeOptions(page);
  await expect(root(page)).toHaveAttribute("data-range-start", "2026-10-01");
  await expect(root(page)).toHaveAttribute("data-range-end", "2026-10-31");
  await expect(root(page)).toHaveAttribute("data-scale", "day");
  await expect(await reveal(trigger(page))).toHaveAccessibleName(/Timeline range: 1 Oct.* – 31 Oct/);
  await closeOptions(page);

  // All cards fits the dates to the cards again.
  await openRange(page);
  await panel(page).locator('[data-range-quick="auto"]').click();
  await closeOptions(page);
  await expect(root(page)).toHaveAttribute("data-range-end", "");
}));

test("Escape, a click outside and the range button close the range menu", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/timeline`);
  await root(page).locator(".timeline-row").first().waitFor();
  await openRange(page);
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
  await openRange(page);
  await trigger(page).click();
  await expect(panel(page), "the button toggles it").toHaveCount(0);
  await openRange(page);
  await page.locator(".timeline-header").click();
  await expect(panel(page)).toHaveCount(0);
});

test("weekends stand out a little more, in the header and the rows", { tag: "@gate" }, async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/timeline`);
  await root(page).locator(".timeline-row").first().waitFor();
  const colours = await root(page).evaluate((el) => {
    const probe = (background) => { const p = document.createElement("span"); p.style.background = background; el.append(p); const value = getComputedStyle(p).backgroundColor; p.remove(); return value; };
    return {
      weekend: probe("var(--weekend-shade)"),
      old: probe("color-mix(in srgb, var(--line) 35%, transparent)"),
      tick: getComputedStyle(el.querySelector(".timeline-ticks > span.weekend")).backgroundColor,
      track: getComputedStyle(el.querySelector(".timeline-track")).backgroundImage,
    };
  });
  // rgba(…, a) or color(srgb r g b / a), as engines print a color-mix().
  const alpha = (colour) => Number((/\/\s*([\d.]+)\)$/.exec(colour) || /rgba\([^)]*,\s*([\d.]+)\)$/.exec(colour))?.[1] ?? 1);
  expect(colours.tick, "the header's weekend days").toBe(colours.weekend);
  expect(colours.track, "the rows' weekend columns").toContain(colours.weekend);
  expect(alpha(colours.weekend), "stronger than before").toBeGreaterThan(alpha(colours.old));
});

test("a board's Timeline keeps a quick range of its own", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.embedded.id}/board/${app.board.id}`);
  const embedded = page.locator('[data-timeline="timeline"]');
  await embedded.locator(".timeline-row").first().waitFor();
  await expect(embedded.locator("[data-timeline-scale]")).toHaveCount(0);
  await expect(embedded.locator('[data-feature="schedule-preview"]')).toHaveCount(0);
  await embedded.locator("[data-timeline-range]").click();
  await panel(page).locator('[data-range-quick="next-30"]').click();
  await expect.poll(async () => (await app.store.snapshot(app.embedded.id)).boards.find((b) => b.id === app.board.id).nodes[0].timelineRange).toEqual({ quick: "next-30" });
  await expect(embedded).toHaveAttribute("data-range-start", today());
  await expect(embedded).toHaveAttribute("data-range-end", shift(today(), 29));
  await expect(embedded.locator("[data-timeline-range]")).toHaveAccessibleName("Timeline range: Next 30 days");
});

// Owner request (F0.21-89, 4 November 2026): Week board and Week shade their weekends the same way.
test("Week board and Week shade their weekend days with Timeline's weekend colour", { tag: "@gate" }, async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  const probe = () => page.evaluate(() => { const p = document.createElement("span"); p.style.background = "var(--weekend-shade)"; document.body.append(p); const value = getComputedStyle(p).backgroundColor; p.remove(); return value; });
  const shade = await probe();
  await page.locator("#calendar-mode").selectOption("board");
  await page.locator(".week-board-cell").first().waitFor();
  const cells = await page.locator(".week-board-cell").evaluateAll((els) => els.map((el) => [new Date(`${el.dataset.calendarDate}T12:00:00Z`).getUTCDay(), getComputedStyle(el).backgroundColor]));
  expect(cells.filter(([day]) => [0, 6].includes(day)).map(([, colour]) => colour)).toEqual([shade, shade]);
  expect(cells.filter(([day]) => ![0, 6].includes(day)).every(([, colour]) => colour !== shade), "weekdays keep their fill").toBe(true);
  const heads = await page.locator(".week-board-day-head").evaluateAll((els) => els.map((el) => [new Date(`${el.dataset.calendarDate}T12:00:00Z`).getUTCDay(), getComputedStyle(el).backgroundImage]));
  for (const [day, image] of heads) expect(image.includes(shade), `heading of day ${day}`).toBe([0, 6].includes(day));
  // Weekend headings keep their contrast on the shade, in both themes.
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    const contrast = (await accessibilityReport(page)).violations.filter((v) => v.id === "color-contrast").flatMap((v) => v.nodes.map((n) => n.target.join(" ")));
    expect(contrast, theme).toEqual([]);
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.locator("#calendar-mode").selectOption("week");
  await page.locator(".calendar-hours-day").first().waitFor();
  const days = await page.locator(".calendar-hours-day").evaluateAll((els) => els.map((el) => [new Date(`${el.dataset.calendarDate}T12:00:00Z`).getUTCDay(), getComputedStyle(el).backgroundColor]));
  expect(days.filter(([day]) => [0, 6].includes(day)).map(([, colour]) => colour)).toEqual([shade, shade]);
});

// Owner request (F0.21-89, 4 November 2026): a Week board card's field box had narrow sides and a
// deep bottom; it now sits 8px in from each side and 6px from the bottom.
test("a Week board card's field box has even sides and a shallower bottom", async ({ page }) => {
  await app.store.createTask(app.project.id, { title: "This week", due: new Date().toLocaleDateString("en-CA") });
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await page.locator("#calendar-mode").selectOption("board");
  const card = page.locator(".week-board-card").first();
  await card.waitFor();
  const gaps = await card.evaluate((el) => {
    // The box you see is drawn at list-chip height, centred in the taller targets (controls.css).
    const fields = el.querySelector(".week-board-fields"), c = el.getBoundingClientRect(), b = fields.getBoundingClientRect(), s = getComputedStyle(el);
    const inset = parseFloat(getComputedStyle(fields, "::after").bottom);
    return { left: b.left - c.left - parseFloat(s.borderLeftWidth), right: c.right - parseFloat(s.borderRightWidth) - b.right, bottom: c.bottom - parseFloat(s.borderBottomWidth) - (b.bottom - inset) };
  });
  expect(Math.abs(gaps.left - 8), JSON.stringify(gaps)).toBeLessThan(1);
  expect(Math.abs(gaps.right - 8), JSON.stringify(gaps)).toBeLessThan(1);
  expect(Math.abs(gaps.bottom - 6), JSON.stringify(gaps)).toBeLessThan(1);
});
