// In-place visual editing on the board: editors open over the object without moving, resizing or
// recolouring it and keep its font and text position; linked task titles and notes edit as one;
// resizing shows live dimensions that cancel cleanly, Shift keeps one axis, and objects stop at a
// minimum size with bounded overflow; frame titles, link URLs (http only), dark mode, empty new
// stickies with placeholders, reload, and floating tools on a narrow screen.
// The steps edit the same objects in turn (later searches use earlier edits), so the file runs
// in order. The board never reaches the internet.
import { test, expect, useApp } from "../fixtures.mjs";
import { openBoardSearch, selectProjectView } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board lab" });
  const a = await store.createTask(project.id, {
    title: "Write specification",
    assignee: "Alice",
    due: "2020-01-01",
    body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n",
  });
  const b = await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" });
  let board = (await store.snapshot(project.id)).boards[0];
  board = await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "note", type: "sticky", text: "First idea", x: 80, y: 150, w: 240, h: 200, color: "#f5e7a2" },
      { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
      { id: "frame", type: "frame", text: "A clear frame title", x: 100, y: 600, w: 480, h: 260 },
      { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
      { id: "link", type: "link", url: "https://example.com", text: "https://example.com", x: 750, y: 600, w: 280, h: 160 },
      { id: "far", type: "text", text: "A distant idea", x: 6000, y: 3000, w: 300, h: 150 },
    ],
    edges: [],
  });
  return { project, a, board };
});

test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1600, height: 1100 } });

const snap = () => app.store.snapshot(app.project.id);
const current = async () => (await snap()).boards.find((x) => x.id === app.board.id);
const nodeOf = async (id) => (await current()).nodes.find((n) => n.id === id);
const poll = (fn, message) => expect.poll(fn, { message, timeout: 12000 });
const rich = (page) => page.locator("#canvas-inline-form .inline-rich");

async function enter(page) {
  await page.goto(`${app.base}/#project/${app.project.id}`);
  await selectProjectView(page, "board");
  await page.locator("#canvas").waitFor();
}
async function saved(page) {
  await expect(page.locator("#board-save")).toHaveText("Saved automatically", { timeout: 12000 });
}
async function find(page, id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`#canvas-find-results [data-pro=find-result][data-id="${id}"]`).click();
  await expect(page.locator(`[data-node="${id}"]`)).toBeVisible();
}
async function textBounds(locator) {
  return locator.evaluate((el) => {
    const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange();
    range.selectNodeContents(text);
    const { x, y } = range.getBoundingClientRect();
    return { x, y };
  });
}
// Drag the south-east handle, checking the live dimensions badge on the way.
async function resize(page, target, dx, dy, shift = false) {
  await target.click();
  const r = await target.locator('.resize-handle[data-resize-corner="se"]').boundingBox();
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  const badge = page.locator(".resize-dimensions");
  await expect(badge).toBeVisible();
  await page.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy, { steps: 8 });
  const dimensions = await target.evaluate((el) => `${Math.round(parseFloat(el.style.width))} × ${Math.round(parseFloat(el.style.height))}`);
  await expect(badge).toHaveText(dimensions);
  await expect(badge).toHaveCSS("font-size", "12px");
  const box = await badge.boundingBox(), canvas = await page.locator("#canvas").boundingBox();
  expect(
    box.x >= canvas.x && box.y >= canvas.y && box.x + box.width <= canvas.x + canvas.width && box.y + box.height <= canvas.y + canvas.height,
    "the dimensions stay inside the board",
  ).toBe(true);
  await page.mouse.up();
  await expect(badge).toHaveCount(0);
  if (shift) await page.keyboard.up("Shift");
  await saved(page);
}

let external;
test.beforeEach(({ page }) => {
  external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
});
test.afterEach(() => expect(external, "no internet requests").toEqual([]));

