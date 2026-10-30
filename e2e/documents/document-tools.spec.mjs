// Owner request, 30 October 2026 (item 20): Document tools group their actions into labelled
// sections instead of one long list.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Tools", key: "TL" });
  return { project, doc: await store.createDocument(project.id, { title: "Grouped", body: "Text\n" }) };
});
const width = /^Use (page|full) width$/;

onDevices(["phone", "desktop"], () => test("Document tools group their actions into labelled sections", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator("#document-form .cm-content").waitFor();
  await page.locator('#document-form [data-document-action="tools"]').click();
  const tools = page.getByRole("dialog", { name: "Document tools" });
  const items = (name) => tools.getByRole("region", { name, exact: true }).getByRole("button");
  await expect(tools.locator(".document-tool-group > h3")).toHaveText(["Document", "View", "History", "Obsidian"]);
  const phone = device === "phone";
  await expect(items("Document")).toHaveText(["Rename", "Move to folder", "Export Markdown", ...(phone ? ["Delete document"] : [])]);
  await expect(items("View")).toHaveText(phone ? ["Document outline", width] : ["Split side by side", "Split top and bottom"]);
  await expect(items("History")).toHaveText(["Undo", "Redo", "Page versions"]);
  await expect(items("Obsidian")).toHaveText(["Open in Obsidian", "Obsidian settings"]);
  // Links and comments follow the groups.
  await expect(tools.getByRole("heading", { name: /^Backlinks/ })).toBeVisible();
  await tools.getByRole("region", { name: "Document" }).getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Rename document" })).toBeVisible();
}));
