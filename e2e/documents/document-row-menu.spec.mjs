// Owner requests T81–T86 (1 November 2026, iPad document list): Import Markdown is an icon in the
// list's header; documents have a ⋯ menu like folders (Rename, Move to folder, Delete) that works on
// any document, and pressing ⋯ again closes it; on touch screens a long press opens a document's
// menu or a folder's panel, and a long press then a move drags it onto a folder; the open
// document's tab is underlined in the top bar.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openList } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Row menus", key: "RM" });
  const open = await store.createDocument(project.id, { title: "Open note", body: "Text" });
  const other = await store.createDocument(project.id, { title: "Other note", body: "More" });
  const spare = await store.createDocument(project.id, { title: "Spare note", body: "Spare" });
  const { project: record } = await store.snapshot(project.id);
  await store.updateProject(project.id, { revision: record.revision, document_folders: [{ id: "folder-plans", title: "Plans", parent: null }] });
  return { project, open, other, spare };
});
const list = (page) => page.locator("#list-panel");
const row = (page, title) => list(page).locator("[data-document-open]", { hasText: title });
const snapshot = () => app.store.snapshot(app.project.id);
// A touch press on an element, held and moved as a finger would (pointer events, as iPad Safari sends).
const touch = (page, type, { x, y }) => page.evaluate(([type, x, y]) => {
  const target = document.elementFromPoint(x, y) || document.body;
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y }));
}, [type, x, y]);
const centre = async (locator) => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

test("Import Markdown is an icon in the list's header", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.open.id}`);
  await page.locator("#document-form").waitFor();
  await openList(page);
  await expect(list(page).locator("header").getByRole("button", { name: "Import Markdown", exact: true })).toBeVisible();
  await expect(list(page).locator("footer [data-document-action=import]"), "no footer button").toHaveCount(0);
});

test("a document's ⋯ menu renames, moves and deletes it, and pressing ⋯ again closes it", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.open.id}`);
  await page.locator("#document-form").waitFor();
  await openList(page);
  const more = list(page).getByRole("button", { name: "Actions for Other note", exact: true });
  await more.click();
  const menu = page.getByRole("dialog", { name: "Document actions" });
  await expect(menu.locator("button")).toHaveText(["Rename", "Move to folder", "Delete"]);
  await more.click();
  await expect(menu, "pressed again, ⋯ closes its menu").toBeHidden();
  // Rename a document that isn't the open one.
  await more.click();
  await menu.getByRole("button", { name: "Rename", exact: true }).click();
  const name = page.getByRole("dialog", { name: "Rename document" }).getByLabel("Document name");
  await name.fill("Renamed note");
  await name.press("Enter");
  await expect(row(page, "Renamed note")).toBeVisible();
  await expect.poll(async () => (await snapshot()).documents.find((d) => d.id === app.other.id).title).toBe("Renamed note");
  await expect(page.locator(".topbar .document-tab-open[aria-current=page]"), "the open document stays open").toHaveText("Open note");
  // Move it into a folder.
  await list(page).getByRole("button", { name: "Actions for Renamed note", exact: true }).click();
  await menu.getByRole("button", { name: "Move to folder", exact: true }).click();
  const move = page.getByRole("dialog", { name: "Move document" });
  await move.getByLabel("Folder").selectOption("folder-plans");
  await move.getByRole("button", { name: "Move", exact: true }).click();
  await expect.poll(async () => (await snapshot()).documents.find((d) => d.id === app.other.id).folder).toBe("folder-plans");
  // Delete it.
  await list(page).getByRole("button", { name: "Actions for Renamed note", exact: true }).click();
  await menu.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog", { name: "Delete document" }).getByRole("button", { name: "Move to Trash" }).click();
  await expect(row(page, "Renamed note")).toHaveCount(0);
  await expect.poll(async () => (await snapshot()).documents.some((d) => d.id === app.other.id)).toBe(false);
  await expect(page.locator(".topbar .document-tab-open[aria-current=page]")).toHaveText("Open note");
});

