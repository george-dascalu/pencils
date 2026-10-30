// Owner request, 30 October 2026: people add their own buttons to the bottom bar (phones and iPad),
// between the views and Search: commands, and bookmarked cards, documents, boards and views. They
// add and order them in Settings → You, or in place with a long press on the bar, and the bar
// scrolls sideways when they don't fit. Desktop has no bottom bar and shows none of them.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Bar lab", key: "BL" });
  const doc = await store.createDocument(project.id, { title: "Field guide" });
  await store.createTask(project.id, { title: "First card" });
  return { project, doc };
});
const bar = (page) => page.locator(".topbar .tabs");
const buttons = (page) => bar(page).locator(".bar-button");
const labels = (page) => buttons(page).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
async function reset(page, items = []) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  expect((await page.request.patch(`${app.base}/api/bar`, { data: { items } })).ok()).toBe(true);
  await page.reload();
  await page.locator(".task-row").first().waitFor();
}

onDevices(["phone", "ipad"], () => test("Settings → You adds commands and bookmarks to the bottom bar, between the views and Search", async ({ page, device }) => {
  await reset(page);
  expect((await page.request.post(`${app.base}/api/bookmarks`, { data: { kind: "doc", project: app.project.id, id: app.doc.id } })).ok()).toBe(true);
  await page.goto(`${app.base}/#project/${app.project.id}/settings/personal`);
  const editor = page.locator(".bar-editor").first();
  await editor.locator("[data-bar-add=command]").selectOption({ label: "New card" });
  await expect(editor.locator(".bar-editor-item")).toHaveCount(1);
  await editor.locator("[data-bar-add=item]").selectOption({ label: "Field guide" });
  await expect(editor.locator(".bar-editor-item")).toHaveText([/New card/, /Field guide/]);
  await editor.getByRole("button", { name: "Move Field guide up" }).click();
  await expect(editor.locator(".bar-editor-item")).toHaveText([/Field guide/, /New card/]);
  await expect.poll(() => labels(page), `${device}: the bar follows`).toEqual(["Field guide", "New card"]);
  // Between the views and Search.
  const order = await bar(page).evaluate((nav) => [...nav.querySelectorAll('.tab[data-view="board"], .bar-button, .tab-search')].map((el) => el.getAttribute("aria-label")));
  expect(order).toEqual(["Boards", "Field guide", "New card", "Search"]);
  // They work like the commands and results in search, and stay after a reload (saved for the person).
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  await expect.poll(() => labels(page)).toEqual(["Field guide", "New card"]);
  await buttons(page).filter({ hasText: "" }).nth(1).tap();
  await expect(page.locator("#task-form"), `${device}: New card opens a new card`).toBeVisible();
  await page.keyboard.press("Escape");
  await buttons(page).first().tap();
  await expect(page).toHaveURL(new RegExp(`/documents/${app.doc.id}$`));
}));

onDevices(["phone"], () => test("a long press on the bottom bar edits it in place, and the bar scrolls sideways when full", async ({ page }) => {
  const commands = ["new-task", "today", "quick-capture", "view-list", "view-kanban", "view-calendar"];
  await reset(page, commands.map((id) => ({ type: "command", id })));
  await expect(buttons(page)).toHaveCount(6);
  const scroller = bar(page).locator(".tabs-scroll");
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth), "it scrolls sideways").toBe(true);
  await expect(bar(page).locator(".tab-search"), "Search stays in place at the end").toBeInViewport({ ratio: 1 });
  await scroller.evaluate((el) => el.scrollTo(el.scrollWidth, 0));
  await expect(buttons(page).last()).toBeInViewport({ ratio: 1 });
  await expect(bar(page).locator(".tab-search")).toBeInViewport({ ratio: 1 });
  // A long press opens the editor above the bar, without following the button pressed.
  const url = page.url();
  const touch = await page.context().newCDPSession(page);
  const box = await buttons(page).first().boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  const tray = page.locator(".bar-tray[data-open]");
  await expect(tray, "the long press opens the editor").toBeVisible();
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator("#task-form")).toHaveCount(0);
  expect(page.url()).toBe(url);
  await tray.getByRole("button", { name: "Remove New card" }).tap();
  await expect(buttons(page)).toHaveCount(5);
  await expect.poll(async () => (await (await page.request.get(`${app.base}/api/bar`)).json()).items.length).toBe(5);
  await page.keyboard.press("Escape");
  await expect(tray).toHaveCount(0);
}));

onDevices(["desktop"], () => test("desktop shows no bottom-bar buttons in the top bar", async ({ page }) => {
  await reset(page, [{ type: "command", id: "new-task" }]);
  await expect(buttons(page)).toHaveCount(1);
  await expect(buttons(page)).toBeHidden();
}));
