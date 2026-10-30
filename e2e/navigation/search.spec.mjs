// Owner request, 29 October 2026 (Omnisearch): one ranked search across cards, documents and
// boards, with excerpts, query syntax and "Did you mean", from a Search button at every width.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openNewDocument, editorSource } from "../helpers/documents.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Search", key: "SR" });
  await store.createTask(project.id, { title: "Lighthouse review" });
  await store.createDocument(project.id, { title: "Harbour notes", body: "The lighthouse keeper writes daily." });
  await store.createBoard(project.id, { title: "Beacon board" });
  await store.createDocument(project.id, { title: "Markdown showcase", body: "Every element." });
  for (const title of ["Call", "Email"]) await store.createTask(project.id, { title, body: "Ask Thomas first." });
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

// Owner request, 30 October 2026: the suggestion reads as one line on phones, and comes from the
// word you most likely meant (a missed letter keeps the first letter, unlike a different name).
onDevices(["desktop", "phone"], () => test("a misspelt search suggests the likely word on one line", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".topbar .tabs").getByRole("button", { name: "Search", exact: true }).click();
  await page.locator("#global-search-input").fill("Shocas");
  const suggestion = dialog(page).locator(".search-suggestion");
  await expect(suggestion).toHaveText("No results. Did you mean showcase?");
  const [line, link] = [await suggestion.boundingBox(), await suggestion.getByRole("button", { name: "showcase", exact: true }).boundingBox()];
  expect(line.height, `${device}: one line ${JSON.stringify({ line, link })}`).toBeLessThanOrEqual(link.height + 4);
}));

// Owner request, 30 October 2026 (screen recording): the phone search sheet rises in, follows the
// keyboard as it opens and closes instead of jumping, and slides away when closed. Reduced motion
// keeps it still.
onDevices(["phone"], () => test("on phones the search sheet moves smoothly, unless motion is reduced", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" }); // the fixtures reduce motion
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const open = async () => {
    await page.locator(".topbar .tabs").getByRole("button", { name: "Search", exact: true }).click();
    await expect(dialog(page)).toBeVisible();
  };
  await open();
  expect(await dialog(page).evaluate((el) => el.getAnimations().length), "it rises in").toBeGreaterThan(0);
  const moves = await dialog(page).evaluate((el) => getComputedStyle(el).transitionProperty);
  expect(moves, "it follows the keyboard").toMatch(/bottom/);
  expect(moves, "and the room above it").toMatch(/max-height/);
  const leaving = await page.evaluate(() => {
    document.querySelector(".search-dialog-clear").click();
    return !!document.querySelector("dialog.search-dialog");
  });
  expect(leaving, "it slides away before it goes").toBe(true);
  await expect(page.locator("dialog.search-dialog")).toHaveCount(0);
  // Choosing a result opens it at once, while the sheet slides away.
  await open();
  await page.locator("#global-search-input").fill("lighthouse review");
  await dialog(page).locator("#global-search-results .search-result").first().click();
  await expect(page.locator("#task-form [name=title]"), "the chosen card opens").toHaveValue("Lighthouse review");
  await page.locator("[data-action=dialog-close]").first().click();
  await expect(page.locator("dialog.search-dialog"), "only the one copy slid away").toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open();
  expect(await dialog(page).evaluate((el) => el.getAnimations().length), "reduced motion: no animation").toBe(0);
  const gone = await page.evaluate(() => {
    document.querySelector(".search-dialog-clear").click();
    return !document.querySelector("dialog.search-dialog");
  });
  expect(gone, "reduced motion: it closes at once").toBe(true);
}));

// Owner requests, 30 October 2026 (iPad): the search window has no title, the field at its top
// instead, and keeps one size while you type and while results come and go.
onDevices(["desktop", "ipad"], () => test("the search window opens with its field at the top and keeps its size", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".topbar .tabs").getByRole("button", { name: "Search", exact: true }).click();
  const box = dialog(page);
  await expect(box.locator(".dialog-head:visible"), `${device}: no title`).toHaveCount(0);
  const [frame, field] = [await box.boundingBox(), await page.locator("#global-search-input").boundingBox()];
  expect(field.y - frame.y, `${device}: the field is at the top`).toBeLessThanOrEqual(32);
  await expect(box.getByRole("button", { name: "Close search", exact: true }), `${device}: the field's ✕ closes`).toBeVisible();
  const sizes = [frame];
  for (const [text, shown] of [["zzzzqx", /No results/], ["lighthouse", /Lighthouse review/], ["", ""]]) {
    await page.locator("#global-search-input").fill(text);
    await expect(page.locator("#global-search-results")).toHaveText(shown);
    sizes.push(await box.boundingBox());
  }
  for (const size of sizes) expect([size.x, size.y, size.width, size.height], `${device}: one size ${JSON.stringify(sizes)}`).toEqual([frame.x, frame.y, frame.width, frame.height]);
  // With the on-screen keyboard up (the visible part of the screen 360px tall), it fits above it.
  const keyboard = await box.evaluate((el) => {
    el.style.setProperty("--search-height", "360px");
    el.style.setProperty("--search-top", "0px");
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  expect(keyboard.top, `${device}: ${JSON.stringify(keyboard)}`).toBeGreaterThanOrEqual(0);
  expect(keyboard.bottom, `${device}: above the keyboard ${JSON.stringify(keyboard)}`).toBeLessThanOrEqual(360);
  await box.getByRole("button", { name: "Close search", exact: true }).click();
  await expect(box).toHaveCount(0);
}));
