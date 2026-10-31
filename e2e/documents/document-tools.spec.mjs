// Owner requests: 30 October 2026 (item 20), Document tools group their actions; 31 October 2026,
// like Obsidian, the document bar holds only its view toggle, the star and ⋯, and ⋯ is one dense
// list in groups split by dividers (no headings) that holds every other action once. Properties
// show only once a document has some; ⋯ adds the first.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { documentTool } from "../helpers/documents.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Tools", key: "TL" });
  return { project, doc: await store.createDocument(project.id, { title: "Grouped", body: "Text\n" }) };
});
const width = /^Use (page|full) width$/;
const open = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator("#document-form .cm-content").waitFor();
};
const barControls = (page) => page.locator("#document-form .document-heading").evaluate((bar) =>
  [...bar.querySelectorAll("button, a, summary")].filter((el) => !el.closest("#document-formatting") && el.getClientRects().length).map((el) => el.getAttribute("aria-label")));

onDevices(["phone", "ipad", "desktop"], () => test("the document bar holds its view toggle, the star and ⋯, which holds the rest once", async ({ page, device }) => {
  await open(page);
  const phone = device === "phone";
  // iPad puts the star before the title in the top bar; phones keep the formatting behind a toggle.
  expect(await barControls(page), device).toEqual([...(phone ? ["Show formatting"] : []), "Reading view", ...(device === "ipad" ? [] : ["Bookmark"]), "Document tools"]);
  await page.locator('#document-form [data-document-action="tools"]').click();
  const tools = page.getByRole("dialog", { name: "Document tools" });
  await expect(tools.locator("h3"), "dividers, not headings").toHaveCount(0);
  const groups = await tools.locator(".document-tool-group").evaluateAll((list) => list.map((g) => [g.getAttribute("aria-label"), [...g.querySelectorAll("button")].map((b) => b.textContent.trim())]));
  expect(groups.map(([name]) => name)).toEqual(["Document view", "Layout", "Edit", "Document", "History and links", "Files", "Delete"]);
  const items = Object.fromEntries(groups);
  expect(items["Document view"]).toEqual(["Live preview", "Source", "Reading"]);
  expect(items.Layout.slice(0, phone ? 0 : 2)).toEqual(phone ? [] : ["Split side by side", "Split top and bottom"]);
  expect(items.Layout.slice(phone ? 0 : 2)).toEqual([expect.stringMatching(width), "Document outline"]);
  expect(items.Document).toEqual(["Rename", "Move to folder", "Add property"]);
  expect(items.Edit).toEqual(["Undo", "Redo", "Find in document"]);
  expect(items["History and links"]).toEqual(["Page versions", "Backlinks and mentions", "Comments"]);
  expect(items.Files).toEqual(["Export Markdown", "Open in Obsidian", "Obsidian settings"]);
  expect(items.Delete).toEqual(["Delete document"]);
  // Links and comments open their own panels.
  await tools.getByRole("button", { name: "Backlinks and mentions", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Backlinks and mentions" })).toContainText("No documents link here yet.");
  await page.locator('#document-form [data-document-action="tools"]').click();
  await tools.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Rename document" })).toBeVisible();
}));

test("the bar's Reading view toggle switches between reading and editing", async ({ page }) => {
  await open(page);
  const toggle = page.getByRole("button", { name: "Reading view", exact: true });
  await toggle.click();
  await expect(page.locator("#document-form")).toHaveAttribute("data-document-mode", "reading");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(page.locator("#document-form")).toHaveAttribute("data-document-mode", "live");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("Properties show once a document has some, and ⋯ adds the first", async ({ page }) => {
  const doc = await app.store.createDocument(app.project.id, { title: "Bare", body: "Text\n" });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await page.locator("#document-form .cm-content").waitFor();
  const section = page.locator("#document-form .document-properties");
  await expect(section).toBeHidden();
  // Add property shows the section, so its Tags field is reachable even if no property is added.
  await documentTool(page, "Add property");
  const panel = page.getByRole("dialog", { name: "Add property" });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await section.getByRole("textbox", { name: "Tags", exact: true }).fill("plans");
  await section.getByRole("textbox", { name: "Tags", exact: true }).press("Tab");
  await expect.poll(async () => (await app.store.getDocument(app.project.id, doc.id)).tags).toEqual(["plans"]);
  await documentTool(page, "Add property");
  await panel.getByRole("textbox", { name: "Name", exact: true }).fill("Owner");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(async () => (await app.store.getDocument(app.project.id, doc.id)).Owner).toBe("");
  await expect(section.locator('[data-property="Owner"] input'), "focus moves on to the new property").toBeFocused();
});
