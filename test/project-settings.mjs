import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";
import { settingsPages } from "../public/project-settings.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-settings-"));
const notes = await fs.mkdtemp(
  path.join(os.tmpdir(), "pencils-settings-notes-"),
);
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Settings project" });
await store.createTask(project.id, { title: "Existing task" });
await fs.writeFile(
  path.join(notes, "one.md"),
  "---\nid: note-1\ntitle: External note\n---\nNotes.",
);
const server = createServer(store, {
  auth: new Auth(store, "local", "George"),
  sources: { env: { OBSIDIAN_ROOT: notes } },
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await { chromium, firefox, webkit }[
  process.env.BROWSER || "chromium"
].launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = `http://127.0.0.1:${server.address().port}`;
const hash = (section, detail = "") =>
  `#project/${project.id}/settings/${section}${detail ? `/${detail}` : ""}`;
async function section(id) {
  const mobile = page.locator("#settings-section-select");
  if (await mobile.isVisible()) await mobile.selectOption(id);
  else
    await page
      .locator(`.settings-navigation [data-settings-section="${id}"]`)
      .click();
  await page.waitForFunction((h) => location.hash === h, hash(id));
  await page.locator(".settings-loading").waitFor({ state: "detached" });
}
async function save() {
  await page.locator('#settings-panel [type="submit"]').click();
  await page.getByText("Changes saved", { exact: true }).waitFor();
}
try {
  await page.goto(`${base}/#project/${project.id}/list`);
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await page.locator('#project-form [name="title"]').waitFor();
  assert.equal(new URL(page.url()).hash, hash("general"));
  assert.equal(
    await page.locator(".project-settings-tools, dialog").count(),
    0,
  );
  assert.equal(
    await page.locator(".settings-navigation a").count(),
    settingsPages.length,
  );
  assert.equal(
    await page
      .locator(".settings-navigation")
      .getByText("Templates", { exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.locator(".workflow-editor").count(),
    0,
    "No workflow duplicated on General",
  );

  const initial = (await store.snapshot(project.id)).project;
  await page.locator('#project-form [name="title"]').fill("Renamed project");
  page.once("dialog", (d) => d.dismiss());
  await page.locator('[data-settings-section="workflow"]').click();
  assert.equal(new URL(page.url()).hash, hash("general"));
  assert.equal(
    await page.locator('#project-form [name="title"]').inputValue(),
    "Renamed project",
  );
  await save();
  const saved = (await store.snapshot(project.id)).project;
  assert.equal(saved.title, "Renamed project");
  assert.deepEqual(
    saved.schema,
    initial.schema,
    "General save preserves the workflow",
  );
  assert.deepEqual(saved.teams, initial.teams);
  assert.equal(
    new URL(page.url()).hash,
    hash("general"),
    "Save stays on the page",
  );

  // Browser Back uses the same unsaved-change guard as the sidebar.
  await section("teams");
  await section("general");
  await page
    .locator('#project-form [name="title"]')
    .fill("Keep this unsaved name");
  page.once("dialog", (d) => d.dismiss());
  await page.goBack();
  await page.waitForFunction((h) => location.hash === h, hash("general"));
  assert.equal(
    await page.locator('#project-form [name="title"]').inputValue(),
    "Keep this unsaved name",
  );
  await page.locator("[data-settings-discard]").click();
  await page.waitForFunction(
    () =>
      document.querySelector('#project-form [name="title"]')?.value ===
      "Renamed project",
  );

  await section("workflow");
  assert.equal(await page.locator(".hierarchy-editor").isVisible(), false);
  await page
    .locator('[data-workflow-status="todo"] [data-status-name]')
    .fill("Ready");
  await save();
  assert.equal(
    (await store.snapshot(project.id)).project.schema.status_labels.todo,
    "Ready",
  );
  await section("hierarchy");
  assert.equal(
    await page.locator("[data-workflow-section]").isVisible(),
    false,
  );
  await page
    .locator('#workflow-form [name="types"]')
    .fill("epic, milestone, story, task, bug, idea");
  await page.locator('#workflow-form [name="types"]').blur();
  await save();
  assert.ok(
    (await store.snapshot(project.id)).project.schema.types.includes("idea"),
  );
  assert.equal(
    (await store.snapshot(project.id)).project.schema.status_labels.todo,
    "Ready",
  );

  await section("fields");
  await page.locator("[data-settings-add-field]").click();
  await page.locator("[data-field-name]").fill("Release train");
  await page.locator("[data-field-type]").selectOption("select");
  await page.locator("[data-field-options]").fill("Alpha\nBeta");
  await save();
  assert.deepEqual(
    (await store.snapshot(project.id)).project.schema.fields[0].options,
    ["Alpha", "Beta"],
  );
  await section("teams");
  await page.locator("[data-settings-assignees]").waitFor();
  await save();
  assert.equal(
    (await store.snapshot(project.id)).project.schema.fields[0].name,
    "Release train",
  );
  await page.goBack();
  await page.waitForFunction((h) => location.hash === h, hash("fields"));
  await page.reload();
  await page.locator("[data-field-name]").waitFor();
  assert.equal(
    await page.locator("[data-field-name]").inputValue(),
    "Release train",
  );

  await section("sources");
  await page.locator('[data-source-action="new"]').click();
  await page.waitForFunction(
    (h) => location.hash === h,
    hash("sources", "new"),
  );
  assert.equal(await page.locator("dialog").count(), 0);
  await page.locator('#source-config [name="name"]').fill("Obsidian notes");
  await page.locator('#source-config [type="submit"]').click();
  await page.locator('[data-source-action="sync"]').waitFor();
  await page.locator('[data-source-action="sync"]').click();
  await page.getByText(/Up to date · 1 records/).waitFor();
  await page.locator('[data-source-action="edit"]').click();
  await page.locator("#source-config").waitFor();
  const editUrl = page.url();
  await page.reload();
  await page.locator("#source-config").waitFor();
  assert.equal(page.url(), editUrl);
  assert.equal(
    await page.locator('#source-config [name="name"]').inputValue(),
    "Obsidian notes",
  );
  await page.locator("[data-settings-parent]").click();

  await section("import");
  await page
    .locator('#settings-import [name="notes"]')
    .setInputFiles({
      name: "Local note.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Imported locally\nA note."),
    });
  await page.getByText("1 note selected", { exact: true }).waitFor();
  const before = (await store.snapshot(project.id)).tasks.length;
  await page.locator('#settings-import [type="submit"]').click();
  await page.getByText("Imported 1 note as a task.", { exact: true }).waitFor();
  assert.equal((await store.snapshot(project.id)).tasks.length, before + 1);

  await section("automation");
  await page.locator('[data-automation="add"]').click();
  await page.locator('#automation-form [name="name"]').fill("Important tasks");
  await page.locator('#automation-form [name="value"]').selectOption("high");
  await page.locator("#automation-form .dialog-foot button:last-child").click();
  await page.locator('[data-automation="preview"]').waitFor();
  assert.equal(await page.locator("dialog").count(), 0);
  await page.locator('[data-automation="edit"]').click();
  await page.locator('#automation-form [name="name"]').fill("Updated rule");
  await page.locator('#automation-form [name="value"]').selectOption("urgent");
  await page.locator('#automation-form [type="submit"]').click();
  await page
    .getByRole("heading", { name: "Updated rule", exact: true })
    .waitFor();
  assert.equal(await page.locator('[data-automation="edit"]').count(), 1);
  await page.locator('[data-automation="toggle"]').click();
  await page.getByRole("button", { name: "Disable", exact: true }).waitFor();
  await page.locator('[data-automation="preview"]').click();
  await page.locator("#automation-apply").click();
  await page.locator("dialog").waitFor({ state: "detached" });
  assert.ok(
    (await store.snapshot(project.id)).tasks
      .filter((t) => !t.source)
      .every((t) => t.priority === "urgent"),
  );
  await section("diagnostics");
  await page.locator("[data-settings-rebuild]").click();
  await page.getByText("Search index rebuilt.", { exact: true }).waitFor();

  // A stale page must not overwrite a concurrent project edit.
  await section("general");
  await page.locator('#project-form [name="title"]').fill("Unsaved change");
  const fresh = (await store.snapshot(project.id)).project;
  await store.updateProject(project.id, {
    revision: fresh.revision,
    body: "Changed outside this browser",
  });
  await page.locator('#project-form [type="submit"]').click();
  await page.locator("#project-form .form-error:not(.hidden)").waitFor();
  assert.equal(
    (await store.snapshot(project.id)).project.body,
    "Changed outside this browser",
  );
  await page.locator("[data-settings-discard]").click();
  await page.reload();
  await page.locator("#project-form").waitFor();

  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => window.PencilsAppearance.write({ theme: t }),
        theme,
      );
      for (const [id] of settingsPages) {
        await section(id);
        assert.equal(
          await page.locator("dialog").count(),
          0,
          `${id} is a page`,
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${id}: no horizontal page overflow at ${width}`,
        );
        if (process.env.SETTINGS_A11Y === "1") {
          const result = await new AxeBuilder({ page })
            .include(".project-settings-layout")
            .analyze();
          assert.deepEqual(
            result.violations.map(
              (v) =>
                `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
            ),
            [],
            `${id}: accessible settings`,
          );
        }
      }
      await section("general");
      await page.screenshot({
        path: `/tmp/pencils-settings-${process.env.BROWSER || "chromium"}-${width}-${theme}.png`,
      });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: settings navigation and history, isolated saves, conflict/dirty protection, workflow/hierarchy/fields, sources and sync, import, automation, diagnostics, desktop/mobile and both themes.",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-settings-failure.png" });
  console.error({ errors });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await store.queue;
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(notes, { recursive: true, force: true });
}
