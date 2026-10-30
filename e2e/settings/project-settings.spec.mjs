// Project settings are pages, not dialogs (AGENTS.md: dialogs only for major workflows):
// one page per section with history and deep links, saves that touch only their own section,
// an unsaved-change guard on the sidebar and browser Back, conflict protection against
// concurrent edits, and every page laid out without overflow on desktop and phones in both
// themes. Set SETTINGS_A11Y=1 to add axe checks of every page.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { showSettingsSection, openSettingsPage } from "../helpers/menu-controls.mjs";
import { Auth } from "../../server/auth.js";
import { settingsPages } from "../../public/project-settings.js";

const app = useCustomApp({
  seed: async (store, app) => {
    const notes = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-settings-notes-"));
    app.cleanup.push(notes);
    await fs.writeFile(path.join(notes, "one.md"), "---\nid: note-1\ntitle: External note\n---\nNotes.");
    const project = await store.createProject({ title: "Settings project" });
    await store.createTask(project.id, { title: "Existing task" });
    return { project, notes };
  },
  server: (store, app) => ({ auth: new Auth(store, "local", "George"), sources: { env: { OBSIDIAN_ROOT: app.notes } } }),
});
test.use({ viewportSize: { width: 1600, height: 1000 } });

const hash = (section, detail = "") => `#project/${app.project.id}/settings/${section}${detail ? `/${detail}` : ""}`;
const atHash = (page, h) => page.waitForFunction((h) => location.hash === h, h);
const snapshot = () => app.store.snapshot(app.project.id);
async function open(page, id = "general") {
  await page.goto(`${app.base}/${hash(id)}`);
  await page.locator(".settings-loading").waitFor({ state: "detached" });
}
async function section(page, id) {
  await showSettingsSection(page, id);
  await atHash(page, hash(id));
}
async function save(page) {
  await page.locator('#settings-panel [type="submit"]').click();
  await page.getByText("Changes saved", { exact: true }).waitFor();
}
const title = (page) => page.locator('#project-form [name="title"]');

test("Project settings opens on General as a page, and saving General keeps the workflow and teams", { tag: "@gate" }, async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  // Since 0.19.31 one Settings button in the top bar opens the Settings page on the project's General.
  await openSettingsPage(page);
  await title(page).waitFor();
  expect(new URL(page.url()).hash).toBe(hash("general"));
  await expect(page.locator(".project-settings-tools, dialog")).toHaveCount(0);
  await expect(page.locator(".settings-navigation a")).toHaveCount(settingsPages.length);
  await expect(page.locator(".settings-navigation").getByText("Templates", { exact: true })).toHaveCount(0);
  await expect(page.locator(".workflow-editor"), "No workflow duplicated on General").toHaveCount(0);

  const initial = (await snapshot()).project;
  await title(page).fill("Renamed project");
  // Leaving with unsaved changes asks first; dismissing stays on the page with the edit.
  page.once("dialog", (d) => d.dismiss());
  await page.locator('[data-settings-section="workflow"]').click();
  expect(new URL(page.url()).hash).toBe(hash("general"));
  await expect(title(page)).toHaveValue("Renamed project");
  await save(page);
  const saved = (await snapshot()).project;
  expect(saved.title).toBe("Renamed project");
  expect(saved.schema, "General save preserves the workflow").toEqual(initial.schema);
  expect(saved.teams).toEqual(initial.teams);
  expect(new URL(page.url()).hash, "Save stays on the page").toBe(hash("general"));
});

test("browser Back uses the same unsaved-change guard, and Discard restores the saved values", { tag: "@gate" }, async ({ page }) => {
  await open(page, "teams");
  await section(page, "general");
  const savedTitle = (await snapshot()).project.title;
  await expect(title(page)).toHaveValue(savedTitle);
  await title(page).fill("Keep this unsaved name");
  page.once("dialog", (d) => d.dismiss());
  await page.goBack();
  await atHash(page, hash("general"));
  await expect(title(page)).toHaveValue("Keep this unsaved name");
  await page.locator("[data-settings-discard]").click();
  await expect(title(page)).toHaveValue(savedTitle);
});

test("Workflow and Hierarchy save separately without overwriting each other", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await section(page, "workflow");
  await expect(page.locator(".hierarchy-editor")).toBeHidden();
  await page.locator('[data-workflow-status="todo"] [data-status-name]').fill("Ready");
  await save(page);
  expect((await snapshot()).project.schema.status_labels.todo).toBe("Ready");
  await section(page, "hierarchy");
  await expect(page.locator("[data-workflow-section]")).toBeHidden();
  await page.locator("#workflow-form [data-type-input]").fill("idea");
  await page.locator("#workflow-form [data-type-add]").click();
  await save(page);
  const schema = (await snapshot()).project.schema;
  expect(schema.types).toContain("idea");
  expect(schema.status_labels.todo).toBe("Ready");
});

