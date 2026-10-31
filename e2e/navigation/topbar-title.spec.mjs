// Owner requests, 28 and 29 October 2026: the top bar title is only the open board or
// document, or the project when nothing is open, with no organisation or project crumbs.
// Since 30 October phones show no title at all; the heading stays for screen readers.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { renameDocument } from "../helpers/documents.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "A little more possibility", key: "TB" });
  await store.createTask(project.id, { title: "One task", status: "todo" });
  const first = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, first.id, { revision: first.revision, title: "Test Project canvas" });
  const second = await store.createBoard(project.id, { title: "Launch plan board" });
  const doc = await store.createDocument(project.id, { title: "Meeting notes", body: "# Notes\n\nAgenda." });
  return { project, first: { ...first, title: "Test Project canvas" }, second, doc };
});
const base = () => `${app.base}/#project/${app.project.id}`;
const heading = (page) => page.locator('.topbar [role="heading"][aria-level="1"]');
// The visible text of the header's breadcrumb, part by part.
const header = (page) => page.locator(".topbar .breadcrumb").evaluate((crumb) => {
  const visible = (el) => !!el && el.getBoundingClientRect().width > 1 && getComputedStyle(el).visibility !== "hidden";
  const heading = crumb.querySelector('[role="heading"][aria-level="1"]');
  return {
    heading: heading?.textContent.trim(),
    headingVisible: visible(heading),
    trail: [...crumb.children].filter((el) => visible(el) && !el.matches("button.icon-button, .document-tabs")).map((el) => el.textContent.trim()),
    tab: crumb.querySelector(".document-tabs [aria-current=page]")?.textContent.trim() || null,
    tooltip: heading?.title || "",
  };
});
const openBoard = async (page, board = app.first) => {
  await page.goto(`${base()}/board/${board.id}`);
  await page.locator("#canvas").waitFor();
  await expect(heading(page)).toHaveText(board.title);
};

onDevices(["phone", "ipad", "desktop"], () => test("a board names itself in the header", async ({ page, device }) => {
  await openBoard(page);
  const h = await header(page);
  expect(h.heading, JSON.stringify(h)).toBe("Test Project canvas");
  expect(h.headingVisible, "the board name is visible, except on phones").toBe(device !== "phone");
  expect(h.tooltip, "the tooltip keeps the project").toMatch(/A little more possibility/);
  expect(h.trail, "only the board name").toEqual(device === "phone" ? [] : ["Test Project canvas"]);
}));

onDevices(["phone", "desktop"], () => test("switching boards renames the header", async ({ page }) => {
  await openBoard(page);
  await page.locator("#board-select").selectOption(app.second.id);
  await expect(heading(page)).toHaveText("Launch plan board");
}));

test("renaming a board in Board tools renames the header", async ({ page }) => {
  await openBoard(page, app.second);
  // Board tools → Rename names the board since 0.20.73.
  const rename = async (name) => {
    await clickControl(page.locator('.board-toolbar [data-action="board-rename"]'));
    await page.locator('#board-form [name="title"]').fill(name);
    await page.locator('#board-form [type="submit"]').click();
    await page.locator("#board-form").waitFor({ state: "detached" });
  };
  await rename("Renamed launch board");
  await expect(heading(page)).toHaveText("Renamed launch board");
  await rename("Launch plan board");
  await expect(heading(page)).toHaveText("Launch plan board");
});

onDevices(["phone", "ipad", "desktop"], () => test("an open document names itself in the header", async ({ page, device }) => {
  await page.goto(`${base()}/documents/${app.doc.id}`);
  // Since 0.19.31 the document bar has no title field (a hidden one keeps the name).
  await page.locator("#document-form .document-heading").waitFor();
  const title = page.locator('#document-form input[type=hidden][name="title"]');
  // Earlier devices rename the shared document, so start from its current title.
  const current = await title.inputValue();
  expect(current).toMatch(/notes/);
  await expect(heading(page)).toHaveText(current);
  const h = await header(page);
  // Desktop and iPad name it with its tab, in the title's place; phones show no title.
  expect([h.trail, h.tab]).toEqual([[], device === "phone" ? null : current]);
  // Renaming the document (Document tools → Rename) renames the header.
  await renameDocument(page, `Weekly ${device} notes`);
  await expect(heading(page)).toHaveText(`Weekly ${device} notes`);
  if (device !== "phone") await expect(page.locator(".topbar .document-tabs [aria-current=page]")).toHaveText(`Weekly ${device} notes`);
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).documents.find((d) => d.id === app.doc.id).title).toBe(`Weekly ${device} notes`);
}));

onDevices(["phone", "ipad", "desktop"], () => test("other views still name the project", async ({ page, device }) => {
  await page.goto(`${base()}/list`);
  await page.locator(".task-row").first().waitFor();
  const h = await header(page);
  expect(h.heading).toBe("A little more possibility");
  expect(h.trail, "only the project name").toEqual(device === "phone" ? [] : ["A little more possibility"]);
  // Leaving a board returns the header to the project.
  await openBoard(page);
  await page.goto(`${base()}/table`);
  await page.locator(".spreadsheet").waitFor();
  await expect(heading(page)).toHaveText("A little more possibility");
}));

onDevices(["phone", "desktop"], () => test("the board gallery names the project", async ({ page }) => {
  await page.goto(`${base()}/board/gallery`);
  await page.locator(".drawing-gallery").waitFor();
  await expect(heading(page)).toHaveText("A little more possibility");
}));
