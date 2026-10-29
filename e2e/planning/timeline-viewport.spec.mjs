// Timeline workspace: the project Timeline fills the component's full height and width,
// scrolls inside itself, lists unplanned tasks as rows that open the shared task editor,
// edits dates with the keyboard and by dragging, schedules unplanned rows by dropping them,
// filters and pages long lists. Part of the cross-browser release gate.
import { test, expect, useApp } from "../fixtures.mjs";

const seedTimeline = async (store, title, extra = 0) => {
  const project = await store.createProject({ title });
  const planned = await store.createTask(project.id, { title: "Planned work", start: "2026-10-19", due: "2026-10-25" });
  const unplanned = await store.createTask(project.id, { title: "Unplanned idea" });
  const another = await store.createTask(project.id, { title: "Another idea" });
  for (let i = 0; i < extra; i++) await store.createTask(project.id, { title: `Unplanned ${i}` });
  return { project, planned, unplanned, another };
};
const app = useApp(async (store) => ({
  layout: await seedTimeline(store, "Timeline workspace"),
  editing: await seedTimeline(store, "Timeline editing"),
  long: await seedTimeline(store, "Long timeline", 200),
}));

const area = (page) => page.locator("#view-content > .task-timeline > .timeline-scroll");
const current = async (project, id) => (await app.store.snapshot(project.id)).tasks.find((t) => t.id === id);
const open = async (page, { project }) => {
  await page.goto(`${app.base}/#project/${project.id}/timeline`);
  await area(page).waitFor();
};
const valueText = (page, id, text) => expect(page.locator(`[data-timeline-task="${id}"]`)).toHaveAttribute("aria-valuetext", text);

// The timeline reaches the bottom of the window, every row spans the sheet, and only the
// timeline scrolls.
async function fits(page) {
  const size = await area(page).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const sheet = el.querySelector(".timeline-sheet");
    const rows = [...el.querySelectorAll(".timeline-row")];
    const style = getComputedStyle(el);
    return {
      bottom: rect.bottom,
      viewport: innerHeight,
      usableBottom: (() => { const bar = document.querySelector(".topbar .tabs"); return bar && getComputedStyle(bar).position === "fixed" ? innerHeight - parseFloat(getComputedStyle(document.querySelector(".main")).paddingBottom) : innerHeight; })(),
      width: el.clientWidth,
      sheet: sheet.offsetWidth,
      rowWidths: rows.map((row) => row.getBoundingClientRect().width),
      pageWidth: document.documentElement.scrollWidth,
      limit: innerWidth,
      pageHeight: document.documentElement.scrollHeight,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
    };
  });
  // On phones the views end at the bottom tab bar (0.19.33), elsewhere at the window bottom.
  expect(size.bottom >= size.usableBottom - 20 && size.bottom <= size.usableBottom, `Timeline reaches the component bottom ${JSON.stringify(size)}`).toBe(true);
  expect(size.sheet >= size.width && size.rowWidths.every((width) => Math.abs(width - size.sheet) <= 1), `Every row fills the sheet and available width ${JSON.stringify(size)}`).toBe(true);
  expect(size.pageWidth <= size.limit && size.pageHeight <= size.viewport + 1, `Scrolling stays inside the timeline ${JSON.stringify(size)}`).toBe(true);
  expect(size.overflowX).toBe("auto");
  expect(size.overflowY).toBe("auto");
  await expect(page.locator(".view-footnote")).toHaveCount(0);
}

test.describe("layout", () => {
  for (const width of [1600, 390]) {
    test.describe(`${width}px`, () => {
      test.use({ viewportSize: { width, height: 844 } });
      test("the timeline fills the component in both themes and unplanned rows open the shared editor", { tag: "@gate" }, async ({ page }) => {
        await open(page, app.layout);
        await expect(area(page).locator(".timeline-row")).toHaveCount(3);
        await expect(area(page).locator(".timeline-unplanned")).toHaveCount(2);
        for (const theme of ["light", "dark"]) {
          await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
          await fits(page);
        }
        await area(page).locator(`[data-unscheduled="${app.layout.unplanned.id}"]`).click();
        await expect(page.locator('#task-form [name="title"]')).toHaveValue("Unplanned idea");
        await page.locator('[data-action="dialog-close"]').click();
        await expect(page.locator("#task-form")).toHaveCount(0);
      });
    });
  }
});

test.describe("editing", () => {
  test.use({ viewportSize: { width: 1600, height: 1000 } });

  test("keyboard and drag edit dates, dropping schedules an unplanned row, and filters keep the layout", { tag: "@gate" }, async ({ page }) => {
    const { project, planned, unplanned, another } = app.editing;
    await open(page, app.editing);
    await page.locator("[data-timeline-scale]").selectOption("day");
    const bar = page.locator(`[data-timeline-task="${planned.id}"]`);
    await bar.focus();
    await page.keyboard.press("Alt+ArrowRight");
    await valueText(page, planned.id, "2026-10-20 to 2026-10-26");
    await expect.poll(async () => (await current(project, planned.id)).start).toBe("2026-10-20");
    const end = await bar.locator('[data-date-end="due"]').boundingBox();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2 + 84, end.y + end.height / 2, { steps: 4 });
    await page.mouse.up();
    await valueText(page, planned.id, "2026-10-20 to 2026-10-28");
    await expect.poll(async () => (await current(project, planned.id)).due).toBe("2026-10-28");
    const source = area(page).locator(`[data-unscheduled="${unplanned.id}"]`);
    await source.dragTo(area(page).locator(".timeline-track").first(), { targetPosition: { x: 100, y: 20 } });
    await page.locator(`[data-timeline-task="${unplanned.id}"]`).waitFor();
    await expect.poll(async () => (await current(project, unplanned.id)).start).toBe("2026-10-21");
    expect((await current(project, another.id)).start ?? null).toBeNull();
    await fits(page);
    await page.locator("#search").fill("Nothing matches here");
    await area(page).locator(".empty").waitFor();
    await fits(page);
    await area(page).getByRole("button", { name: "Clear filters" }).click();
    await area(page).locator(".timeline-row").first().waitFor();
  });

  test("a long timeline scrolls inside the component and pages to the next tasks", { tag: "@gate" }, async ({ page }) => {
    await open(page, app.long);
    await expect(area(page).locator(".timeline-row")).toHaveCount(200);
    await area(page).evaluate((el) => (el.scrollTop = 400));
    expect(await area(page).evaluate((el) => el.scrollTop > 0), "Long timelines scroll inside the component").toBe(true);
    await page.getByRole("button", { name: "Next tasks", exact: true }).click();
    await expect(area(page).locator(".timeline-row")).toHaveCount(3);
    await expect(area(page).locator(".timeline-unplanned")).toHaveCount(3);
    await fits(page);
  });
});
