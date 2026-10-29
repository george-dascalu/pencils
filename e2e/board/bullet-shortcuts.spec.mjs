// Markdown list shortcuts in board text editors: "-", "*", "+", "1." and "1)" followed by Space
// start a list at once (native Undo/Redo reverse and restore the conversion), new paragraphs and
// formatted text convert, while prose, double dashes, words, code blocks and existing lists stay
// literal. Composition is left to the input method, virtual-keyboard spaces convert, and lists
// autosave as portable Markdown that survives reload and undo. Markdown source mode and plain
// frame titles never convert.
// The steps edit the same note in turn, so the file runs in order. The board never reaches the
// internet.
import { test, expect, useApp } from "../fixtures.mjs";
import { openBoardSearch } from "../helpers/menu-controls.mjs";

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
      { id: "frame", type: "frame", text: "Plain frame title", x: 80, y: 700, w: 400, h: 300 },
      { id: "note", type: "sticky", text: "First idea", x: 80, y: 150, w: 240, h: 200, color: "#f5e7a2" },
      { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
      { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
      { id: "far", type: "text", text: "A distant idea", x: 6000, y: 3000, w: 300, h: 150 },
    ],
    edges: [],
  });
  return { project, board };
});

test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1600, height: 1100 } });

const current = async () => (await app.store.snapshot(app.project.id)).boards.find((x) => x.id === app.board.id);
const noteText = async () => (await current()).nodes.find((n) => n.id === "note").text;
const poll = (fn, message) => expect.poll(fn, { message, timeout: 12000 });
const rich = (page) => page.locator(".inline-rich");

async function enter(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
}
async function find(page, id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`#canvas-find-results [data-pro=find-result][data-id="${id}"]`).click();
  await expect(page.locator(`[data-node="${id}"]`)).toBeVisible();
}
// Replace the editor's content through Markdown source mode, then return to rich text.
async function content(page, markdown = "") {
  await page.locator("[data-rich-mode=source]").click();
  await page.locator(".inline-source").fill(markdown);
  await page.locator("[data-rich-mode=rich]").click();
}
async function editNote(page) {
  await enter(page);
  await find(page, "note", "First idea");
  await page.locator("[data-node=note]").dblclick();
  await rich(page).waitFor();
}

let external;
test.beforeEach(({ page }) => {
  external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
});
test.afterEach(() => expect(external, "no internet requests").toEqual([]));

test("a list marker and Space start a list at once, with native undo and redo, and two Enters leave it", async ({ page }) => {
  await editNote(page);
  for (const marker of ["-", "*", "+", "1.", "1)"]) {
    const ordered = marker.startsWith("1");
    await content(page);
    await page.keyboard.type(marker);
    await expect(rich(page).locator("li")).toHaveCount(0);
    await page.keyboard.press("Space");
    await expect(rich(page).locator(ordered ? "ol > li" : "ul > li"), `${marker} and Space create a bullet immediately`).toHaveCount(1);
    expect((await rich(page).innerText()).trim(), "The typed marker is removed").toBe("");
    await expect(page.getByRole("button", { name: ordered ? "Numbered list" : "Bullet list", exact: true })).toHaveAttribute("aria-pressed", "true");
    if (marker === "-") {
      await page.keyboard.press("Control+z");
      await expect(rich(page).locator("li"), "Native Undo reverses the conversion").toHaveCount(0);
      await page.keyboard.press("Control+Shift+z");
      await expect(rich(page).locator("li"), "Native Redo restores the conversion").toHaveCount(1);
    }
    await page.keyboard.type("First point");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second point");
    await expect(rich(page).locator("li")).toHaveText(["First point", "Second point"]);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("After the list");
    await expect(rich(page).locator("li")).toHaveCount(2);
  }
});