test("editing a sticky in place keeps its size, colour, font and text position", async ({ page }) => {
  await enter(page);
  await find(page, "note", "First idea");
  const node = page.locator('[data-node="note"]');
  const before = await node.boundingBox();
  const color = await node.evaluate((el) => getComputedStyle(el).backgroundColor);
  const fontBefore = await node.locator(".canvas-markdown").evaluate((el) => getComputedStyle(el).font);
  const textBefore = await textBounds(node.locator(".canvas-markdown"));
  await node.dblclick();
  await rich(page).waitFor();
  expect(await node.boundingBox(), "Editing does not move or resize the note").toEqual(before);
  await expect(node).toHaveCSS("background-color", color);
  await expect(rich(page)).toHaveCSS("font", fontBefore);
  expect(await rich(page).boundingBox(), "The editor fills the note").toEqual(before);
  const textEditing = await textBounds(rich(page));
  expect(Math.abs(textEditing.x - textBefore.x) < 1 && Math.abs(textEditing.y - textBefore.y) < 1, "Text stays in the same location").toBe(true);
  await expect(page.locator("#canvas-inline-form textarea")).toBeHidden();
  await expect(node.locator(".inline-floating-tools")).toHaveCount(0);
  await rich(page).fill("The edited idea");
  await page.keyboard.press("Control+Enter");
  await poll(async () => (await nodeOf("note")).text).toBe("The edited idea");
});

test("a linked task's title and notes edit in place together", async ({ page }) => {
  await enter(page);
  await find(page, "task-a", "Write specification");
  await page.locator('[data-node="task-a"] .task-title').dblclick();
  await page.getByRole("textbox", { name: "Task title", exact: true }).fill("A clearer task title");
  await rich(page).fill("The task notes");
  await page.keyboard.press("Control+Enter");
  await poll(async () => (await snap()).tasks.find((t) => t.id === app.a.id).title).toBe("A clearer task title");
  expect((await snap()).tasks.find((t) => t.id === app.a.id).body).toMatch(/The task notes/);
});

test("resizing shows live dimensions, cancels with Escape, keeps one axis with Shift and stops at a minimum", async ({ page }) => {
  await enter(page);
  await find(page, "note", "The edited idea");
  const node = page.locator('[data-node="note"]');
  let old = await nodeOf("note");
  const cancelHandle = await node.locator('.resize-handle[data-resize-corner="se"]').boundingBox();
  await page.mouse.move(cancelHandle.x + cancelHandle.width / 2, cancelHandle.y + cancelHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(cancelHandle.x + 40, cancelHandle.y + 40, { steps: 4 });
  await expect(page.locator(".resize-dimensions")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".resize-dimensions")).toHaveCount(0);
  expect(await nodeOf("note")).toEqual(old);
  await resize(page, node, 100, 15, true);
  let next = await nodeOf("note");
  expect(next.w).toBeGreaterThan(old.w);
  expect(next.h).toBe(old.h);
  old = next;
  await resize(page, node, 12, 100, true);
  next = await nodeOf("note");
  expect(next.h).toBeGreaterThan(old.h);
  expect(next.w).toBe(old.w);
  await resize(page, node, -600, -400);
  next = await nodeOf("note");
  expect(next.w).toBe(120);
  expect(next.h).toBe(100);
});

test("long text in a small sticky overflows inside the card", async ({ page }) => {
  await enter(page);
  await find(page, "note", "The edited idea");
  const node = page.locator('[data-node="note"]');
  await node.dblclick();
  await rich(page).fill("A long piece of text ".repeat(40));
  await page.keyboard.press("Control+Enter");
  await saved(page);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-node="note"] .board-node-content, [data-node="note"] .canvas-markdown')].some(
      (el) => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2,
    ),
  );
  const content = await node.locator(".board-node-content").boundingBox(), card = await node.boundingBox();
  expect(
    content.x >= card.x && content.y >= card.y && content.x + content.width <= card.x + card.width + 1 && content.y + content.height <= card.y + card.height + 1,
    "the content stays inside the card",
  ).toBe(true);
});

