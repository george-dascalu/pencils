// Owner request, 29 October 2026: List Callouts as in the Obsidian plugin
// (github.com/mgmeyers/obsidian-list-callouts). A list item whose text starts with
// ! ? & ~ @ $ or % and a space is tinted and shows an icon; the character stays in
// the Markdown, so the file reads the same in Obsidian.
import { test, expect, useApp } from "../fixtures.mjs";
import { chooseDocumentView, editorSource, openNewDocument } from "../helpers/documents.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Callouts", key: "LC" }) }));
const body = ["- ! Ship on Friday", "- [ ] ? Ask legal", "1. @ Sam owns this", "- plain item", "", "> [!note] keep my Case", "> Body."].join("\n");
const background = (locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor);
const menu = (page) => page.locator(".cm-tooltip-autocomplete");
// A click chooses at once (Enter waits out CodeMirror's interactionDelay after the list opens).
async function choose(page, query, label) {
  await page.keyboard.type(query);
  await menu(page).locator("li[role=option]").filter({ has: page.locator(".cm-completionLabel", { hasText: new RegExp(`^${label}$`) }) }).click();
}

test("list callouts tint their line and show an icon in live preview and reading", async ({ page }) => {
  await openNewDocument(page, app, app.project.id, { body });
  const lines = page.locator(".cm-line.document-list-callout");
  await expect(lines).toHaveCount(3);
  expect(await lines.evaluateAll((els) => els.map((el) => el.dataset.listCallout))).toEqual(["important", "question", "person"]);
  await expect(lines.first().getByRole("img", { name: "Important" })).toBeVisible();
  await expect(lines.first()).not.toContainText("!");
  expect(await background(lines.first()), "the line is tinted").not.toBe(await background(page.locator(".cm-line", { hasText: "plain item" })));
  expect(await editorSource(page), "the Markdown keeps the characters").toBe(body);
  await chooseDocumentView(page, "Reading");
  const items = page.locator(".document-reading li[data-list-callout]");
  await expect(items).toHaveCount(3);
  await expect(items.first().getByRole("img", { name: "Important" })).toBeVisible();
  await expect(items.first()).toHaveText("Ship on Friday", { useInnerText: true });
  await expect(items.nth(1).getByRole("checkbox", { name: "Question: Ask legal" })).toHaveCount(1);
  await expect(items.nth(2).getByRole("img", { name: "Person" })).toBeVisible();
  const colour = (locator) => locator.evaluate((el) => getComputedStyle(el).color);
  expect(await colour(items.first().getByRole("img")), "each callout keeps its own colour").not.toBe(await colour(items.nth(2).getByRole("img")));
  expect(await background(items.first().locator(".document-list-callout"))).not.toBe(await background(items.nth(2).locator(".document-list-callout")));
  // Block callout titles show as typed, as in Obsidian.
  await expect(page.locator(".document-reading .document-callout > strong")).toHaveText("keep my Case");
  await expect(page.locator(".document-reading .document-callout > strong")).toHaveCSS("text-transform", "none");
});

test("editing a quote keeps the list callouts inside it", async ({ page }) => {
  const doc = await openNewDocument(page, app, app.project.id, { body: "> - ! Ship on Friday\n> - plain\n\nAfter." });
  const quote = page.getByRole("textbox", { name: "Quote content", exact: true });
  await expect(quote.getByRole("img", { name: "Important" })).toBeVisible();
  await quote.click();
  await quote.press("Control+End");
  await page.keyboard.type(" now");
  const saved = async () => (await app.store.getDocument(app.project.id, doc.id)).body;
  await expect.poll(saved).toContain("plain now");
  expect(await saved()).toMatch(/^> -\s+! Ship on Friday$/m);
});

test("the / menu offers the list callouts by name", async ({ page }) => {
  await openNewDocument(page, app, app.project.id, { body: "- [ ] Call the bank" });
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await choose(page, " /question", "Question");
  await expect.poll(() => editorSource(page)).toBe("- [ ] ? Call the bank ");
  // A line that is not a list item becomes one.
  await openNewDocument(page, app, app.project.id, { body: "Intro.\n\n" });
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await choose(page, "/cost", "Cost");
  await page.keyboard.type("Hosting");
  await expect.poll(() => editorSource(page)).toBe("Intro.\n\n- $ Hosting");
});
