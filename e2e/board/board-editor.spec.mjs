// Board editor: the selected card's toolbar sits beside the card, in-place rich text keeps the
// card's bounds and round-trips Markdown (wiki links, links, emphasis, headings), its menus stay
// on narrow screens, bullet lists are a direct toolbar action in notes and text objects, and the
// board's expanded window and full screen exit cleanly. No request leaves the app.
import { test, expect, useApp } from "../fixtures.mjs";
import { openBoardSearch } from "../helpers/menu-controls.mjs";

const nodes = (a, b) => [
  { id: "note", type: "sticky", text: "First idea", x: 80, y: 150, w: 240, h: 200, color: "#f5e7a2" },
  { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
  { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
  { id: "far", type: "text", text: "A distant idea", x: 6000, y: 3000, w: 300, h: 150 },
];
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board lab" });
  const a = await store.createTask(project.id, { title: "Write specification", assignee: "Alice", due: "2020-01-01", body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n" });
  const b = await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" });
  const board = (await store.snapshot(project.id)).boards[0];
  return { project, board, initial: nodes(a, b) };
});
// The checks measure the expanded board against this exact window.
test.use({ viewportSize: { width: 1600, height: 1100 } });

const current = async () => (await app.store.snapshot(app.project.id)).boards.find((b) => b.id === app.board.id);
const stored = async (id) => (await current()).nodes.find((n) => n.id === id).text;
const pro = (page, name) => page.locator(`[data-pro="${name}"]`).first();
const rich = (page) => page.getByRole("textbox", { name: "Rich text editor", exact: true });
const source = (page) => page.locator("#canvas-inline-form textarea[name=text]");
const saved = (page) => expect(page.locator("#board-save")).toHaveText(/All (canvas )?changes saved|Saved automatically/);
const within = (box, width) => box && box.x >= 0 && box.x + box.width <= width;

async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
}
// Search jumps to the object and selects it.
async function find(page, id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro=find-result][data-id="${id}"]`).click();
  await expect(page.locator("#canvas-search-panel")).toBeHidden();
  await expect(page.locator(`[data-node="${id}"]`)).toHaveClass(/selected/);
}
const selectContents = (locator) => locator.evaluate((el) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  el.closest("[contenteditable]").focus();
});

let external;
test.beforeEach(async ({ page }) => {
  const board = await current();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: app.initial, edges: [] });
  external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
});
test.afterEach(() => expect(external, "no requests leave the app").toEqual([]));

test("the selected card's toolbar sits beside the card, clear of presence, with no duplicate", async ({ page }) => {
  await openBoard(page);
  await find(page, "note", "First idea");
  await page.locator("[data-node=note]").click();
  await expect(page.locator("#selection-tools")).toBeVisible();
  const card = await page.locator("[data-node=note]").boundingBox();
  const toolbar = await page.locator("#selection-tools").boundingBox();
  expect(toolbar.y + toolbar.height <= card.y || toolbar.y >= card.y + card.height, "toolbar sits above or below the selected card").toBe(true);
  await expect(page.locator(".board-selection"), "no duplicate top-right card toolbar").toHaveCount(0);
  const presence = await page.locator("#canvas-presence").boundingBox();
  expect(toolbar.y, "card actions do not overlap presence").toBeGreaterThanOrEqual(presence.y + presence.height);
});

test("rich text keeps the card's bounds, formats in place and persists Markdown with wiki links", async ({ page }) => {
  await openBoard(page);
  await find(page, "note", "First idea");
  await page.locator("[data-node=note]").click();
  const card = await page.locator("[data-node=note]").boundingBox();
  // Editing preserves the object bounds; controls stay separate from its content.
  await page.locator("#canvas").evaluate((el) => {
    el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, shiftKey: true, deltaY: 180 }));
  });
  await pro(page, "inline").click();
  const editorBounds = await page.locator(".inline-editing").boundingBox();
  expect(editorBounds.width).toBe(card.width);
  expect(editorBounds.height).toBe(card.height);
  await expect(page.locator(".inline-rich")).toBeVisible();
  await expect(page.locator(".inline-floating-tools")).toBeVisible();
  expect((await page.locator(".inline-floating-tools").boundingBox()).height, "rich text controls fit in one compact row").toBeLessThanOrEqual(50);

  await page.locator("[data-rich-mode=source]").click();
  await source(page).fill("## Rich notes\n\nA **bold** idea with [[Build prototype]].\n\n- First item\n- Second item\n\n[Guide](https://example.com)\n");
  await pro(page, "inline-preview").click();
  await expect(source(page)).toBeHidden();
  await expect(page.locator(".inline-preview h2")).toHaveText("Rich notes");
  const editor = await page.locator(".inline-editing").boundingBox();
  const preview = await page.locator(".inline-preview").boundingBox();
  expect(preview.y >= editor.y && preview.y + preview.height <= editor.y + editor.height + 1, "preview stays inside the card").toBe(true);
  await page.getByRole("button", { name: "Back to edit", exact: true }).click();
  await expect(source(page)).toBeVisible();

  await page.locator("[data-rich-mode=rich]").click();
  await expect(rich(page).locator("strong")).toHaveText("bold");
  await selectContents(rich(page).locator("h2"));
  const italic = page.getByRole("button", { name: "Italic", exact: true });
  await italic.click();
  await expect(rich(page).locator("h2 i, h2 em").first()).toBeAttached();
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  const styleMenu = page.locator(".rich-format-menu summary");
  await styleMenu.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Paragraph");
  // Paragraph, Heading 1, Heading 2, Heading 3, Quote (0.19.6): two steps reach Heading 2.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(rich(page).locator("h2 i, h2 em").first(), "the text style menu preserves the selected text").toBeAttached();
  await styleMenu.click();
  await page.keyboard.press("Escape");
  await expect(rich(page), "Escape closes a menu without cancelling editing").toBeVisible();
  await expect(page.locator(".rich-format-menu")).not.toHaveAttribute("open");

  await selectContents(rich(page).locator("a"));
  await page.locator("[data-rich-link]").click();
  await page.getByRole("textbox", { name: "Link URL", exact: true }).fill("https://example.com/updated");
  await page.locator("[data-rich-link-save]").click();

  // On a narrow window the style menu and link field stay on screen. The menu floats on the
  // next animation frame after its summary is clicked (canvas-rich-text.js), so wait for it to
  // settle rather than measuring straight after the click: under parallel load the frame can
  // land after the measurement, which is why this suite used to fail only when busy.
  await page.setViewportSize({ width: 480, height: 800 });
  await styleMenu.click();
  await expect.poll(async () => within(await page.locator(".rich-format-menu .selection-popover").boundingBox(), 480), { message: "style menu inside 480px" }).toBe(true);
  await page.keyboard.press("Escape");
  await page.locator("[data-rich-link]").click();
  await expect.poll(async () => within(await page.locator(".rich-link-field").boundingBox(), 480), { message: "link field inside 480px" }).toBe(true);
  await page.keyboard.press("Escape");
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.setViewportSize({ width: 1600, height: 1100 });

  await pro(page, "inline-preview").click();
  await expect(rich(page)).toBeHidden();
  await expect(page.locator(".inline-preview h2 em").first()).toBeAttached();
  await page.locator('[data-pro="search-toggle"]').click();
  await saved(page);
  await expect.poll(() => stored("note"), { message: "rich formatting persisted" }).toMatch(/\*Rich notes\*|_Rich notes_/);
  const text = await stored("note");
  expect(text, "visual editing preserves wiki links").toContain("[[Build prototype]]");
  expect(text).toContain("https://example.com/updated");
  expect(text).toContain("**bold**");
  await page.reload();
  await page.locator("#canvas").waitFor();
  await find(page, "note", "Rich notes");
  await expect(page.locator("[data-node=note] h2 em").first()).toBeAttached();
});

test("the expanded board fills the window, survives re-render, and full screen exits", async ({ page, browserName }) => {
  await openBoard(page);
  await page.locator("#board-expand").click();
  const canvas = page.locator("#canvas");
  await expect(canvas).toHaveClass(/board-expanded/);
  expect(await canvas.boundingBox()).toEqual({ x: 0, y: 0, width: 1600, height: 1100 });
  await page.locator("[data-node=note]").dblclick();
  await expect(page.locator(".inline-editing")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".inline-editing")).toHaveCount(0);
  await expect(canvas, "expanded state survives re-render").toHaveClass(/board-expanded/);
  await page.keyboard.press("Escape");
  await expect(canvas).not.toHaveClass(/board-expanded/);
  if (browserName !== "firefox") {
    await page.getByRole("button", { name: "Full screen", exact: true }).click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.locator("#board-expand").click();
    await page.waitForFunction(() => !document.fullscreenElement);
  }
});

// Bullet lists are a direct toolbar action and behave like native rich text.
for (const [id, title, kind] of [["note", "First idea", "notes"], ["far", "A distant idea", "text objects"]]) {
  test(`bullets in ${kind} are a direct toolbar action that continues, ends and persists as Markdown`, async ({ page }) => {
    await openBoard(page);
    await find(page, id, title);
    await page.locator(`[data-node="${id}"]`).dblclick();
    await page.locator("[data-rich-mode=source]").click();
    await source(page).fill("");
    await page.locator("[data-rich-mode=rich]").click();
    const bullets = page.getByRole("button", { name: "Bullet list", exact: true });
    await expect(page.locator(".rich-format-menu")).not.toHaveAttribute("open");
    await expect(bullets, "bullets are visible without opening a menu").toBeVisible();
    await bullets.click();
    await page.keyboard.type("First point");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second point");
    await expect(rich(page).locator("ul > li")).toHaveText(["First point", "Second point"]);
    await expect(bullets).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("After the list");
    await expect(rich(page).locator("ul > li"), "Enter on an empty bullet ends the list").toHaveCount(2);
    await page.keyboard.press("Control+Enter");
    await expect.poll(() => stored(id)).toContain("After the list");
    const text = await stored(id);
    expect(text).toMatch(/- +First point/);
    expect(text).toMatch(/- +Second point/);
    await page.reload();
    await page.locator("#canvas").waitFor();
    await find(page, id, "First point");
    await expect(page.locator(`[data-node="${id}"] ul > li`)).toHaveText(["First point", "Second point"]);
  });
}