test("a custom field survives saving another page, Back and a reload", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await section(page, "fields");
  await page.locator("[data-settings-add-field]").click();
  await page.locator("[data-field-name]").fill("Release train");
  await page.locator("[data-field-type]").selectOption("select");
  await page.locator("[data-field-options]").fill("Alpha\nBeta");
  await save(page);
  expect((await snapshot()).project.schema.fields[0].options).toEqual(["Alpha", "Beta"]);
  await section(page, "teams");
  await page.locator("[data-settings-assignees]").waitFor();
  await save(page);
  expect((await snapshot()).project.schema.fields[0].name).toBe("Release train");
  await page.goBack();
  await atHash(page, hash("fields"));
  await page.reload();
  await expect(page.locator("[data-field-name]")).toHaveValue("Release train");
});

test("an Obsidian source is set up on its own page, syncs, and its edit page survives a reload", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await section(page, "sources");
  await page.locator('[data-source-action="new"]').click();
  await atHash(page, hash("sources", "new"));
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.locator('#source-config [name="name"]').fill("Obsidian notes");
  await page.locator('#source-config [type="submit"]').click();
  await page.locator('[data-source-action="sync"]').click();
  await expect(page.getByText(/Up to date · 1 records/)).toBeVisible();
  await page.locator('[data-source-action="edit"]').click();
  await page.locator("#source-config").waitFor();
  const editUrl = page.url();
  await page.reload();
  await page.locator("#source-config").waitFor();
  expect(page.url()).toBe(editUrl);
  await expect(page.locator('#source-config [name="name"]')).toHaveValue("Obsidian notes");
  await page.locator("[data-settings-parent]").click();
  await atHash(page, hash("sources"));
});

test("Import turns a local Markdown note into a task", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await section(page, "import");
  await page.locator('#settings-import [name="notes"]').setInputFiles({ name: "Local note.md", mimeType: "text/markdown", buffer: Buffer.from("# Imported locally\nA note.") });
  await expect(page.getByText("1 note selected", { exact: true })).toBeVisible();
  const before = (await snapshot()).tasks.length;
  await page.locator('#settings-import [type="submit"]').click();
  await expect(page.getByText("Imported 1 note as a task.", { exact: true })).toBeVisible();
  expect((await snapshot()).tasks.length).toBe(before + 1);
});

test("automation rules are added, edited, enabled and applied on the page", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await section(page, "automation");
  await page.locator('[data-automation="add"]').click();
  await page.locator('#automation-form [name="name"]').fill("Important tasks");
  await page.locator('#automation-form [name="value"]').selectOption("high");
  await page.locator("#automation-form .dialog-foot button:last-child").click();
  await page.locator('[data-automation="preview"]').waitFor();
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.locator('[data-automation="edit"]').click();
  await page.locator('#automation-form [name="name"]').fill("Updated rule");
  await page.locator('#automation-form [name="value"]').selectOption("urgent");
  await page.locator('#automation-form [type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Updated rule", exact: true })).toBeVisible();
  await expect(page.locator('[data-automation="edit"]')).toHaveCount(1);
  await page.locator('[data-automation="toggle"]').click();
  await expect(page.getByRole("button", { name: "Disable", exact: true })).toBeVisible();
  await page.locator('[data-automation="preview"]').click();
  await page.locator("#automation-apply").click();
  await page.locator("dialog").waitFor({ state: "detached" });
  const tasks = (await snapshot()).tasks.filter((t) => !t.source);
  expect(tasks.length).toBeGreaterThan(0);
  expect(tasks.filter((t) => t.priority !== "urgent")).toEqual([]);
});

test("Diagnostics rebuilds the search index", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await section(page, "diagnostics");
  await page.locator("[data-settings-rebuild]").click();
  await expect(page.getByText("Search index rebuilt.", { exact: true })).toBeVisible();
});

test("a stale settings page does not overwrite a concurrent project edit", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await title(page).fill("Unsaved change");
  const fresh = (await snapshot()).project;
  await app.store.updateProject(app.project.id, { revision: fresh.revision, body: "Changed outside this browser" });
  await page.locator('#project-form [type="submit"]').click();
  await page.locator("#project-form .form-error:not(.hidden)").waitFor();
  expect((await snapshot()).project.body).toBe("Changed outside this browser");
  expect((await snapshot()).project.title).toBe(fresh.title);
  await page.locator("[data-settings-discard]").click();
  await page.reload();
  await page.locator("#project-form").waitFor();
});

for (const width of [1600, 390]) {
  test.describe(`${width}px wide`, () => {
    test.use({ viewportSize: { width, height: 1000 } });

    test("every settings section is a page without horizontal overflow in both themes", { tag: "@gate" }, async ({ page }) => {
      await open(page);
      for (const theme of ["light", "dark"]) {
        await page.evaluate((t) => window.PencilsAppearance.write({ theme: t }), theme);
        for (const [id] of settingsPages) {
          await section(page, id);
          await expect(page.locator("dialog"), `${id} is a page`).toHaveCount(0);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id}: no horizontal page overflow at ${width}`).toBe(true);
          if (process.env.SETTINGS_A11Y === "1") {
            const result = await new AxeBuilder({ page }).include(".project-settings-layout").analyze();
            expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), `${id}: accessible settings`).toEqual([]);
          }
        }
        await section(page, "general");
      }
    });
  });
}
