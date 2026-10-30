// Kanban fills the window: every column (even an empty one) runs the full height, the
// horizontal scrollbar sits at the component's bottom, the page never scrolls, cards
// scroll inside their own column under a fixed status header, Back restores each
// column's position, cards open by click or tap, drag and drop saves the status, and a
// drag held near a column's bottom auto-scrolls that column only. Desktop, phone width
// and both themes. Desktop tests belong to the cross-browser release gate.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { selectProjectView } from "../helpers/menu-controls.mjs";

const gate = { tag: "@gate" };
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Kanban viewport" });
  const first = await store.createTask(project.id, { title: "First card", status: "todo" });
  await store.createTask(project.id, { title: "Second card", status: "backlog" });
  // A board whose To do column overflows, with the card to drag waiting in Done.
  const long = await store.createProject({ title: "Kanban overflow" });
  const done = await store.createTask(long.id, { title: "First card", status: "done" });
  await store.createTask(long.id, { title: "Second card", status: "backlog" });
  for (let i = 0; i < 30; i++) await store.createTask(long.id, { title: `Overflow ${i}`, status: "todo" });
  return { project, first, long, done };
});
test.use({ viewportSize: { width: 1600, height: 1000 } });

const board = (page) => page.locator("#view-content > .kanban");
const column = (page, status) => page.locator(`.kanban-column[data-drop-status="${status}"]`);
const status = async (project, id) => (await app.store.snapshot(project.id)).tasks.find((t) => t.id === id).status;
async function open(page, project = app.project) {
  await page.goto(`${app.base}/#project/${project.id}/kanban`);
  await board(page).waitFor();
}
async function saved(page, action, id) {
  const response = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().endsWith(`/tasks/${id}`));
  await action();
  expect((await response).status()).toBe(200);
}
async function fits(page) {
  const actual = await board(page).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const parent = el.parentElement.getBoundingClientRect();
    const style = getComputedStyle(el.parentElement);
    return {
      width: rect.width,
      availableWidth: parent.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      bottom: rect.bottom,
      parentBottom: parent.bottom,
      height: el.clientHeight,
      columns: [...el.children].map((c) => c.getBoundingClientRect().height),
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      usableBottom: (() => { const bar = document.querySelector(".topbar .tabs"); return bar && getComputedStyle(bar).position === "fixed" ? innerHeight - parseFloat(getComputedStyle(document.querySelector(".main")).paddingBottom) : innerHeight; })(),
    };
  });
  const facts = JSON.stringify(actual);
  expect(Math.abs(actual.width - actual.availableWidth), `Kanban fills component width ${facts}`).toBeLessThan(2);
  // On phones the views end at the bottom tab bar (0.19.33), elsewhere at the window bottom.
  expect(Math.abs(actual.parentBottom - actual.usableBottom), `Component fills remaining viewport ${facts}`).toBeLessThan(2);
  expect(actual.parentBottom - actual.bottom, `Horizontal scrollbar sits at the component bottom ${facts}`).toBeLessThan(20);
  expect(actual.columns.every((h) => Math.abs(h - actual.height) < 2), `Every column fills the viewport, even empty columns ${facts}`).toBe(true);
  await expect(page.locator(".view-footnote")).toHaveCount(0);
  expect(actual.documentWidth, "No horizontal page overflow").toBeLessThanOrEqual(actual.viewportWidth);
  expect(actual.documentHeight, "Cards scroll inside columns, not the page").toBeLessThanOrEqual(actual.viewportHeight + 1);
}

test("Kanban fills the window at desktop and phone width in both themes, even with no matching cards", gate, async ({ page }) => {
  await open(page);
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await fits(page);
    }
    await page.locator("#search").fill("No matching cards");
    await page.waitForFunction(() => !document.querySelector(".kanban-card"));
    await fits(page);
    await page.locator("#search").fill("");
    await page.locator(".kanban-card").first().waitFor();
  }
});

