import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-source-ui-")),
  notes = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-source-ui-notes-")),
  store = new Store(root);
await store.init();
await store.createProject({ title: "Mixed sources" });
await fs.writeFile(
  path.join(notes, "one.md"),
  "---\nid: note-1\ntitle: Imported note\nstatus: todo\n---\nSource description stays separate.",
);
const auth = new Auth(store, true);
await auth.save({
  username: "owner",
  password: "test-long-password",
  admin: true,
  organisations: {},
});
const server = createServer(store, {
  auth,
  sources: { env: { OBSIDIAN_ROOT: notes } },
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
    process.env.BROWSER === "webkit"
      ? webkit
      : process.env.BROWSER === "firefox"
        ? firefox
        : chromium
  ).launch(),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[name="username"]').fill("owner");
  await page.locator('[name="password"]').fill("test-long-password");
  await page.locator('#login-form [type="submit"]').click();
  await page.locator(".project-link").click();
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await page.locator('[data-source-action="open"]').click();
  await page.locator('[data-source-action="new"]').click();
  await page.locator('#source-config [name="name"]').fill("Notes");
  await page.locator('#source-config [type="submit"]').click();
  await page.locator('[data-source-action="preview"]').click();
  await page
    .getByText("1 records. First 1 shown. No tasks have been changed.")
    .waitFor();
  await page.locator('[data-action="dialog-close"]').click();
  await page.locator('[data-source-action="open"]').click();
  await page.locator('[data-source-action="sync"]').click();
  await page.getByText(/Up to date · 1 records/).waitFor();
  await page.locator('[data-action="dialog-close"]').click();
  await page.locator('[data-action="settings-close"]').click();
  await page
    .locator(".task-title")
    .filter({ hasText: "Imported note" })
    .click();
  assert.equal(
    await page.locator('#task-form [name="title"]').getAttribute("readonly"),
    "",
  );
  await page.getByText("Source description").first().click();
  await page.getByText("Source description stays separate.").waitFor();
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill("Local annotation");
  await editor.blur();
  await page.waitForTimeout(1000);
  assert.ok((await store.list()).projects[0].source_owner === "owner");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(80);
    const box = await page.locator(".task-dialog").boundingBox();
    assert.ok(box.x >= -1 && box.x + box.width <= width + 1);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: authenticated source setup, preview, sync, source-owned fields, local annotations and responsive task editor.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(notes, { recursive: true, force: true });
}