onDevices(["desktop", "ipad"], () => test("pressing a folder's ⋯ again closes its panel", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.open.id}`);
  await page.locator("#document-form").waitFor();
  await openList(page);
  const more = list(page).getByRole("button", { name: "Edit Plans folder", exact: true });
  const press = () => (device === "desktop" ? more.click() : more.tap());
  await press();
  await expect(page.getByRole("dialog", { name: "Edit folder" })).toBeVisible();
  await press();
  await expect(page.getByRole("dialog", { name: "Edit folder" })).toBeHidden();
  // iPad Safari closes an open panel as the finger touches down outside it (light dismiss), before
  // the button's click: that click doesn't open it again.
  await press();
  await expect(page.getByRole("dialog", { name: "Edit folder" })).toBeVisible();
  await more.evaluate(async (button) => {
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    document.querySelector(".document-panel").hidePopover();
    await new Promise((resolve) => setTimeout(resolve, 80));
    button.click();
  });
  await expect(page.getByRole("dialog", { name: "Edit folder" })).toBeHidden();
}));

test("the open document's tab is underlined in the top bar", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.spare.id}`);
  await page.locator("#document-form").waitFor();
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.open.id}`);
  const tabs = page.locator(".topbar .document-tab-open");
  await expect(tabs).toHaveCount(2);
  const line = (locator) => locator.evaluate((el) => getComputedStyle(el).borderBottomColor);
  const [open, other] = [await line(tabs.and(page.locator("[aria-current=page]"))), await line(tabs.and(page.locator(":not([aria-current])")))];
  expect(open, "the open tab is underlined").not.toBe(other);
  expect(other).toBe("rgba(0, 0, 0, 0)");
});

onDevices(["ipad"], () => {
  test("a long press opens a document's menu or a folder's panel, and doesn't open the document", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.open.id}`);
    await page.locator("#document-form").waitFor();
    await openList(page);
    // The row shows it's held; the menu opens as the finger lifts, so lifting doesn't dismiss it.
    const spot = await centre(row(page, "Spare note"));
    await touch(page, "pointerdown", spot);
    await expect(row(page, "Spare note")).toHaveClass(/document-held/);
    await touch(page, "pointerup", spot);
    await expect(page.getByRole("dialog", { name: "Document actions" })).toBeVisible();
    await expect(list(page), "the list stays open").toBeVisible();
    await expect(page.locator(".topbar .document-tab-open[aria-current=page]"), "the document didn't open").toHaveText("Open note");
    await page.keyboard.press("Escape");
    const folder = list(page).locator("[data-document-folder]");
    await touch(page, "pointerdown", await centre(folder));
    await expect(folder).toHaveClass(/document-held/);
    await touch(page, "pointerup", await centre(folder));
    await expect(page.getByRole("dialog", { name: "Edit folder" })).toBeVisible();
    await expect(folder, "the folder didn't close").toHaveAttribute("aria-expanded", "true");
  });

  test("a long press then a move drags a document onto a folder", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.open.id}`);
    await page.locator("#document-form").waitFor();
    await openList(page);
    const [from, to] = [await centre(row(page, "Spare note")), await centre(list(page).locator("[data-document-folder]"))];
    await touch(page, "pointerdown", from);
    await expect(row(page, "Spare note")).toHaveClass(/document-held/);
    await touch(page, "pointermove", { x: from.x, y: from.y - 20 });
    await touch(page, "pointermove", to);
    await expect(list(page).locator(".document-drop-target")).toHaveCount(1);
    await touch(page, "pointerup", to);
    await expect.poll(async () => (await snapshot()).documents.find((d) => d.title === "Spare note").folder).toBe("folder-plans");
    await expect(page.getByRole("dialog", { name: "Document actions" }), "a drag opens no menu").toHaveCount(0);
  });
});