test("the final column and its add action remain reachable on a narrow screen", gate, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await open(page);
  await column(page, "done").locator(".column-header button").click();
  await page.locator("#task-form").waitFor();
  await expect(page.locator("#task-form [name=status]")).toHaveValue("done");
  await page.locator('[data-action="dialog-close"]').click();
});

test("clicking a card opens it, and dragging it to Done saves the status", gate, async ({ page }) => {
  await open(page);
  await board(page).evaluate((el) => (el.scrollLeft = 0));
  await page.locator(`[data-drag-task="${app.first.id}"] .card-top`).click();
  await page.locator("#task-form").waitFor();
  await expect(page.locator("#task-form [name=title]")).toHaveValue("First card");
  await page.locator('[data-action="dialog-close"]').click();
  await page.locator("#task-form").waitFor({ state: "detached" });
  await saved(page, () => page.locator(`[data-drag-task="${app.first.id}"]`).dragTo(column(page, "done")), app.first.id);
  await page.waitForFunction((id) => document.querySelector(`[data-drop-status="done"] [data-drag-task="${id}"]`), app.first.id);
  expect(await status(app.project, app.first.id)).toBe("done");
});

test("columns scroll on their own under a fixed status header, and Back restores the position", gate, async ({ page }) => {
  await open(page, app.long);
  await page.waitForFunction(() => history.state?.kind === "pencils-navigation-v1");
  await column(page, "todo").locator(".kanban-card").nth(29).waitFor();
  await fits(page);
  const head = column(page, "todo").locator(".column-header");
  const before = await head.boundingBox();
  await column(page, "todo").evaluate((el) => (el.scrollTop = 600));
  const after = await head.boundingBox();
  expect(Math.abs(before.y - after.y), "Status header stays fixed while its column scrolls").toBeLessThan(2);
  expect(await column(page, "done").evaluate((el) => el.scrollTop), "Other columns do not scroll").toBe(0);
  await page.waitForFunction(() => history.state?.scroll?.kanbanColumns?.todo >= 600);
  await selectProjectView(page, "overview");
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('[data-drop-status="todo"]')?.scrollTop >= 600);
});

test("a drag held near a long column's bottom scrolls that column, not the page", gate, async ({ page }) => {
  await open(page, app.long);
  await column(page, "todo").locator(".kanban-card").nth(29).waitFor();
  await column(page, "todo").evaluate((el) => (el.scrollTop = 0));
  const card = await page.locator(`[data-drag-task="${app.done.id}"]`).boundingBox();
  const target = await column(page, "todo").boundingBox();
  await page.mouse.move(card.x + 30, card.y + 20);
  await page.mouse.down();
  await page.mouse.move(card.x + 40, card.y + 30, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height - 15, { steps: 12 });
  await page.waitForFunction(() => document.querySelector('[data-drop-status="todo"]').scrollTop > 400);
  expect(await page.evaluate(() => scrollY), "Drag scrolling leaves the page in place").toBe(0);
  await saved(page, () => page.mouse.up(), app.done.id);
  await page.waitForFunction((id) => document.querySelector(`[data-drop-status="todo"] [data-drag-task="${id}"]`), app.done.id);
  expect(await status(app.long, app.done.id)).toBe("todo");
  await fits(page);
  await page.setViewportSize({ width: 390, height: 700 });
  await column(page, "todo").locator("[data-drag-task]").last().scrollIntoViewIfNeeded();
  await fits(page);
});

onDevices(["ipad"], () => {
  test.use({ viewportSize: null });
  test("tapping the lower half of a card opens it", async ({ page }) => {
    await open(page);
    await page.locator(`[data-drag-task="${app.first.id}"] .card-bottom`).tap();
    await page.locator("#task-form").waitFor();
    await expect(page.locator("#task-form [name=title]")).toHaveValue("First card");
    await page.locator('[data-action="dialog-close"]').click();
  });
});