test("a marker at the start of a new paragraph or of formatted text turns that line into a list item", async ({ page }) => {
  await editNote(page);
  await content(page, "Intro paragraph");
  await rich(page).press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("New paragraph bullet");
  await expect(rich(page).locator("ul > li")).toHaveText("New paragraph bullet");
  expect(await rich(page).innerText()).toMatch(/^Intro paragraph/);

  await content(page, "Existing **formatted** text");
  await rich(page).press("Control+Home");
  await page.keyboard.type("- ");
  await expect(rich(page).locator("ul > li")).toHaveText("Existing formatted text");
  await expect(rich(page).locator("li strong,li b")).toHaveText("formatted");
});

test("literal text, code and an existing list do not convert", async ({ page }) => {
  await editNote(page);
  for (const [markdown, suffix, lists] of [
    ["Normal prose", " - ", 0],
    ["", "-- ", 0],
    ["", "-word ", 0],
    ["```text\ncode\n```", "- ", 0],
    ["- Existing item", "- ", 1],
  ]) {
    await content(page, markdown);
    await rich(page).press("Control+End");
    await page.keyboard.type(suffix);
    await expect(rich(page).locator("ul"), markdown + suffix).toHaveCount(lists);
    expect((await rich(page).innerText()).trimEnd().endsWith(suffix.trimEnd())).toBe(true);
  }
});

test("composition is left to the input method, a virtual-keyboard space converts, and the list autosaves, reloads and undoes", async ({ page }) => {
  await editNote(page);
  await content(page);
  await page.keyboard.type("-");
  const beforeInput = (isComposing) =>
    rich(page).evaluate(
      (el, isComposing) =>
        el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: " ", ...(isComposing ? { isComposing } : {}) })),
      isComposing,
    );
  expect(await beforeInput(true), "Composition is left to the input method").toBe(true);
  await expect(rich(page).locator("li")).toHaveCount(0);
  // Virtual keyboards send beforeinput without a physical keydown.
  expect(await beforeInput(false)).toBe(false);
  await expect(rich(page).locator("li")).toHaveCount(1);
  await page.keyboard.type("Saved shortcut bullet");
  await page.locator('[data-pro="search-toggle"]').click();
  await poll(noteText).toContain("Saved shortcut bullet");
  expect(await noteText()).toMatch(/^- +Saved shortcut bullet/);
  await page.reload();
  await page.locator("#canvas").waitFor();
  await find(page, "note", "Saved shortcut bullet");
  await expect(page.locator("[data-node=note] ul > li")).toHaveText("Saved shortcut bullet");
  await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
  await poll(noteText).toBe("First idea");
});

test("Markdown source mode stays literal until rendered and plain frame titles stay plain", async ({ page }) => {
  await editNote(page);
  await page.locator("[data-rich-mode=source]").click();
  await page.locator(".inline-source").fill("");
  await page.keyboard.type("- ");
  await expect(page.locator(".inline-source")).toHaveValue("- ");
  await page.keyboard.press("Escape");
  await find(page, "frame", "Plain frame title");
  await page.locator("[data-node=frame] .frame-title").dblclick();
  await rich(page).fill("");
  await page.keyboard.type("- ");
  expect((await rich(page).innerText()).replaceAll(" ", " ")).toBe("- ");
  await expect(rich(page).locator("li")).toHaveCount(0);
  await page.locator('[data-pro="search-toggle"]').click();
});

test("the numbered-list button saves portable Markdown that survives reload", async ({ page }) => {
  await enter(page);
  await find(page, "note", "-");
  await page.locator("[data-node=note]").dblclick();
  if (await page.locator('[data-rich-mode="rich"]').isVisible()) await page.locator('[data-rich-mode="rich"]').click();
  await content(page);
  await page.getByRole("button", { name: "Numbered list", exact: true }).click();
  await page.keyboard.type("First numbered point");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second numbered point");
  await expect(rich(page).locator("ol > li")).toHaveText(["First numbered point", "Second numbered point"]);
  await page.locator('[data-pro="search-toggle"]').click();
  await poll(noteText).toContain("Second numbered point");
  expect(await noteText()).toMatch(/^1\. +First numbered point\n2\. +Second numbered point/);
  await page.reload();
  await page.locator("#canvas").waitFor();
  await find(page, "note", "First numbered point");
  await expect(page.locator('[data-node="note"] ol > li')).toHaveCount(2);
});
