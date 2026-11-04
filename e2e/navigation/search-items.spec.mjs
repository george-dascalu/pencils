// Owner request (F0.21-85, 3 November 2026): in Search, Bookmarks and Commands can be dragged into
// any order within their own list, and items can be removed from Search, with the removed ones
// listed in Settings → You to bring back. The order and removals are kept for the person.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Garden", key: "GA" });
  const docs = [];
  for (const title of ["Planting plan", "Seed list", "Harvest log"]) docs.push(await store.createDocument(project.id, { title }));
  return { project, docs };
});
const saved = async (page) => (await page.request.get(`${app.base}/api/search-items`)).json();
test.beforeEach(async ({ page }) => {
  expect((await page.request.patch(`${app.base}/api/search-items`, { data: { bookmarks: [], commands: [], hidden: [] } })).ok()).toBe(true);
  // Bookmarks list newest first: Harvest log, Seed list, Planting plan.
  for (const doc of app.docs) expect((await page.request.post(`${app.base}/api/bookmarks`, { data: { kind: "doc", project: app.project.id, id: doc.id } })).ok()).toBe(true);
});
const rows = (page, list) => page.locator(`dialog[open] [data-search-list="${list}"] > .search-item`);
const names = (page, list) => rows(page, list).locator(".search-result").evaluateAll((els) => els.map((el) => el.dataset.title || el.textContent.trim()));
async function open(page) {
  await page.locator(".topbar .tabs").getByRole("button", { name: "Search", exact: true }).click();
  await expect(rows(page, "bookmarks")).not.toHaveCount(0);
  await expect(rows(page, "commands")).not.toHaveCount(0);
}
// A drag on a row's handle to the top of another row, with the mouse or, on a phone, a finger.
async function drag(page, from, to, finger) {
  const a = await from.locator("[data-search-drag]").boundingBox(), b = await to.boundingBox();
  const x = a.x + a.width / 2, y = a.y + a.height / 2, end = b.y + 4;
  if (finger) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + ((end - y) * i) / 8, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return;
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, end, { steps: 8 });
  await page.mouse.up();
}

onDevices(["desktop", "phone"], () => test("Bookmarks and Commands are dragged into order within their own list, kept after a reload", async ({ page, device, browserName }) => {
  const finger = device === "phone" && browserName === "chromium";
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row, .empty").first().waitFor();
  await open(page);
  expect(await names(page, "bookmarks")).toEqual(["Harvest log", "Seed list", "Planting plan"]);
  await drag(page, rows(page, "bookmarks").nth(2), rows(page, "bookmarks").nth(0), finger);
  await expect.poll(() => names(page, "bookmarks"), "Planting plan moved to the top").toEqual(["Planting plan", "Harvest log", "Seed list"]);
  const commands = await names(page, "commands");
  await drag(page, rows(page, "commands").nth(2), rows(page, "commands").nth(0), finger);
  const moved = [commands[2], commands[0], commands[1], ...commands.slice(3)];
  await expect.poll(() => names(page, "commands")).toEqual(moved);
  // A command dragged onto the Bookmarks stays a command, at the top of its own list.
  await drag(page, rows(page, "commands").nth(1), rows(page, "bookmarks").nth(0), finger);
  await expect.poll(() => names(page, "bookmarks")).toEqual(["Planting plan", "Harvest log", "Seed list"]);
  await expect.poll(() => names(page, "commands")).toEqual([moved[1], moved[0], ...moved.slice(2)]);
  await expect.poll(async () => (await saved(page)).bookmarks.length, "saved").toBe(3);
  // Typing narrows the lists in the same order.
  await page.locator("#global-search-input").fill("l");
  await expect.poll(() => names(page, "bookmarks")).toEqual(["Planting plan", "Harvest log", "Seed list"]);
  await page.reload();
  await page.locator(".task-row, .empty").first().waitFor();
  await open(page);
  expect(await names(page, "bookmarks"), "kept for the person").toEqual(["Planting plan", "Harvest log", "Seed list"]);
  expect((await names(page, "commands")).slice(0, 3)).toEqual([moved[1], moved[0], moved[2]]);
  // The handle and Remove sit in the row; touch screens show them at 44px, desktop when hovered.
  const tools = rows(page, "bookmarks").first().locator(".icon-button");
  await expect(tools).toHaveCount(2);
  if (device === "phone") for (const box of await Promise.all((await tools.all()).map((t) => t.boundingBox()))) expect(box.height).toBeGreaterThanOrEqual(44);
  else {
    await page.locator("#global-search-input").hover();
    expect(await tools.first().evaluate((el) => getComputedStyle(el).opacity), "hidden until hovered").toBe("0");
    await rows(page, "bookmarks").first().hover();
    await expect.poll(() => tools.first().evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  }
}));

onDevices(["desktop"], () => test("Alt+Up and Alt+Down move the focused row, and arrows still walk the results", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page);
  await rows(page, "bookmarks").nth(1).locator("[data-search-drag]").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => names(page, "bookmarks")).toEqual(["Seed list", "Harvest log", "Planting plan"]);
  await expect(rows(page, "bookmarks").nth(0).locator("[data-search-drag]")).toBeFocused();
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => names(page, "bookmarks")).toEqual(["Harvest log", "Planting plan", "Seed list"]);
  await expect(page.getByRole("status").filter({ hasText: "Moved" }), "screen readers hear where it went").toHaveText("Seed list moved to 3 of 3.");
  await expect.poll(async () => (await saved(page)).bookmarks.length).toBe(3);
  // Up and Down from a row's tools go to the neighbouring results.
  await rows(page, "bookmarks").nth(1).locator("[data-search-remove]").focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows(page, "bookmarks").nth(2).locator(".search-result")).toBeFocused();
  // Up and Down from the field go through the results only, not their tools.
  await page.locator("#global-search-input").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(rows(page, "bookmarks").nth(1).locator(".search-result")).toBeFocused();
}));

