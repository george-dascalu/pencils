// Owner requests, 28 and 29 October 2026: the top bar title is only the open board or
// document, or the project when nothing is open, with no organisation or project crumbs.
// Phones name the view on the second line.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { renameDocument } from "../helpers/documents.mjs";

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
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const heading = crumb.querySelector('[role="heading"][aria-level="1"]');
  const second = crumb.querySelector(".phone-current-view");
  return {
    heading: heading?.textContent.trim(),
    headingVisible: visible(heading),
    second: visible(second) ? second.textContent.trim() : null,
    trail: [...crumb.children].filter((el) => visible(el) && !el.matches("button.icon-button, .phone-current-view")).map((el) => el.textContent.trim()),
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
  expect(h.headingVisible, "the board name is visible").toBe(true);
  expect(h.tooltip, "the tooltip keeps the project").toMatch(/A little more possibility/);
  if (device === "phone") expect(h.second, "the second line names the view").toBe("Boards");
  expect(h.trail, "only the board name").toEqual(["Test Project canvas"]);
}));

onDevices(["phone", "desktop"], () => test("switching boards renames the header", async ({ page }) => {
  await openBoard(page);
  await page.locator("#board-select").selectOption(app.second.id);
  await expect(heading(page)).toHaveText("Launch plan board");
}));

test("renaming a board in Board settings renames the header", async ({ page }) => {
  await openBoard(page, app.second);
  await page.getByRole("button", { name: "Board settings", exact: true }).click();
  const title = page.locator('#board-settings-form [name="title"]');
  await title.fill("Renamed launch board");
  await expect(heading(page)).toHaveText("Renamed launch board");
  await title.fill("Launch plan board");
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
  if (device === "phone") expect(h.second).toBe("Documents");
  expect(h.trail).toEqual([current]);
  // Renaming the document (Document tools → Rename) renames the header.
  await renameDocument(page, `Weekly ${device} notes`);
  await expect(heading(page)).toHaveText(`Weekly ${device} notes`);
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).documents.find((d) => d.id === app.doc.id).title).toBe(`Weekly ${device} notes`);
}));

onDevices(["phone", "ipad", "desktop"], () => test("other views still name the project", async ({ page, device }) => {
  await page.goto(`${base()}/list`);
  await page.locator(".task-row").first().waitFor();
  const h = await header(page);
  expect(h.heading).toBe("A little more possibility");
  if (device === "phone") expect(h.second).toBe("List");
  expect(h.trail, "only the project name").toEqual(["A little more possibility"]);
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
