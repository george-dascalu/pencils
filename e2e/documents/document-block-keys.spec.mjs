// Bug found 28 October 2026: Ctrl+End inside a document code block sent the
// next typing to the start of the document. Ctrl/Cmd+Home/End (and Cmd+Up/Down
// on Mac) now move within the block being edited; Shift extends the selection.
import { test, expect, useApp } from "../fixtures.mjs";
import { editorSource, openNewDocument } from "../helpers/documents.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Keys", key: "BK" }) }));
const body = "# Keys\n\nIntro.\n\n```js\nlet a = 1;\nlet b = 2;\n```\n\n| A | B |\n| --- | --- |\n| one | two |\n";
const open = (page) => openNewDocument(page, app, app.project.id, { body, waitFor: ".document-codemirror pre code" });

test("Ctrl+End and Ctrl+Home stay inside a code block", async ({ page }) => {
  await open(page);
  await page.locator(".document-codemirror pre code").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("X");
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("Y");
  await expect.poll(() => editorSource(page)).toMatch(/```js\nYlet a = 1;\nlet b = 2;X\n```/);
  expect(await editorSource(page), "the start of the document is untouched").toMatch(/^# Keys/);
});

test("Ctrl+Shift+End selects to the end of the block", async ({ page }) => {
  await open(page);
  await page.locator(".document-codemirror pre code").click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+Shift+End");
  await page.keyboard.type("Z");
  await expect.poll(() => editorSource(page)).toMatch(/```js\nZ\n```/);
});

test("Ctrl+End stays inside a table cell", async ({ page }) => {
  await open(page);
  await page.locator(".document-codemirror table td").first().click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("!");
  await expect.poll(() => editorSource(page)).toMatch(/\| one! \| two \|/);
  expect(await editorSource(page)).toMatch(/^# Keys/);
});
