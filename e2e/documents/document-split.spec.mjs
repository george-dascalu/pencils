// Owner request, 29 October 2026 (note-taking item 14): on iPad and desktop, open documents as tabs
// and show two at once, side by side or one above the other, each with its own editor and view.
// Phones keep one document at a time.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Split", key: "SP" }) }));
const stored = async (id) => (await app.store.getDocument(app.project.id, id)).body;
const make = (title, body) => app.store.createDocument(app.project.id, { title, body });
async function open(page, doc) {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await page.locator("#document-form .cm-content").waitFor();
}
const tabs = (page) => page.getByRole("navigation", { name: "Open documents" });
const pane = (page) => page.getByRole("region", { name: "Second document" });
async function tool(page, name) {
  await page.locator('#document-form [data-document-action="tools"]').click();
  await page.getByRole("dialog", { name: "Document tools" }).getByRole("button", { name, exact: true }).click();
}

onDevices(["desktop", "ipad"], () => test("documents open as tabs that switch and close", async ({ page, device }) => {
  const a = await make(`Alpha ${device}`, "Alpha text\n"), b = await make(`Beta ${device}`, "Beta text\n");
  await open(page, a);
  await open(page, b);
  const strip = tabs(page), alpha = strip.getByRole("button", { name: a.title, exact: true });
  await expect(strip.getByRole("button", { name: b.title, exact: true })).toHaveAttribute("aria-current", "page");
  await alpha.click();
  await expect(page.locator("#document-form .cm-content")).toContainText("Alpha text");
  await expect(alpha).toHaveAttribute("aria-current", "page");
  await expect(alpha, "focus stays on the tab").toBeFocused();
  if (device === "ipad")
    for (const height of await strip.getByRole("button").evaluateAll(list => list.map(b => b.getBoundingClientRect().height)))
      expect(height, "tabs are 44px touch targets").toBeGreaterThanOrEqual(44);
  await strip.getByRole("button", { name: `Close ${a.title}`, exact: true }).click();
  await expect(alpha).toHaveCount(0);
  await expect(page.locator("#document-form .cm-content")).toContainText("Beta text");
  await page.reload();
  await expect(strip.getByRole("button", { name: b.title, exact: true })).toBeVisible();
  await expect(alpha).toHaveCount(0);
}));

onDevices(["desktop", "ipad"], () => test("a split shows a second document beside or below, with its own view, and saves its edits", async ({ page, device }) => {
  const a = await make(`Left ${device}`, "Left text\n"), b = await make(`Right ${device}`, "Right text\n"), c = await make(`Third ${device}`, "Third text\n");
  await open(page, a);
  await open(page, b);
  await tool(page, "Split side by side");
  const second = pane(page);
  await expect(second.locator(".cm-content")).toContainText("Left text");
  await expect(second.getByRole("combobox", { name: "Document in the second pane" })).toHaveValue(a.id);
  await expect(second.getByRole("combobox", { name: "Document in the second pane" }), "focus moves to the new pane").toBeFocused();
  let [main, other] = [await page.locator(".document-editor").boundingBox(), await second.boundingBox()];
  expect(other.x, "beside the main document").toBeGreaterThanOrEqual(main.x + main.width - 2);
  // Edits in the second pane save to its own document.
  await second.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("Added in the pane");
  await expect.poll(() => stored(a.id)).toContain("Added in the pane");
  expect(await stored(b.id)).toBe("Right text\n");
  // Each pane keeps its own view.
  await second.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(second.locator(".document-reading")).toContainText("Added in the pane");
  await expect(second.locator(".document-codemirror")).toBeHidden();
  await expect(page.locator("#document-form .document-codemirror")).toBeVisible();
  // Swap exchanges the documents and keeps each pane's view.
  await second.getByRole("button", { name: "Swap documents", exact: true }).click();
  await expect(page.locator("#document-form .cm-content")).toContainText("Added in the pane");
  await expect(pane(page).locator(".document-reading")).toContainText("Right text");
  // Opening the second pane's document in the main pane swaps them too, so one document is never shown twice.
  await tabs(page).getByRole("button", { name: b.title, exact: true }).click();
  await expect(page.locator("#document-form .cm-content")).toContainText("Right text");
  await expect(pane(page).locator(".document-reading")).toContainText("Added in the pane");
  await expect(pane(page).getByRole("combobox", { name: "Document in the second pane" }).locator(`option[value="${b.id}"]`)).toHaveCount(0);
  // Top and bottom, remembered after a reload.
  await tool(page, "Split top and bottom");
  await page.reload();
  await expect(pane(page).locator(".document-reading")).toContainText("Added in the pane");
  [main, other] = [await page.locator(".document-editor").boundingBox(), await pane(page).boundingBox()];
  expect(other.y, "below the main document").toBeGreaterThanOrEqual(main.y + main.height - 2);
  await pane(page).getByRole("combobox", { name: "Document in the second pane" }).selectOption(c.id);
  await expect(pane(page).locator(".document-reading")).toContainText("Third text");
  await pane(page).getByRole("button", { name: "Close split", exact: true }).click();
  await expect(pane(page)).toHaveCount(0);
  await page.reload();
  await page.locator("#document-form .cm-content").waitFor();
  await expect(pane(page)).toHaveCount(0);
}));

test("closing the open tab when the next one is in the second pane moves it to the main pane and ends the split", async ({ page }) => {
  const a = await make("Pane doc", "Pane text\n"), b = await make("Main doc", "Main text\n");
  await open(page, a);
  await open(page, b);
  await tool(page, "Split side by side");
  await expect(pane(page).locator(".cm-content")).toContainText("Pane text");
  await tabs(page).getByRole("button", { name: "Close Main doc", exact: true }).click();
  await expect(page.locator("#document-form .cm-content")).toContainText("Pane text");
  await expect(pane(page)).toHaveCount(0);
});

onDevices(["phone"], () => test("phones keep one document at a time", async ({ page }) => {
  const a = await make("Phone one", "One\n"), b = await make("Phone two", "Two\n");
  await open(page, a);
  await open(page, b);
  await expect(tabs(page)).toBeHidden();
  await page.locator('#document-form [data-document-action="tools"]').click();
  const tools = page.getByRole("dialog", { name: "Document tools" });
  await expect(tools.getByRole("button", { name: "Rename", exact: true })).toBeVisible();
  await expect(tools.getByRole("button", { name: "Split side by side", exact: true })).toHaveCount(0);
  await expect(pane(page)).toHaveCount(0);
}));
