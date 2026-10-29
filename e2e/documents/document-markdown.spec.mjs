// Documents are the project's Markdown files, edited without loss: changing
// modes never rewrites the file, checklists change only their marker, and
// Reading mode renders Obsidian-style Markdown (callouts, tables, highlights,
// footnotes, math, Mermaid, links and embeds) while dropping scripts, unsafe
// links and app controls. Also covers Open in Obsidian, the outline, links and
// backlinks, attachments, and accessibility at desktop and phone widths.
import { test, expect, useApp } from "../fixtures.mjs";
import { axeViolations, documentName, noHorizontalScroll, setTheme } from "../helpers/documents.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Markdown workspace" });
  const target = await store.createDocument(project.id, { title: "Linked note", body: "# Linked note\n\n## Details\n\nEmbedded text.\n" });
  return { project, target };
});
const markdown = (target) => [
  "# Project notebook", "", "## Formatting", "",
  "**Bold** and _italic_, ~~struck~~, ==highlighted==, `inline code`.", "",
  "- [ ] Review the document", "- [x] Keep Markdown", "",
  "> [!note]+ Remember", "> This is a **callout**.", "",
  "| Name | State |", "| :--- | ---: |", "| Editor | Ready |", "",
  "A footnote[^one] and math $x^2 + y^2$.", "", "[^one]: Footnote details.", "",
  "$$", "\\frac{a}{b}", "$$", "",
  `[[${target.file.replace(/\.md$/, "")}|Linked note]]`, "",
  `![[${target.file.replace(/\.md$/, "")}#Details]]`, "",
  "%%Private comment stays in the Markdown.%%", "",
  "```mermaid", "flowchart LR", "  Write --> Read", "```", "",
  "```javascript", "const preserved = '**not bold**';", "```", "",
  "<script>window.documentAttack=true</script>", "",
  '<button data-document-action="delete" data-action="project-delete">Untrusted control</button>', "",
  "[Unsafe](javascript:alert(1))", "",
].join("\n");
test.use({ viewportSize: { width: 1440, height: 1000 } });
test.beforeEach(({ page }) => page.setDefaultTimeout(15000));

// Each test opens its own notebook; titles differ so backlinks can be told apart.
let opened = 0;
async function open(page) {
  const body = markdown(app.target);
  const record = await app.store.createDocument(app.project.id, { title: `Project notebook ${++opened}-${test.info().repeatEachIndex}-${test.info().retry}`, body });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);
  await page.locator(".cm-content").waitFor();
  const saved = async () => (await app.store.getDocument(app.project.id, record.id)).body;
  return { record, body, saved };
}
const mode = async (page, name) => {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
};
// Since 0.19.31 the open document's name shows in the top bar instead of a title field.
const title = documentName;

test("changing modes never rewrites the Markdown", async ({ page }) => {
  const { body, saved } = await open(page);
  for (const name of ["Source", "Reading", "Live preview", "Source", "Live preview"]) {
    await mode(page, name);
    expect(await saved(), `Changing modes must never rewrite Markdown (${name}).`).toBe(body);
  }
});

test("ticking a checklist item changes only its marker, and Undo restores it", async ({ page }) => {
  const { body, saved } = await open(page);
  await page.getByRole("checkbox", { name: "Review the document", exact: true }).check();
  await expect.poll(saved).toContain("- [x] Review the document");
  expect(await saved()).toBe(body.replace("- [ ] Review", "- [x] Review"));
  await page.getByRole("button", { name: "Document tools", exact: true }).click();
  await page.locator('[data-document-format="undo"]').click();
  await expect.poll(saved).toBe(body);
});

test("Reading renders callouts, tables, math, footnotes, embeds and diagrams, without unsafe content", async ({ page }) => {
  const { body, saved } = await open(page);
  await mode(page, "Reading");
  const reading = page.locator(".document-reading");
  await expect(reading.locator("mark")).toBeVisible();
  await expect(reading.locator("table")).toBeVisible();
  await expect(reading.locator(".document-callout")).toBeVisible();
  await expect(reading.locator("math")).toHaveCount(2);
  await expect(reading).toContainText("Footnote details");
  await expect(reading).toContainText("Embedded text");
  await expect(reading.locator(".document-transclusion")).toContainText("Embedded text");
  expect(await reading.innerText()).not.toMatch(/Private comment/);
  await expect(reading.locator("script,a[href^='javascript:']")).toHaveCount(0);
  await expect(reading.locator("[data-document-action],[data-action]")).toHaveCount(0);
  expect(await page.evaluate(() => window.documentAttack)).toBeUndefined();
  await reading.locator("[data-document-diagram] svg").waitFor();
  expect(await saved()).toBe(body);
});

test("rendered Markdown passes accessibility checks at desktop and phone widths in both themes", async ({ page }) => {
  await open(page);
  await mode(page, "Reading");
  await page.locator(".document-reading [data-document-diagram] svg").waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await setTheme(page, theme);
      expect(await noHorizontalScroll(page), `${width} ${theme} fits`).toBe(true);
      expect(await axeViolations(page, ".documents-workspace"), `${width} ${theme}`).toEqual([]);
    }
  }
});

test("Open in Obsidian uses the saved vault name and file, after a reload too", async ({ page }) => {
  const { record } = await open(page);
  const link = page.getByRole("link", { name: "Open in Obsidian", exact: true });
  await link.click();
  await page.getByLabel("Obsidian vault name", { exact: true }).fill("Work & notes");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(link).toHaveAttribute("href", /^obsidian:/);
  const uri = new URL(await link.getAttribute("href"));
  expect(uri.protocol).toBe("obsidian:");
  expect(uri.searchParams.get("vault")).toBe("Work & notes");
  expect(uri.searchParams.get("file")).toBe(record.file);
  await page.reload();
  await page.locator("#document-form").waitFor();
  await expect(link).toHaveAttribute("href", uri.href);
});

test("the outline, search, links and backlinks navigate without changing the file", async ({ page }) => {
  const { record, body, saved } = await open(page);
  // Outline jumps into source-backed editing; it never changes the file.
  await page.getByRole("button", { name: "Document outline", exact: true }).click();
  await page.getByRole("button", { name: "Formatting", exact: true }).click();
  await expect(page.getByRole("button", { name: "Live preview", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Find in document", exact: true }).click();
  await page.locator(".cm-search input[name=search]").fill("callout");
  await page.keyboard.press("Escape");
  await mode(page, "Reading");
  await page.locator(".document-reading [data-document-ref]").first().click();
  await expect(title(page)).toHaveText(app.target.title);
  await page.getByRole("button", { name: "Document tools", exact: true }).click();
  await page.getByRole("dialog", { name: "Document tools" }).getByRole("button", { name: record.title, exact: true }).click();
  await expect(title(page)).toHaveText(record.title);
  expect(await saved()).toBe(body);
});

test("attaching a file inserts a relative Markdown link", async ({ page }) => {
  const { saved } = await open(page);
  await page.locator("#document-attachment").setInputFiles({ name: "Notes.txt", mimeType: "text/plain", buffer: Buffer.from("Local attachment.") });
  await expect.poll(saved).toMatch(/\[Notes\.txt\]\(\.\.\/attachments\/a-[\w-]+\.txt\)/);
});
