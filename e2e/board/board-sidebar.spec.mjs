// Owner request (T2, 0.20.74): boards live in the main sidebar like documents, in folders, instead
// of the board picker, the bar's Boards menu and the gallery. New board offers a blank board, an
// Obsidian .canvas import and a Miro import; a blank board goes into the chosen folder. Board
// tools → Move to folder and dragging file a board. Phones open the drawer on the board list.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl, openSidebar, chooseProject } from "../helpers/menu-controls.mjs";

const app = useApp(async () => ({}));
// A project per test: one board at the root and one in the Ideas folder.
async function seed(key) {
  let project = await app.store.createProject({ title: `Board folders ${key}`, key });
  project = await app.store.updateProject(project.id, { revision: project.revision, board_folders: [{ id: "ideas", title: "Ideas", parent: null }] });
  const first = (await app.store.snapshot(project.id)).boards[0];
  const filed = await app.store.createBoard(project.id, { title: "Filed board", folder: "ideas" });
  return { project, first, filed };
}
const saved = async (s, id) => (await app.store.snapshot(s.project.id)).boards.find((b) => b.id === id);
async function open(page, s, board = s.first) {
  await page.goto(`${app.base}/#project/${s.project.id}/board/${board.id}`);
  await page.locator(`.board-tools[data-board="${board.id}"]`).waitFor();
}
const section = (page) => page.locator(".sidebar #board-explorer");

test("boards are listed in the sidebar's folders and open from there, with no picker in the bar", async ({ page }) => {
  const s = await seed("BSA");
  await open(page, s);
  await expect(page.locator("#board-select"), "no board picker").toHaveCount(0);
  await expect(page.locator('.board-toolbar [data-board-menu="board"]'), "no Boards menu").toHaveCount(0);
  await openSidebar(page);
  await expect(section(page).locator("h2")).toHaveText("Boards 2");
  await expect(section(page).locator("[data-board-folder]")).toHaveText("Ideas");
  await expect(section(page).locator("[data-board-open]")).toHaveText(["Filed board", s.first.title]);
  await expect(section(page).locator('[data-board-open][aria-current="page"]')).toHaveText(s.first.title);
  await section(page).locator(`[data-board-open="${s.filed.id}"]`).click();
  await page.locator(`.board-tools[data-board="${s.filed.id}"]`).waitFor();
  await expect(page.locator(".sidebar.open"), "choosing a board closes the sidebar").toHaveCount(0);
  // Other views empty the section; Documents fills it with documents.
  await page.goto(`${app.base}/#project/${s.project.id}/list`);
  await page.locator("#view-toolbar .search").waitFor();
  await expect(page.locator("#board-explorer")).toHaveCount(0);
});

test("New board offers a blank board and both imports, and a blank board goes into the chosen folder", async ({ page }) => {
  const s = await seed("BSB");
  await open(page, s);
  await openSidebar(page);
  await section(page).locator('[data-board-folder="ideas"]').click();
  await section(page).locator('[data-board-menu="board-new"] > summary').click();
  await expect(section(page).locator('[data-board-menu="board-new"] .board-menu-panel > button')).toHaveText(["Blank board", "Import Obsidian .canvas", "Import from Miro"]);
  await section(page).getByRole("button", { name: "Blank board" }).click();
  await page.locator("#board-form [name=title]").fill("Sketches");
  await page.locator("#board-form").getByRole("button", { name: "Create canvas" }).click();
  await expect.poll(async () => (await app.store.snapshot(s.project.id)).boards.find((b) => b.title === "Sketches")?.folder).toBe("ideas");
});

test("Board tools → Move to folder and dragging a board onto a folder file it, outside the undo log", async ({ page }) => {
  const s = await seed("BSC");
  await open(page, s);
  await clickControl(page.locator('.board-toolbar [data-board-action="move"]'));
  const panel = page.getByRole("dialog", { name: "Move board" });
  await panel.locator("[name=folder]").selectOption("ideas");
  await panel.getByRole("button", { name: "Move", exact: true }).click();
  await expect.poll(async () => (await saved(s, s.first.id)).folder).toBe("ideas");
  await expect(panel).toHaveCount(0);
  expect((await saved(s, s.first.id)).operations || [], "moving a board is not a canvas edit").toEqual([]);
  // Drag the filed board to the root (the section's header).
  await openSidebar(page);
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await section(page).locator(`[data-board-open="${s.filed.id}"]`).dispatchEvent("dragstart", { dataTransfer: transfer });
  const root = section(page).locator('header[data-board-folder-drop=""]');
  await root.dispatchEvent("dragover", { dataTransfer: transfer });
  await root.dispatchEvent("drop", { dataTransfer: transfer });
  await expect.poll(async () => (await saved(s, s.filed.id)).folder ?? null).toBe(null);
  await expect(section(page).locator('[data-board-folder-drop="ideas"] + ul [data-board-open]')).toHaveText([s.first.title]);
});

// The chosen folder belongs to its project: New → Board in another project goes to that project's root.
test("a folder chosen in one project doesn't follow you to another", async ({ page }) => {
  const s = await seed("BSE"), other = await app.store.createProject({ title: "Board folders BSF", key: "BSF" });
  await open(page, s);
  await openSidebar(page);
  await section(page).locator('[data-board-folder="ideas"]').click();
  // Switch project in the app, so this page keeps the folder it chose.
  await chooseProject(page, other.id);
  await expect(page.locator("#project-select")).toHaveValue(other.id);
  await page.locator(".topbar .new-menu:not(.phone-new-task) > summary").click();
  await page.locator(".topbar .new-menu:not(.phone-new-task)").getByRole("button", { name: "Board", exact: true }).click();
  await page.locator("#board-form [name=title]").fill("Elsewhere");
  await page.locator("#board-form [type=submit]").click();
  await expect.poll(async () => {
    const board = (await app.store.snapshot(other.id)).boards.find((b) => b.title === "Elsewhere");
    return board ? board.folder ?? "root" : "not made";
  }, "made at the other project's root").toBe("root");
});

onDevices(["phone"], () => {
  test("phones open the drawer on the board list, and a tap opens a board", async ({ page }) => {
    const s = await seed("BSD");
    await open(page, s);
    await openSidebar(page);
    await expect(page.locator(".sidebar")).toHaveAttribute("data-drawer-level", "documents");
    await expect(section(page)).toBeVisible();
    await section(page).locator(`[data-board-open="${s.filed.id}"]`).click();
    await page.locator(`.board-tools[data-board="${s.filed.id}"]`).waitFor();
    await expect(page.locator(".sidebar.open")).toHaveCount(0);
  });
});
