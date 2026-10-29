// Owner request, 29 October 2026 (note-taking research, idea 8): properties and tags as
// frontmatter, edited in a Properties section at the top of the document, and #tag in the finder.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const today = new Date().toLocaleDateString("en-CA");
const app = useApp(async (store) => ({ project: await store.createProject({ title: "Properties", key: "PR" }) }));
const stored = async (id) => app.store.getDocument(app.project.id, id);

onDevices(["desktop", "phone"], () => test("properties and tags are edited at the top of the document and saved as frontmatter", async ({ page, device }) => {
  let doc = await app.store.createDocument(app.project.id, { title: `Plan ${device}`, body: "Text" });
  doc = await app.store.updateDocument(app.project.id, doc.id, { revision: doc.revision, document_properties: { set: { status: "Draft" }, tags: ["plans"] } });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  const section = page.locator("#document-form .document-properties");
  await expect(section.locator("summary")).toContainText("#plans");
  await section.locator("summary").click();
  const status = section.getByRole("textbox", { name: "status", exact: true });
  await expect(status).toHaveValue("Draft");
  await status.fill("Final");
  await status.press("Tab");
  await expect.poll(async () => (await stored(doc.id)).status).toBe("Final");
  // A value changed elsewhere since it was shown is not overwritten: the saved one comes back.
  const latest = await stored(doc.id);
  await app.store.updateDocument(app.project.id, doc.id, { revision: latest.revision, document_properties: { set: { status: "From Obsidian" } } });
  await status.fill("Mine");
  await status.press("Tab");
  await expect(page.locator("#toasts")).toContainText("changed in another window or in Obsidian");
  await expect(section.getByRole("textbox", { name: "status", exact: true })).toHaveValue("From Obsidian");
  expect((await stored(doc.id)).status).toBe("From Obsidian");
  await section.getByRole("button", { name: "Add property", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Add property" });
  await panel.getByRole("textbox", { name: "Name", exact: true }).fill("Due");
  await panel.getByRole("combobox", { name: "Type", exact: true }).selectOption("date");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(async () => (await stored(doc.id)).Due).toBe(today);
  await section.getByRole("button", { name: "Remove status", exact: true }).click();
  await expect.poll(async () => (await stored(doc.id)).status).toBeUndefined();
  const tags = section.getByRole("textbox", { name: "Tags", exact: true });
  await tags.fill(`plans, launch-${device}`);
  await tags.press("Tab");
  await expect.poll(async () => (await stored(doc.id)).tags).toEqual(["plans", `launch-${device}`]);
}));

test("the document finder matches #tags", async ({ page }) => {
  const tagged = await app.store.createDocument(app.project.id, { title: "Tagged note", body: "About #harbour things" });
  await app.store.createDocument(app.project.id, { title: "Harbour without tag", body: "harbour" });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${tagged.id}`);
  await page.locator("#document-search").fill("#harbour");
  await expect(page.locator("#document-list [data-document-open]")).toHaveText(["Tagged note"]);
});
