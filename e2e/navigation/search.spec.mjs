// Owner request, 29 October 2026 (Omnisearch): one ranked search across cards, documents and
// boards, with excerpts, query syntax and "Did you mean", from a Search button at every width.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openNewDocument, editorSource } from "../helpers/documents.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Search", key: "SR" });
  await store.createTask(project.id, { title: "Lighthouse review" });
  await store.createDocument(project.id, { title: "Harbour notes", body: "The lighthouse keeper writes daily." });
  await store.createBoard(project.id, { title: "Beacon board" });
  return { project };
});
const dialog = (page) => page.locator("dialog[open]");

onDevices(["desktop", "ipad"], () => test("the top bar's Search finds cards and documents, ranked, with highlighted excerpts", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".topbar .tabs").getByRole("button", { name: "Search", exact: true }).click();
  await page.locator("#global-search-input").fill("lighthouse");
  const results = dialog(page).locator("#global-search-results .search-result");
  await expect(results).toHaveCount(2);
  await expect(results.first()).toContainText("Lighthouse review");
  await expect(results.nth(1).locator("mark")).toHaveText("lighthouse");
  await page.locator("#global-search-input").fill("lighthouse in:docs");
  await expect(results).toHaveCount(1);
  await page.locator("#global-search-input").fill("lighthuose");
  await dialog(page).getByRole("button", { name: "lighthouse", exact: true }).click();
  await expect(page.locator("#global-search-input")).toHaveValue("lighthouse");
  await expect(results).toHaveCount(2);
}));

test("Alt+Enter links the chosen result into the open document", async ({ page }) => {
  await openNewDocument(page, app, app.project.id, { title: "Log", body: "See " });
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Control+k");
  await expect.poll(() => editorSource(page), "in a document, Ctrl/⌘ K makes a link, as in Obsidian").toBe("See [text](https://)");
  await expect(dialog(page), "and doesn't open search too").toHaveCount(0);
  await page.keyboard.press("Control+z");
  await page.locator(".topbar .tabs").getByRole("button", { name: "Search", exact: true }).click();
  await page.locator("#global-search-input").fill("lighthouse review");
  await expect(dialog(page).locator("#global-search-results .search-result")).toHaveCount(1);
  await page.keyboard.press("Alt+Enter");
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => editorSource(page)).toBe("See [[SR-1]]");
  // Pencils can't follow a link to a board, so Alt+Enter says so instead.
  await page.locator(".topbar .tabs").getByRole("button", { name: "Search", exact: true }).click();
  await page.locator("#global-search-input").fill("beacon");
  await expect(dialog(page).locator("#global-search-results .search-result")).toHaveCount(1);
  await page.keyboard.press("Alt+Enter");
  await expect(page.locator("#toasts")).toContainText("Alt+Enter links cards and documents of this project.");
  expect(await editorSource(page)).toBe("See [[SR-1]]");
});

// Owner report, 30 October 2026: on phones, scrolling the search popup also scrolled the page
// behind it. Popups keep their scrolling to themselves.
onDevices(["phone"], () => test("on phones the search popup keeps its scrolling to itself", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".topbar .tabs").getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog(page)).toHaveCSS("overscroll-behavior-y", "contain");
}));
