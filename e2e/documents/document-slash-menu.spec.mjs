// Owner request, 28 October 2026: insert document elements by typing "/", as
// in Obsidian. "/" at the start of a line or after a space opens a menu of the
// same elements as the Insert panel; typing filters it and choosing one
// replaces the "/query" with the element.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { editorSource, openNewDocument } from "../helpers/documents.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Slash", key: "SL" }) }));
// Opens a fresh document with the caret on its empty last line.
async function open(page) {
  await openNewDocument(page, app, app.project.id, { body: "Intro paragraph.\n\n" });
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.waitForFunction(async () => {
    const { EditorView } = await import("/vendor/editor/deps.js");
    const view = EditorView.findFromDOM(document.querySelector(".cm-editor"));
    return view.hasFocus && view.state.selection.main.head === view.state.doc.length;
  });
}
const menu = (page) => page.locator(".cm-tooltip-autocomplete");
const options = (page) => menu(page).locator("li[role=option]").evaluateAll((els) => els.map((el) => el.querySelector(".cm-completionLabel")?.textContent));
// Waits until Enter can choose `label`: it is listed first and selected, and CodeMirror's
// interactionDelay (Enter is ignored for 75ms after the list opens) has passed. Nothing in
// the page marks the end of that window, so a short fixed wait after the menu appears covers it.
async function readyToChoose(page, label) {
  const first = menu(page).locator("li[role=option]").first();
  await expect(first.locator(".cm-completionLabel")).toHaveText(label);
  await expect(first).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(100);
}

onDevices(["desktop", "phone"], () => test("typing / opens the insert menu with the Insert panel's elements", async ({ page, device }) => {
  await open(page);
  await page.keyboard.type("/");
  await menu(page).waitFor();
  const labels = await options(page);
  for (const label of ["Heading 1", "Bullet list", "Checklist", "Table", "Code block", "Callout", "Divider", "Attach file"])
    expect(labels, `${label} offered`).toContain(label);
  // Grouped like the Insert panel.
  await expect(menu(page).locator("completion-section").filter({ hasText: "Structure" }), "sections name the groups").not.toHaveCount(0);
  expect(labels.slice(0, 4), "the Insert panel's order, not alphabetical").toEqual(["Heading 1", "Heading 2", "Heading 3", "Bullet list"]);
  const look = await menu(page).locator("li[role=option]").first().evaluate((li) => ({
    height: li.getBoundingClientRect().height, font: getComputedStyle(li).fontFamily, icon: !!li.querySelector("svg"),
    keyIcon: !!li.querySelector(".cm-completionIcon-keyword"),
  }));
  expect(look.height, `rows are menu-control height ${JSON.stringify(look)}`).toBeGreaterThanOrEqual((device === "phone" ? 44 : 28) - 0.5);
  expect(look.font, "the app's font, not the code font").not.toMatch(/monospace/);
  expect(look.icon && !look.keyIcon, `each element shows its Insert panel icon ${JSON.stringify(look)}`).toBe(true);
}));

test("typing after / filters, and Enter inserts the element in place of /query", async ({ page }) => {
  await open(page);
  await page.keyboard.type("/tab");
  await readyToChoose(page, "Table");
  await page.keyboard.press("Enter");
  await expect.poll(() => editorSource(page), "a table is inserted").toMatch(/\|  \|  \|\n\| --- \| --- \|\n\|  \|  \|/);
  expect(await editorSource(page), "the /query is removed").not.toMatch(/\/tab/);
});

test("line elements turn the current line into that element", async ({ page }) => {
  await open(page);
  await page.keyboard.type("/check");
  await readyToChoose(page, "Checklist");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Buy milk");
  await expect.poll(() => editorSource(page)).toMatch(/^- \[ \] Buy milk$/m);
});

onDevices(["phone"], () => test("a tap on a menu item inserts it on touch", async ({ page }) => {
  await open(page);
  await page.keyboard.type("/head");
  await menu(page).waitFor();
  await menu(page).locator("li[role=option]").filter({ hasText: "Heading 2" }).tap();
  await page.keyboard.type("Section");
  await expect.poll(() => editorSource(page)).toMatch(/^## Section$/m);
  await expect(menu(page), "the menu closes after choosing").toHaveCount(0);
}));

test("a / inside a word or link does not open the menu", async ({ page }) => {
  await open(page);
  await page.keyboard.type("see https://example.com/path and and/or");
  // Proving the menu stays closed: it would open within CodeMirror's 100ms typing delay.
  await page.waitForTimeout(400);
  await expect(menu(page)).toHaveCount(0);
});

test("Escape closes the menu and keeps the typed text", async ({ page }) => {
  await open(page);
  await page.keyboard.type("/quo");
  await menu(page).waitFor();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  expect(await editorSource(page)).toMatch(/\/quo$/);
});
