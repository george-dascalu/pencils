// Find in Reading mode searches the rendered text and stays in Reading: matches
// are case-insensitive and literal, cross inline formatting but not paragraphs,
// open folded callouts and scroll to distant results, and step with Enter,
// Shift+Enter and the arrow buttons. Closing removes every highlight and restores
// the text; Ctrl/Cmd+F reopen with the last query. Live preview and Source keep
// the editor's search. Searching never changes the Markdown or its version.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { axeViolations, noHorizontalScroll, setTheme } from "../helpers/documents.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Reading search" });
  const linked = await store.createDocument(project.id, { title: "Linked note", body: "# Another document" });
  const body = [
    "# Finding your notes", "", "A **formatted** phrase.", "", "ALPHA and alpha.", "", "alpha", "", "Beta", "",
    "Literal `a+b [test]` and CAFÉ.", "", "> [!note]- A folded note", "> Hidden discovery.", "",
    `[[${linked.file.replace(/\.md$/, "")}|Linked note]]`, "",
    ...Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1} with ordinary text.\n`),
    "A distant discovery.",
  ].join("\n");
  const doc = await store.createDocument(project.id, { title: "Finding your notes", body });
  return { project, doc, body };
});
test.afterEach(async () => {
  const saved = await app.store.getDocument(app.project.id, app.doc.id);
  expect(saved.revision, "searching does not save the document").toBe(app.doc.revision);
  expect(saved.body).toBe(app.body);
  expect(saved.version).toBe(app.doc.version);
});

const choose = (page, name) => page.getByRole("button", { name, exact: true }).click();
const input = (page) => page.getByRole("searchbox", { name: "Find in document", exact: true });
const bar = (page) => page.getByRole("search", { name: "Search document", exact: true });
const count = (page) => bar(page).getByRole("status");
const reading = (page) => page.locator(".document-reading");
async function isReading(page) {
  await expect(page.getByRole("button", { name: "Reading", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".document-codemirror")).toBeHidden();
}
// Opens the document in Reading with its search open.
async function openSearch(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
  await choose(page, "Reading");
  await reading(page).waitFor();
  const text = await reading(page).textContent();
  await choose(page, "Find in document");
  await input(page).waitFor();
  return text;
}

test.describe("desktop", () => {
  test.use({ viewportSize: { width: 1500, height: 1000 } });

  test("Reading search finds every case of a word and steps through the matches", async ({ page }) => {
    await openSearch(page);
    await isReading(page);
    await expect(input(page)).toBeFocused();
    await input(page).fill("alpha");
    await expect(count(page)).toHaveText("1 of 3");
    await expect(reading(page).locator(".document-find-match")).toHaveCount(3);
    await bar(page).getByRole("button", { name: "Next match", exact: true }).click();
    await expect(count(page)).toHaveText("2 of 3");
    await input(page).press("Enter");
    await expect(count(page)).toHaveText("3 of 3");
    await input(page).press("Enter");
    await expect(count(page)).toHaveText("1 of 3");
    await input(page).press("Shift+Enter");
    await expect(count(page)).toHaveText("3 of 3");
    await bar(page).getByRole("button", { name: "Previous match", exact: true }).click();
    await expect(count(page)).toHaveText("2 of 3");
  });

  test("matches cross inline formatting and punctuation, but not paragraphs", async ({ page }) => {
    await openSearch(page);
    // The query crosses formatting boundaries without changing those elements.
    await input(page).fill("formatted phrase");
    await expect(count(page)).toHaveText("1 of 1");
    expect((await reading(page).locator(".document-find-current").allTextContents()).join("")).toBe("formatted phrase");
    await expect(reading(page).locator("strong .document-find-current")).not.toHaveCount(0);
    for (const query of ["a+b [test]", "café"]) {
      await input(page).fill(query);
      await expect(count(page), query).toHaveText("1 of 1");
    }
    await input(page).fill("alphaBeta");
    await expect(count(page), "Separate paragraphs must not concatenate").toHaveText("No matches");
    await expect(bar(page).getByRole("button", { name: "Next match", exact: true })).toBeDisabled();
  });

  test("folded and distant matches are revealed and scrolled to", async ({ page }) => {
    await openSearch(page);
    await input(page).fill("discovery");
    await expect(count(page)).toHaveText("1 of 2");
    await expect(reading(page).locator("details")).toHaveAttribute("open", "");
    await input(page).press("Enter");
    await expect.poll(() => reading(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test("clearing and closing remove the highlights, restore the text and return focus", async ({ page }) => {
    const originalText = await openSearch(page);
    await input(page).fill("alpha");
    await expect(count(page)).toHaveText("1 of 3");
    await input(page).fill("");
    await expect(count(page)).toHaveText("");
    await expect(reading(page).locator(".document-find-match")).toHaveCount(0);
    await input(page).fill("alpha");
    await expect(count(page)).toHaveText("1 of 3");
    await page.keyboard.press("Escape");
    await expect(bar(page)).toBeHidden();
    await expect(reading(page).locator(".document-find-match")).toHaveCount(0);
    expect(await reading(page).textContent()).toBe(originalText);
    await expect(page.getByRole("button", { name: "Find in document", exact: true })).toBeFocused();
  });

  test("Ctrl+F and Cmd+F reopen Reading search with the last query", async ({ page }) => {
    await openSearch(page);
    await input(page).fill("alpha");
    await page.keyboard.press("Escape");
    await expect(bar(page)).toBeHidden();
    // Both common shortcut variants stay in Reading and retain the last query.
    for (const shortcut of ["Control+f", "Meta+f"]) {
      await reading(page).focus();
      await page.keyboard.press(shortcut);
      await input(page).waitFor();
      await isReading(page);
      await expect(input(page), shortcut).toHaveValue("alpha");
      await page.getByRole("button", { name: "Close search", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(bar(page)).toBeHidden();
    }
  });

  test("Live preview and Source keep the editor's search, and Reading switches back to its own", async ({ page }) => {
    await openSearch(page);
    for (const mode of ["Live preview", "Source"]) {
      await choose(page, mode);
      await choose(page, "Find in document");
      await page.locator(".cm-search input[name=search]").waitFor();
      await expect(page.getByRole("button", { name: mode, exact: true })).toHaveAttribute("aria-pressed", "true");
      await choose(page, "Reading");
      await expect(page.locator(".cm-search")).toHaveCount(0);
      await choose(page, "Find in document");
      await input(page).fill("formatted phrase");
      await isReading(page);
    }
  });

  test("Reading search passes accessibility checks in both themes", async ({ page }) => {
    await openSearch(page);
    await input(page).fill("formatted phrase");
    await expect(count(page)).toHaveText("1 of 1");
    // Desktop and touch layouts share controls and readable highlights.
    for (const theme of ["light", "dark"]) {
      await setTheme(page, theme);
      expect(await axeViolations(page, [".document-reading-search", ".document-reading"]), theme).toEqual([]);
    }
  });

  test("following a link closes the search", async ({ page }) => {
    await openSearch(page);
    await input(page).fill("formatted phrase");
    await choose(page, "Close search");
    await reading(page).getByRole("link", { name: "Linked note", exact: true }).click();
    await page.getByRole("heading", { name: "Another document", exact: true }).waitFor();
    await expect(bar(page)).toBeHidden();
  });
});

onDevices(["phone"], () => test("on phones Reading search works from the view picker and fits the screen", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
  // Since 0.18.35 narrow editors switch views from the Document view picker.
  const picker = page.locator('[data-document-action="mode-menu"]');
  await picker.tap();
  await page.getByRole("dialog", { name: "Document view", exact: true }).getByRole("button", { name: "Reading", exact: true }).tap();
  await expect(picker).toHaveAttribute("aria-label", "Document view: Reading");
  await page.getByRole("button", { name: "Find in document", exact: true }).tap();
  await input(page).fill("alpha");
  await page.getByRole("button", { name: "Next match", exact: true }).tap();
  await expect(page.locator(".document-find-count")).toHaveText("2 of 3");
  await expect(picker).toHaveAttribute("aria-label", "Document view: Reading");
  await expect(page.locator(".document-codemirror")).toBeHidden();
  expect(await noHorizontalScroll(page)).toBe(true);
  await setTheme(page, "dark");
  expect((await axeViolations(page, [".document-reading-search", ".document-reading"])).map((v) => v.id)).toEqual([]);
  await page.getByRole("button", { name: "Close search", exact: true }).tap();
  await expect(page.locator(".document-reading-search")).toBeHidden();
}));
