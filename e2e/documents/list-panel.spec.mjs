// Owner request (T25, 31 October 2026): the document list and the board list have a page of their
// own instead of a sidebar section. On desktop and iPad it opens as a panel four fifths of the
// width over the open item, which shows blurred beside it: press the active Documents or Boards
// tab (on touch screens, the tray's Documents button). Phones open it as a full page. The tray
// splits Documents from the document views with a divider.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSidebar } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Lists", key: "LS" });
  const doc = await store.createDocument(project.id, { title: "First note", body: "One.\n" });
  const other = await store.createDocument(project.id, { title: "Second note", body: "Two.\n" });
  const board = (await store.snapshot(project.id)).boards[0];
  const second = await store.createBoard(project.id, { title: "Second board" });
  return { project, doc, other, board, second };
});
const panel = (page) => page.locator("#list-panel");
const touch = (page) => page.evaluate(() => matchMedia("(max-width: 600px), (pointer: coarse)").matches);
// Opens the list the way the device offers it: the active tab, or the tray's Documents button.
async function openList(page, view) {
  if (view === "documents" && (await touch(page))) {
    await page.locator('.tabs [data-view="documents"]').click();
    await page.locator(".layout-tray").getByRole("button", { name: "Documents", exact: true }).click();
  } else await page.locator(`.tabs [data-view="${view}"][aria-current="page"]`).click();
  await expect(panel(page)).toBeVisible();
}

onDevices(["desktop", "ipad", "phone"], () => test("the document list opens as a panel over the blurred document, and closes on a choice, Escape or a click outside", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
  await expect(page.locator("#sidebar-documents"), "no list in the sidebar").toHaveCount(0);
  await expect(panel(page)).toBeHidden();
  await openList(page, "documents");
  await expect(panel(page)).toHaveAttribute("data-kind", "documents");
  await expect(panel(page).getByRole("heading", { name: "Documents" })).toBeVisible();
  const [main, box] = [await page.locator(".main").boundingBox(), await panel(page).boundingBox()];
  if (device === "phone") {
    expect(box.width, "a full page on phones").toBeGreaterThanOrEqual(main.width - 1);
  } else {
    expect(Math.abs(box.width / main.width - 0.8), `${device}: four fifths wide`).toBeLessThan(0.03);
    expect(box.x, "on the left").toBeLessThanOrEqual(main.x + 1);
    await expect(page.locator("#view-content"), "the document shows blurred beside it").toHaveCSS("filter", /blur\(/);
  }
  await expect(page.locator("#view-content"), "Tab stays in the list").toHaveJSProperty("inert", true);
  await expect(panel(page).locator("[data-document-open]")).toHaveCount(2);
  await panel(page).locator(`[data-document-open="${app.other.id}"]`).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator(".topbar")).toContainText("Second note");
  await expect(page.locator("#view-content")).not.toHaveCSS("filter", /blur\(/);
  await openList(page, "documents");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  if (device !== "phone") {
    await openList(page, "documents");
    await page.mouse.click(main.x + main.width - 20, main.y + main.height / 2);
    await expect(panel(page), "a click on the blurred document closes it").toBeHidden();
  }
  // The sidebar keeps to the menu: no Documents level, no back arrow.
  await openSidebar(page);
  await expect(page.locator(".sidebar [data-document-open]")).toHaveCount(0);
  await expect(page.locator(".sidebar [data-drawer-back]")).toHaveCount(0);
}));

onDevices(["desktop", "phone"], () => test("the board list opens the same way from the active Boards tab", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator("#canvas").waitFor();
  await expect(panel(page)).toBeHidden();
  await openList(page, "board");
  await expect(panel(page)).toHaveAttribute("data-kind", "boards");
  await expect(panel(page).locator("[data-board-open]")).toHaveCount(2);
  await expect(panel(page).locator('[data-board-menu="board-new"]')).toHaveCount(1);
  await panel(page).locator(`[data-board-open="${app.second.id}"]`).click();
  await expect(panel(page)).toBeHidden();
  await page.locator(`.board-tools[data-board="${app.second.id}"]`).waitFor();
}));

test("the list stays closed after leaving the project and coming back", async ({ page }) => {
  await page.goto(app.base);
  await expect(page.locator(".home")).toBeVisible();
  await page.evaluate((hash) => { location.hash = hash; }, `#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
  await openList(page, "documents");
  // Back to Home and Forward again, so no click closes the list first.
  await page.goBack();
  await expect(page.locator(".home")).toBeVisible();
  await page.goForward();
  await page.locator(".cm-content").waitFor();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("#view-content")).toHaveJSProperty("inert", false);
});

onDevices(["phone"], () => test("the tray separates Documents from the document views with a divider", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
  await page.locator('.tabs [data-view="documents"]').click();
  const tray = page.locator(".layout-tray .view-layout-switcher");
  await expect(tray).toBeVisible();
  expect(await tray.locator(":scope > *").evaluateAll((els) => els.map((el) => el.matches("[role=separator]") ? "|" : el.getAttribute("aria-label")))).toEqual(["Documents", "|", "Live preview", "Source", "Reading"]);
}));
