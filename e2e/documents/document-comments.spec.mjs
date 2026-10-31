// Owner request, 29 October 2026 (note-taking research, idea 9): comments on document text,
// anchored to the quoted words and kept in the frontmatter, in the shared comments panel.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { documentTool } from "../helpers/documents.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Comments", key: "CM" }) }));
const stored = async (id) => app.store.getDocument(app.project.id, id);

onDevices(["desktop", "phone"], () => test("selected text gets a comment thread, highlighted where it applies", async ({ page, device }) => {
  const doc = await app.store.createDocument(app.project.id, { title: `Notes ${device}`, body: "Alpha beta gamma." });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await page.locator(".cm-content").waitFor();
  await page.evaluate(async () => {
    const { EditorView } = await import("/vendor/editor/deps.js");
    EditorView.findFromDOM(document.querySelector(".cm-editor")).dispatch({ selection: { anchor: 6, head: 10 } });
  });
  if (device === "phone") await page.getByRole("button", { name: "Show formatting", exact: true }).click();
  await page.locator('#document-form [data-document-action="insert"]').click();
  await page.getByRole("button", { name: "Comment on text", exact: true }).click();
  const panel = page.locator(".board-comments");
  await panel.getByRole("textbox", { name: "Comment", exact: true }).fill("Why beta?");
  await panel.getByRole("button", { name: "Add comment", exact: true }).click();
  await expect.poll(async () => (await stored(doc.id)).comments?.map((c) => [c.text, c.anchor?.quote])).toEqual([["Why beta?", "beta"]]);
  expect((await stored(doc.id)).body, "the text itself doesn't change").toBe("Alpha beta gamma.");
  await panel.getByRole("button", { name: "Close comments", exact: true }).click();
  await expect(panel).toHaveCount(0);
  const mark = page.locator(".cm-content .document-comment-mark");
  await expect(mark).toHaveText("beta");
  await mark.click();
  await expect(page.locator(".board-comments .comment-body")).toHaveText("Why beta?");
}));

test("Document tools → Comments lists every thread, including one whose text is gone", async ({ page }) => {
  let doc = await app.store.createDocument(app.project.id, { title: "Detached", body: "Nothing quoted here." });
  doc = await app.store.updateDocument(app.project.id, doc.id, { ...doc, comments: [{ id: "comment-gone", author: "Ana", text: "About the old line", format: "markdown", created: "2026-10-29T10:00:00.000Z", anchor: { quote: "an old line", prefix: "", suffix: "" } }] });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await documentTool(page, "Comments");
  const list = page.getByRole("dialog", { name: "Comments", exact: true });
  await expect(list.locator(".document-panel-item")).toHaveText([/an old line.*Detached · 1 comment$/]);
  await list.getByRole("button", { name: /an old line/ }).click();
  await expect(page.locator(".board-comments .comment-body")).toHaveText("About the old line");
  await expect(page.locator(".board-comments")).toContainText("Detached");
});

test("the panel works like other contextual panels and keeps every comment in its thread", async ({ page }) => {
  const doc = await app.store.createDocument(app.project.id, { title: "Slash", body: "First line\nSecond line" });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await page.locator(".cm-content").waitFor();
  // "/comment" comments on the line it's typed on.
  await page.locator(".cm-line", { hasText: "First line" }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /comment");
  await page.locator(".cm-tooltip-autocomplete li", { hasText: "Comment on text" }).click();
  const panel = page.locator(".board-comments");
  await expect(panel.locator(".document-comment-quote")).toHaveText(/^First line/);
  const send = async (text) => {
    await panel.getByRole("textbox", { name: "Comment", exact: true }).fill(text);
    await panel.getByRole("button", { name: "Add comment", exact: true }).click();
  };
  await send("One");
  await send("Two");
  await expect(panel.locator(".comment-body")).toHaveText(["One", "Two"]);
  await expect.poll(async () => (await stored(doc.id)).comments?.map((c) => [c.text, !!c.anchor, !!c.replyTo])).toEqual([["One", true, false], ["Two", false, true]]);
  // Escape returns to the text; a click in the text closes the panel.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".cm-content")).toBeFocused();
  await page.locator(".cm-content .document-comment-mark").click();
  await expect(panel).toBeVisible();
  await page.locator(".cm-line", { hasText: "Second line" }).click();
  await expect(panel).toHaveCount(0);
  // Comments don't add page versions: each version is listed once.
  await documentTool(page, "Page versions");
  const versions = page.locator(".document-version-list [data-version-index] > span");
  await expect(versions.first()).toContainText("Current");
  const labels = await versions.allTextContents();
  expect(labels.length).toBe(new Set(labels).size);
});
