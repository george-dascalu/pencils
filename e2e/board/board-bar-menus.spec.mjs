// Owner request, 31 October 2026 (board menus, like Miro, FigJam and Obsidian Canvas): the board
// bar's right side matches the document bar: who is here, the bookmark star and Board tools (⋯),
// which leads with Present and Board session, then Activity, History and Local checkpoints (T28,
// 0.20.94), each action in one place. Jump to frame (Outline covers it) and the Keyboard
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

// The bookmark star sits before the title in the top bar (T74, owner request T40, 1 November 2026).
test("the board bar's right side holds Board tools, which leads with the session and history actions", async ({ page }) => {
  await open(page);
  const right = await page.locator(".board-toolbar").evaluate((bar) => {
    const name = (el) => el.matches(".bookmark-button") ? "star" : el.dataset.boardMenu || (el.id === "board-save" ? "save" : "");
    const save = bar.querySelector("#board-save").getBoundingClientRect().left;
    return [...bar.children].filter((el) => el.getBoundingClientRect().left >= save).map(name).filter(Boolean);
  });
  expect(right).toEqual(["save", "tools"]);
  await expect(page.locator('.topbar .breadcrumb .bookmark-button[data-kind="board"]')).toBeVisible();
  await expect(menu(page, "tools").locator("summary")).toHaveAccessibleName("Board tools");
  await expect(page.locator('.board-toolbar [data-board-menu="session"], .board-toolbar [data-board-menu="history"]')).toHaveCount(0);
  expect(await items(page, "tools")).toEqual(["Present", "Board session", "Activity", "History", "Local checkpoints", "Rename", "Move to folder", "Copy board link", "Link cards", "Export SVG", "Export PNG", "Obsidian .canvas", "Prepare offline drawing", "Open offline pad", "Delete board"]);
  // Dividers split the session actions, the history actions and the rest.
  expect(await menu(page, "tools").locator(".board-menu-panel > *").evaluateAll((els) => els.slice(0, 7).map((el) => el.matches(".board-menu-divider") ? "|" : el.textContent.trim()))).toEqual(["Present", "Board session", "|", "Activity", "History", "Local checkpoints", "|"]);
  // Boards are chosen, made and imported in the sidebar since 0.20.74 (board-sidebar.spec.mjs).
  await expect(menu(page, "board")).toHaveCount(0);
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
  for (const [key, name] of [["tools", "Board tools"]]) {
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
