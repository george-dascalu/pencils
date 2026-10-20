import { selectSettingsPage } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";
import { selectProjectView } from "./menu-controls.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-local-sign-in-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "George's workspace" });
await store.createTask(project.id, { title: "Existing task" });
const server = createServer(store, {
  auth: new Auth(store, "local", "George"),
  sources: { env: { APP_ORIGIN: "http://localhost:3000", JIRA_CLIENT_ID: "fixture-client", JIRA_CLIENT_SECRET: "fixture-secret" } },
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (process.env.BROWSER === "firefox" ? firefox : chromium).launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  await page.goto(`${base}/#project/${project.id}/list`);
  await page.locator(".task-row").waitFor();
  assert.equal(await page.locator("#login-form").count(), 0);
  assert.equal(await page.locator('[data-feature="logout"],[data-feature="accounts"]').count(), 0);
  assert.equal(await page.locator(".avatar").textContent(), "GE");
  assert.match(await page.locator(".avatar").getAttribute("title"), /George.*Administrator.*Automatic/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => document.documentElement.dataset.theme = t, theme);
      await page.getByRole("button", { name: "Personal settings", exact: true }).click();
      assert.match(await page.locator("[data-current-user]").textContent(), /George.*Administrator.*Automatic local sign-in/);
      const box = await page.locator(".personal-dialog").boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
      await page.screenshot({ path: `/tmp/pencils-local-sign-in-${process.env.BROWSER || "chromium"}-${width}-${theme}.png` });
      await page.locator('[data-action="dialog-close"]').first().click();
      await selectProjectView(page, "tree");
      assert.equal(await page.locator(".avatar").textContent(), "GE");
    }
  }
  await page.getByRole("button", { name: "Project settings", exact: true }).click();
  await selectSettingsPage(page, "sources");
  await page.locator('[data-source-action="new"]').click();
  await page.locator('#source-config [name="provider"]').selectOption("jira");
  await page.getByText("OAuth app configured.", { exact: false }).waitFor();
  await page.locator('#source-config [name="name"]').fill("Jira fixture");
  await page.locator('#source-config [name="cloudId"]').fill("fixture-site");
  await page.locator('#source-config [name="jql"]').fill("project = DEMO ORDER BY key ASC");
  await page.locator('#source-config [type="submit"]').click();
  await page.locator('[data-source-action="authorize"]').waitFor();
  assert.equal((await store.snapshot(project.id)).project.source_owner, "George");
  assert.equal(await page.locator("#login-form").count(), 0);

  // No password, cookie or browser storage is needed on a new local device/tab.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto(`${base}/#project/${project.id}/list`);
  await other.locator(".task-row").waitFor();
  assert.equal(await other.locator(".avatar").textContent(), "GE");
  assert.equal(await other.locator("#login-form").count(), 0);
  await other.reload();
  await other.locator(".task-row").waitFor();
  assert.equal(await other.locator(".avatar").textContent(), "GE");
  assert.equal((await fresh.cookies()).length, 0);
  await fresh.close();
  assert.deepEqual(errors, []);
  console.log("PASS: automatic George administrator, profile identity, no login/logout prompts, source configuration, fresh sessions/reload, desktop/mobile and themes.");
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await store.queue;
  await fs.rm(root, { recursive: true, force: true });
}
