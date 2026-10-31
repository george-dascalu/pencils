// Owner request, 31 October 2026 (board menus, like Miro, FigJam and Obsidian Canvas): the board
// bar's right side matches the document bar: Session, Version history, the bookmark star and
// Board tools (⋯), each action in one place. Jump to frame (Outline covers it) and the Keyboard
// shortcuts entry (Help has the page) are gone from More.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { acceptConfirm, reveal } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Board bar", key: "BB" }) }));
const open = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
};
const menu = (page, key) => page.locator(`.board-toolbar [data-board-menu="${key}"]`);
const items = (page, key) => menu(page, key).locator(".board-menu-panel > :is(button, a)").evaluateAll((els) => els.map((el) => el.textContent.trim()));

test("the board bar's right side holds Session, Version history, the star and Board tools", async ({ page }) => {
  await open(page);
  const right = await page.locator(".board-toolbar").evaluate((bar) => {
    const name = (el) => el.matches(".bookmark-button") ? "star" : el.dataset.boardMenu || (el.id === "board-save" ? "save" : "");
    const save = bar.querySelector("#board-save").getBoundingClientRect().left;
    return [...bar.children].filter((el) => el.getBoundingClientRect().left >= save).map(name).filter(Boolean);
  });
  expect(right).toEqual(["save", "session", "history", "star", "tools"]);
  for (const [key, label] of [["session", "Session"], ["history", "Version history"], ["tools", "Board tools"]])
    await expect(menu(page, key).locator("summary")).toHaveAccessibleName(label);
  expect(await items(page, "session")).toEqual(["Present", "Board session"]);
  expect(await items(page, "history")).toEqual(["Activity", "History", "Local checkpoints"]);
  expect(await items(page, "tools")).toEqual(["Rename", "Copy board link", "Link tasks", "Export SVG", "Export PNG", "Obsidian .canvas", "Prepare offline drawing", "Open offline pad", "Delete board"]);
  expect(await items(page, "board")).toEqual(["New board", "Boards"]);
  const more = await items(page, "more");
  for (const gone of ["Present", "Board session", "Activity", "Keyboard shortcuts", "History", "Export SVG", "Delete board"]) expect(more, gone).not.toContain(gone);
  await expect(page.locator("#frame-nav"), "Jump to frame is gone; Outline covers it").toHaveCount(0);
});

test("Board tools → Rename names the board", async ({ page }) => {
  await open(page);
  await reveal(page.locator('.board-toolbar [data-action="board-rename"]'));
  await page.locator('.board-toolbar [data-action="board-rename"]').click();
  const form = page.locator("#board-form");
  await expect(form.locator("h2")).toHaveText("Name this board");
  await form.getByLabel("Board name", { exact: true }).fill("Renamed board");
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('.topbar [role="heading"][aria-level="1"]')).toHaveText("Renamed board");
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).boards.some((b) => b.title === "Renamed board")).toBe(true);
});

test("Board tools → Delete board moves it to Trash, and Rename goes with the last board", async ({ page }) => {
  // Its own project, so the other tests keep their board.
  const project = await app.store.createProject({ title: "Deleting", key: "DL" });
  await page.goto(`${app.base}/#project/${project.id}/board`);
  await page.locator("#canvas").waitFor();
  await reveal(page.locator('.board-toolbar [data-feature="canvas-delete"]'));
  await page.locator('.board-toolbar [data-feature="canvas-delete"]').click();
  await acceptConfirm(page);
  await expect.poll(async () => (await app.store.snapshot(project.id)).boards.filter((b) => !b.archived).length).toBe(0);
  await expect(page.locator('[data-action="board-rename"]'), "nothing to rename").toHaveCount(0);
});

onDevices(["phone"], () => test("phones reach the same menus from View options, each named", async ({ page }) => {
  await open(page);
  for (const [key, name] of [["session", "Session"], ["history", "Version history"], ["tools", "Board tools"]]) {
    const summary = page.locator(`.mobile-view-options-panel > [data-board-menu="${key}"] > summary`);
    await expect(summary).toHaveCount(1);
    expect(await summary.evaluate((el) => [getComputedStyle(el, "::after").content, el.scrollWidth <= el.clientWidth]), `${key} shows its name, inside the button`).toEqual([`"${name}"`, true]);
  }
  for (const selector of ['[data-pro="present"]', '[data-pro="activity"]', '[data-action="board-rename"]']) {
    const item = page.locator(`.board-toolbar ${selector}`);
    await reveal(item);
    await expect(item).toBeVisible();
    await page.keyboard.press("Escape");
  }
}));
