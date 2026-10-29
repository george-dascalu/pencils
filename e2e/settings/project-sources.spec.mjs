// Project data sources with required sign-in (README "Integration setup"): a signed-in
// administrator sets up an Obsidian source from Project settings, previews it without changing
// tasks, and syncs it. Imported tasks keep provider fields read-only, show the source
// description separately, accept local annotations, and the task editor fits desktop and phone.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { selectSettingsPage } from "../helpers/menu-controls.mjs";
import { Auth } from "../../server/auth.js";

const app = useCustomApp({
  seed: async (store, app) => {
    const notes = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-source-ui-notes-"));
    app.cleanup.push(notes);
    await fs.writeFile(path.join(notes, "one.md"), "---\nid: note-1\ntitle: Imported note\nstatus: todo\n---\nSource description stays separate.");
    return { notes, project: await store.createProject({ title: "Mixed sources" }) };
  },
  server: async (store, app) => {
    const auth = new Auth(store, true);
    await auth.save({ username: "owner", password: "test-long-password", admin: true, organisations: {} });
    return { auth, sources: { env: { OBSIDIAN_ROOT: app.notes } } };
  },
});
// The second test works on the records the first one syncs.
test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1440, height: 1000 } });

async function signIn(page) {
  await page.goto(app.base);
  await page.locator('[name="username"]').fill("owner");
  await page.locator('[name="password"]').fill("test-long-password");
  await page.locator('#login-form [type="submit"]').click();
  await page.locator(".project-link").click();
}

test("a signed-in administrator previews an Obsidian source without changing tasks, then syncs it", { tag: "@gate" }, async ({ page }) => {
  await signIn(page);
  // Since 0.19.31 one Settings button in the top bar opens the Settings page.
  await page.locator(".topbar").getByRole("button", { name: "Settings", exact: true }).click();
  await selectSettingsPage(page, "sources");
  await page.locator('[data-source-action="new"]').click();
  await page.locator('#source-config [name="name"]').fill("Notes");
  await page.locator('#source-config [type="submit"]').click();
  await page.locator('[data-source-action="preview"]').click();
  await expect(page.getByText("1 records. First 1 shown. No tasks have been changed.")).toBeVisible();
  expect((await app.store.snapshot(app.project.id)).tasks).toHaveLength(0);
  await page.locator('[data-action="dialog-close"]').click();
  await selectSettingsPage(page, "sources");
  await page.locator('[data-source-action="sync"]').click();
  await expect(page.getByText(/Up to date · 1 records/)).toBeVisible();
  expect((await app.store.list()).projects[0].source_owner).toBe("owner");
});

test("an imported task keeps source fields read-only, takes local annotations, and its editor fits desktop and phone", { tag: "@gate" }, async ({ page }) => {
  await signIn(page);
  await page.locator(".task-row").filter({ has: page.locator('input.task-title[value="Imported note"]') }).locator(".task-id").click();
  await expect(page.locator('#task-form [name="title"]')).toHaveAttribute("readonly", "");
  await page.getByText("Source description").first().click();
  await expect(page.getByText("Source description stays separate.")).toBeVisible();
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill("Local annotation");
  await editor.blur();
  // The annotation saves locally beside the source record.
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.title === "Imported note")?.body).toContain("Local annotation");
  expect((await app.store.list()).projects[0].source_owner).toBe("owner");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => {
      const box = await page.locator(".task-dialog").boundingBox();
      return box.x >= -1 && box.x + box.width <= width + 1;
    }, { message: `the task editor fits ${width}px` }).toBe(true);
  }
});
