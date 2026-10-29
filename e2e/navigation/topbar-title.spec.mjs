// Owner request, 28 October 2026: with a board or a document open, the top bar
// names that board or document instead of the project. Phones keep the view and
// project on the second line; wide desktop headers keep the project as a crumb
// (Organisation / Project / Board). Other views still show the project.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

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
  if (device === "phone") expect(h.second, "the second line keeps the view and the project").toBe("Boards · A little more possibility");
  if (device === "ipad") expect(h.trail, "iPad shows only the board name").toEqual(["Test Project canvas"]);
  if (device === "desktop") expect(h.trail.slice(-3), "desktop keeps the project as a crumb").toEqual(["A little more possibility", "/", "Test Project canvas"]);
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
  const title = page.locator('.documents-workspace [name="title"]');
  await title.waitFor();
  // Earlier devices rename the shared document, so start from its current title.
  const current = await title.inputValue();
  expect(current).toMatch(/notes/);
  await expect(heading(page)).toHaveText(current);
  const h = await header(page);
  if (device === "phone") expect(h.second).toBe("Documents · A little more possibility");
  if (device === "desktop") expect(h.trail.slice(-3)).toEqual(["A little more possibility", "/", current]);
  // Renaming the document renames the header as you type.
  await title.fill(`Weekly ${device} notes`);
  await expect(heading(page)).toHaveText(`Weekly ${device} notes`);
}));

onDevices(["phone", "ipad", "desktop"], () => test("other views still name the project", async ({ page, device }) => {
  await page.goto(`${base()}/list`);
  await page.locator(".task-row").first().waitFor();
  const h = await header(page);
  expect(h.heading).toBe("A little more possibility");
  if (device === "phone") expect(h.second).toBe("List");
  if (device === "desktop") expect(!h.trail.includes("/") || h.trail.filter((t) => t === "/").length === 1, `only Organisation / Project ${JSON.stringify(h.trail)}`).toBe(true);
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
