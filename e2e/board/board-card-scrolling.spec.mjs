// Board card scrolling: an expanded task card's long description scrolls with the wheel, even at
// its end, and with its native scrollbar, without panning or zooming the board or moving the
// card; Ctrl+wheel still zooms; the title keeps a gap from the card identity and the card shows
// no overflow dots.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Card scrolling" });
  const task = await store.createTask(project.id, {
    title: "Collect inspiration and early ideas",
    body: "# Project notes\n\n" + Array.from({ length: 30 }, (_, i) => `## Section ${i + 1}\n\nA paragraph with **formatted text**.\n\n- First idea\n- Another idea`).join("\n\n"),
  });
  const b = (await store.snapshot(project.id)).boards[0];
  const board = await store.updateBoard(project.id, b.id, {
    revision: b.revision,
    nodes: [{ id: "card", type: "task", task: task.id, x: 150, y: 130, w: 420, h: 360, taskCollapsed: false }],
    edges: [],
  });
  return { project, board };
});
// Headless Chromium normally hides scrollbars, including their hit targets.
test.use({ launchOptions: { args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"] } });

const description = (page) => page.locator("[data-node=card] .task-card-description");
const camera = (page) => page.locator("#canvas-world").getAttribute("style");
async function open(page) {
  await page.addInitScript((id) => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 0, y: 0, z: 1 })), app.board.id);
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await description(page).waitFor();
}

test("the card title keeps a gap from its identity and the card shows no overflow dots", async ({ page }) => {
  await open(page);
  const card = page.locator("[data-node=card]");
  expect(await card.evaluate((el) => getComputedStyle(el, "::after").content)).toBe("none");
  const identity = await card.locator(".canvas-task-identity").boundingBox(), title = await card.locator(".task-title").boundingBox();
  expect(title.x - identity.x - identity.width, "identity and title have a visible gap").toBeGreaterThanOrEqual(11);
});

test("the description scrolls with the wheel and its scrollbar without moving the board or the card", async ({ page, browserName }) => {
  await open(page);
  const before = await camera(page);
  await description(page).hover();
  await page.mouse.wheel(0, 180);
  await page.waitForFunction(() => document.querySelector(".task-card-description").scrollTop > 0);
  expect(await camera(page)).toBe(before);
  await description(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.mouse.wheel(0, 180);
  // Nothing changes when the wheel reaches the end, so give the event time to (not) move the board.
  await page.waitForTimeout(150);
  expect(await camera(page), "at the end of a card, scrolling still does not zoom").toBe(before);
  await description(page).evaluate((el) => (el.scrollTop = 0));
  await page.waitForFunction(() => document.querySelector(".task-card-description").scrollTop === 0);
  const hiddenNativeScrollbars = browserName === "firefox" && (await description(page).evaluate((el) => getComputedStyle(el).scrollbarWidth === "none"));
  // Headless Firefox hides native scrollbars, including in plain scroll areas; Chromium covers thumb dragging.
  if (!hiddenNativeScrollbars) {
    const bounds = await description(page).boundingBox();
    await page.mouse.move(bounds.x + bounds.width - 4, bounds.y + 15);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width - 4, bounds.y + 95, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector(".task-card-description").scrollTop > 0);
  }
  expect((await app.store.snapshot(app.project.id)).boards[0].nodes, "scrollbar drag does not move the card").toEqual(app.board.nodes);
});

test("Ctrl+wheel over a card still zooms the board", async ({ page }) => {
  await open(page);
  const before = await camera(page);
  await description(page).hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Control");
  await page.waitForFunction((previous) => document.querySelector("#canvas-world").getAttribute("style") !== previous, before);
});