test("a task card stops at its minimum size and hides its overflow", async ({ page }) => {
  await enter(page);
  await find(page, "task-a", "A clearer task title");
  const taskNode = page.locator('[data-node="task-a"]');
  await resize(page, taskNode, -500, -500);
  const smallTask = await nodeOf("task-a");
  expect(smallTask.w).toBe(220);
  expect(smallTask.h).toBe(180);
  await expect(taskNode.locator(".board-node-content")).toHaveCSS("overflow", "hidden");
});

test("a frame title edits in place at the frame's size and font, and stays readable when collapsed", async ({ page }) => {
  await enter(page);
  await find(page, "frame", "A clear frame title");
  const frame = page.locator('[data-node="frame"]');
  const frameBox = await frame.boundingBox();
  const frameFont = await frame.locator(".frame-title").evaluate((el) => getComputedStyle(el).font);
  await frame.locator(".frame-title").dblclick();
  await rich(page).waitFor();
  expect(await frame.boundingBox()).toEqual(frameBox);
  await expect(rich(page)).toHaveCSS("font", frameFont);
  await rich(page).fill("Updated frame title");
  await page.keyboard.press("Control+Enter");
  await poll(async () => (await nodeOf("frame")).text).toBe("Updated frame title");
  await frame.locator("[data-pro=collapse]").click();
  expect((await frame.locator(".frame-title").boundingBox()).height).toBeGreaterThan(18);
});

test("a link card refuses a script URL and saves an http one", async ({ page }) => {
  await enter(page);
  await find(page, "link", "https://example.com");
  await page.locator('[data-node="link"]').dblclick({ position: { x: 15, y: 15 } });
  await rich(page).fill("javascript:alert(1)");
  await page.locator('[data-pro="search-toggle"]').click();
  await page.locator(".inline-error").filter({ hasText: "Use an http" }).waitFor();
  expect((await nodeOf("link")).url).toBe("https://example.com");
  await rich(page).fill("https://example.com/updated");
  await page.keyboard.press("Control+Enter");
  await poll(async () => (await nodeOf("link")).url).toBe("https://example.com/updated");
});

test("in dark mode a sticky keeps its colour while editing", async ({ page }) => {
  await enter(page);
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await find(page, "note", "A long piece of text");
  const node = page.locator('[data-node="note"]');
  const darkColor = await node.evaluate((el) => getComputedStyle(el).backgroundColor);
  await node.dblclick();
  await rich(page).waitFor();
  await expect(node).toHaveCSS("background-color", darkColor);
  await page.keyboard.press("Escape");
});

test("a new sticky starts empty and keeps a placeholder when left empty", async ({ page }) => {
  await enter(page);
  // Centre the camera on the small note, leaving empty board to the right for the new sticky.
  await find(page, "note", "A long piece of text");
  await page.keyboard.press("Escape");
  await page.locator('.board-tools [data-tool="sticky"]').click();
  await page.locator("#canvas").click({ position: { x: 800, y: 200 } });
  await expect(rich(page)).toHaveText("");
  await expect(rich(page)).toHaveAttribute("data-empty", "true");
  await page.keyboard.press("Escape");
  await poll(async () => !!(await current()).nodes.find((n) => n.type === "sticky" && !n.text)).toBe(true);
  const empty = (await current()).nodes.find((n) => n.type === "sticky" && !n.text);
  expect(await page.locator(`[data-node="${empty.id}"] .is-placeholder`).count()).toBeGreaterThan(0);
  await saved(page);
});

test("edits survive reload and floating text tools fit a narrow screen", async ({ page }) => {
  await enter(page);
  await find(page, "frame", "Updated frame title");
  const frame = page.locator('[data-node="frame"]');
  await expect(frame.locator(".frame-title")).toHaveText("Updated frame title");
  await page.setViewportSize({ width: 480, height: 800 });
  await frame.locator(".frame-title").dblclick();
  const tools = await page.locator(".inline-floating-tools").boundingBox();
  expect(tools.x).toBeGreaterThanOrEqual(0);
  expect(tools.x + tools.width).toBeLessThanOrEqual(481);
  await page.keyboard.press("Escape");
});
