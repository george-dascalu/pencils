// The Table fills the space below the header at every width: the scroll area spans the
// component, its scrollbars sit at the bottom, the page itself
// never scrolls, few rows or columns leave blank space instead of stretching, headers
// stay put while rows scroll, and Back restores the scroll position. Both themes.
// Desktop tests belong to the cross-browser release gate.
import { test, expect, useApp } from "../fixtures.mjs";
import { selectProjectView } from "../helpers/menu-controls.mjs";

const gate = { tag: "@gate" };
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Table viewport", default_view: "table" });
  await store.createTask(project.id, { title: "First row" });
  await store.createTask(project.id, { title: "Second row" });
  // Enough compact rows to scroll 600px even on a tall desktop viewport.
  const long = await store.createProject({ title: "Table overflow", default_view: "table" });
  await store.createTask(long.id, { title: "First row" });
  await store.createTask(long.id, { title: "Second row" });
  for (let i = 0; i < 60; i++) await store.createTask(long.id, { title: `Overflow row ${i}` });
  return { project, long };
});
test.use({ viewportSize: { width: 1600, height: 1000 } });

const area = (page) => page.locator("#view-content > .table-scroll");
async function fits(page) {
  await expect(page.locator(".table-result-summary,.view-footnote")).toHaveCount(0);
  // Responsive layout changes can replace the grid between locator resolution
  // and evaluation. Read the current viewport and its parent atomically.
  const actual = await page.evaluate(() => {
    const el = document.querySelector("#view-content > .table-scroll");
    const r = el.getBoundingClientRect(), parent = el.parentElement.getBoundingClientRect(), style = getComputedStyle(el), ps = getComputedStyle(el.parentElement);
    return {
      width: r.width,
      height: r.height,
      bottom: r.bottom,
      parentBottom: parent.bottom,
      availableWidth: parent.width - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight),
      x: style.overflowX,
      y: style.overflowY,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });
  const facts = JSON.stringify(actual);
  expect(Math.abs(actual.width - actual.availableWidth), `Scroll area spans component width ${facts}`).toBeLessThan(2);
  expect(Math.abs(actual.parentBottom - actual.viewportHeight), `Component fills remaining viewport height ${facts}`).toBeLessThan(2);
  // Since 0.19.31 the Table has no "+ New card" row below it (cards are created from New),
  // so the scroll area reaches the component's bottom padding.
  expect(actual.parentBottom - actual.bottom, `Scrollbar stays at the bottom ${facts}`).toBeLessThan(40);
  expect(actual.documentWidth, `No horizontal page scrolling ${facts}`).toBeLessThanOrEqual(actual.viewportWidth);
  expect(actual.documentHeight, `No vertical page scrolling ${facts}`).toBeLessThanOrEqual(actual.viewportHeight);
  expect(actual.x).toBe("auto");
  expect(actual.y).toBe("auto");
}
async function open(page, project = app.project) {
  await page.goto(`${app.base}/#project/${project.id}/table`);
  await area(page).waitFor();
}

test("the table fills the window at every width in both themes, leaving blank space below few rows", gate, async ({ page }) => {
  await open(page);
  for (const width of [1600, 1180, 834, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await fits(page);
      const body = await page.locator(".spreadsheet tbody").boundingBox();
      const box = await area(page).boundingBox();
      expect(box.height, "Few rows leave blank space inside the table viewport").toBeGreaterThan(body.height + 120);
    }
  }
});

test("a single narrow column keeps its own width, and an empty search still fills the window", gate, async ({ page }) => {
  await open(page);
  await page.locator("[data-board-menu=table-columns] > summary").click();
  const keys = await page.locator("[data-column-visible]").evaluateAll((els) => els.map((el) => el.dataset.columnVisible));
  for (const key of keys) if (key !== "title") await page.locator(`[data-column-visible="${key}"]`).uncheck();
  await page.locator("[data-feature=columns-close]").click();
  await fits(page);
  expect(await page.locator(".spreadsheet th[data-column-key=title]").evaluate((el) => Math.round(el.getBoundingClientRect().width)), "Narrow data keeps its own column width").toBe(300);
  expect(await area(page).evaluate((el) => el.scrollWidth === el.clientWidth), "Few columns leave space rather than stretching").toBe(true);
  await page.locator("#search").fill("No matching rows");
  await page.locator(".table-no-results").waitFor();
  await fits(page);
});

test("with many rows the headers stay put, and Back restores the scroll position", gate, async ({ page }) => {
  await open(page, app.long);
  await page.locator("[data-table-task]").nth(61).waitFor();
  await fits(page);
  const head = page.locator(".spreadsheet thead th").first();
  const before = await head.boundingBox();
  await area(page).evaluate((el) => {
    el.scrollTop = 600;
    el.scrollLeft = 500;
  });
  await page.waitForFunction(() => history.state.scroll?.tableY >= 600);
  const after = await head.boundingBox();
  expect(Math.abs(after.y - before.y), "Column headers stay visible during vertical scrolling").toBeLessThan(2);
  await selectProjectView(page, "kanban");
  await page.goBack();
  await page.waitForFunction(() => document.querySelector(".table-scroll")?.scrollTop >= 600);
  expect(await area(page).evaluate((el) => el.scrollLeft), "Back restores table scroll position").toBeGreaterThanOrEqual(500);
  await page.locator("[data-table-task]").last().scrollIntoViewIfNeeded();
  await fits(page);
});