onDevices(["desktop", "phone"], () => test("an item removed from Search waits in Settings → You until it is brought back", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page);
  const commands = await names(page, "commands");
  await rows(page, "bookmarks").filter({ hasText: "Seed list" }).getByRole("button", { name: "Remove Seed list from Search" }).click();
  await rows(page, "commands").first().getByRole("button", { name: `Remove ${commands[0]} from Search` }).click();
  await expect.poll(() => names(page, "bookmarks")).toEqual(["Harvest log", "Planting plan"]);
  await expect.poll(() => names(page, "commands")).toEqual(commands.slice(1));
  await expect.poll(async () => (await saved(page)).hidden.length).toBe(2);
  // Typing doesn't bring them back.
  await page.locator("#global-search-input").fill("seed");
  await expect(page.locator("#global-search-results .search-result").first()).toBeVisible();
  await expect(rows(page, "bookmarks")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto(`${app.base}/#project/${app.project.id}/settings/personal`);
  const removed = page.locator(".search-removed");
  await expect(removed.locator("li")).toHaveText([/Seed list/, new RegExp(commands[0])]);
  await removed.getByRole("button", { name: "Bring back Seed list" }).click();
  await expect(removed.locator("li")).toHaveCount(1);
  await removed.getByRole("button", { name: `Bring back ${commands[0]}` }).click();
  await expect(removed).toHaveText("Nothing removed from Search.");
  await expect.poll(async () => (await saved(page)).hidden).toEqual([]);
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page);
  expect(await names(page, "bookmarks")).toEqual(["Harvest log", "Seed list", "Planting plan"]);
  expect(await names(page, "commands")).toEqual(commands);
}));

onDevices(["desktop"], () => test("a change still saving is kept when Search opens again", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await open(page);
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route("**/api/search-items", async (route) => {
    if (route.request().method() === "PATCH") await held;
    await route.continue();
  });
  await rows(page, "bookmarks").nth(2).locator("[data-search-drag]").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await page.keyboard.press("Escape");
  await open(page);
  release();
  await expect.poll(() => names(page, "bookmarks")).toEqual(["Harvest log", "Planting plan", "Seed list"]);
  await rows(page, "bookmarks").filter({ hasText: "Harvest log" }).getByRole("button", { name: "Remove Harvest log from Search" }).click();
  await expect.poll(async () => saved(page)).toEqual({ bookmarks: ["doc:" + app.project.id + ":" + app.docs[2].id, "doc:" + app.project.id + ":" + app.docs[0].id, "doc:" + app.project.id + ":" + app.docs[1].id], commands: [], hidden: ["doc:" + app.project.id + ":" + app.docs[2].id] });
}));
