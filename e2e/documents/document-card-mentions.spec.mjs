// Owner request, 29 October 2026 (note-taking research, idea 1): "[[KEY-12]]" in a document
// shows the card as a chip that opens it, "[[" offers cards as well as documents, and
// "Card from text" turns text into a card linked to the document. Obsidian resolves the
// same links through the cards' aliases.
import { test, expect, useApp } from "../fixtures.mjs";
import { editorSource, openNewDocument } from "../helpers/documents.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Mentions", key: "CM" });
  const login = await store.createTask(project.id, { title: "Fix the login" });
  const report = await store.createTask(project.id, { title: "Quarterly report" });
  return { project, login, report };
});
const chips = (page, scope = ".cm-content") => page.locator(`${scope} .document-card-mention`);
const cards = async () => (await app.store.snapshot(app.project.id)).tasks;
async function caretAtEnd(page) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
}

test("[[KEY]] shows the card as a chip with its status, in live preview and reading, and opens it", async ({ page }) => {
  await app.store.createDocument(app.project.id, { title: "Brief", body: "Scope." });
  await openNewDocument(page, app, app.project.id, { body: `See [[${app.login.key}]] and [[${app.report.key}|the report]], with [[Brief]].` });
  await expect(chips(page)).toHaveCount(2);
  await expect(page.locator(".cm-content a[data-document-ref]:not(.document-card-mention)"), "document links render in Live preview too").toHaveText("Brief");
  await expect(chips(page).first()).toContainText(app.login.key);
  await expect(chips(page).first()).toContainText("Fix the login");
  await expect(chips(page).first().locator(".field-chip-status")).not.toBeEmpty();
  await expect(chips(page).nth(1)).toContainText("the report");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(chips(page, ".document-reading")).toHaveCount(2);
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  const body = await editorSource(page);
  await chips(page).first().click();
  await expect(page.locator("#task-form [name=title]")).toHaveValue("Fix the login");
  expect(await editorSource(page), "following a mention changes nothing").toBe(body);
  await expect(page.locator(".cm-line", { hasText: "[[CM-" }), "the click does not reveal the Markdown").toHaveCount(0);
});

test("[[ offers cards after documents and inserts the card's key", async ({ page }) => {
  await openNewDocument(page, app, app.project.id, { body: "Intro.\n\n" });
  await caretAtEnd(page);
  await page.keyboard.type("[[quarter");
  const option = page.locator(".cm-tooltip-autocomplete li[role=option]").filter({ hasText: "Quarterly report" });
  await expect(option).toContainText("Card");
  await option.click();
  await expect.poll(() => editorSource(page)).toBe(`Intro.\n\n[[${app.report.key}]]`);
});

test("Card from text makes a linked card from the selection or the line", async ({ page }) => {
  const doc = await openNewDocument(page, app, app.project.id, { body: "Actions\n\n- Call the bank about fees\n- Book the venue" });
  await page.evaluate(async () => {
    const { EditorView, EditorSelection } = await import("/vendor/editor/deps.js");
    const view = EditorView.findFromDOM(document.querySelector(".cm-editor"));
    const from = view.state.doc.toString().indexOf("Call the bank");
    view.dispatch({ selection: EditorSelection.range(from, from + "Call the bank".length) });
  });
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("button", { name: "Card from text", exact: true }).click();
  await expect.poll(() => editorSource(page)).toMatch(/^Actions\n\n- \[\[CM-\d+\]\] about fees\n- Book the venue$/);
  const key = (await editorSource(page)).match(/\[\[(CM-\d+)\]\]/)[1];
  const made = (await cards()).find((t) => t.key === key);
  expect(made.title).toBe("Call the bank");
  expect(made.documents, "the card links the document").toEqual([doc.id]);
  await expect(chips(page)).toContainText("Call the bank");
  // With no selection, "/card" uses the current line's text.
  await caretAtEnd(page);
  await page.keyboard.type(" /card");
  await page.locator(".cm-tooltip-autocomplete li[role=option]").filter({ hasText: "Card from text" }).click();
  await expect.poll(() => editorSource(page)).toMatch(/\n- \[\[CM-\d+\]\] ?$/);
  const second = (await editorSource(page)).match(/\[\[(CM-\d+)\]\] ?$/)[1];
  expect((await cards()).find((t) => t.key === second).title).toBe("Book the venue");
});
