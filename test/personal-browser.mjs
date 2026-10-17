import { selectProjectView } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-personal-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Design studio" });
const other = await store.createProject({ title: "Other project" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  colorScheme: "light",
});
const page = await context.newPage(),
  errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (!r.url().startsWith(base) && !r.url().startsWith("data:"))
    external.push(r.url());
});
const until = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await page.waitForTimeout(100);
  }
  throw Error("Timed out waiting for change");
};
async function setStatuses(names, done) {
  await page.locator("[data-status-details] > summary").click();
  const existing = await page.locator('[data-workflow-status]').evaluateAll(els=>els.map(el=>el.dataset.workflowStatus));
  for (const name of names) {
    await page.getByLabel('New status name',{exact:true}).fill(name);
    await page.locator('[data-status-add]').click();
  }
  for (const id of existing) await page.locator(`[data-workflow-status="${id}"] [data-status-remove]`).click();
  await page.locator(`[data-workflow-status="${done}"] [data-status-completed]`).check();
  await page.locator(`[data-workflow-status="${names[0]}"] [data-status-initial]`).check();
}
try {
  await page.goto(base);
  await page
    .locator(`[data-action=project-open][data-id="${project.id}"]`)
    .click();
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  assert.equal(await page.locator(".sidebar").isVisible(), false);
  assert.equal(await page.locator(".sidebar").evaluate((el) => el.inert), true);
  assert.equal((await page.locator(".main").boundingBox()).x, 0);
  await page.reload();
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Personal settings", exact: true })
    .click();
  assert.equal(await page.locator('[name="personal-font"]').count(), 8);
  for (const font of await page.evaluate(
    () => window.PencilsAppearance.fonts,
  )) {
    await page.locator(`[name=personal-font][value=${font[0]}]`).check();
    const loaded = await page.evaluate(async (name) => {
      const fonts = await document.fonts.load(`16px "${name}"`);
      return fonts.length > 0 && fonts.every((f) => f.status === "loaded");
    }, font[1]);
    assert.ok(loaded, `${font[1]} must load from the local server`);
    assert.ok(
      (
        await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).fontFamily)
      ).includes(font[1]),
    );
  }
  await page.locator("[name=personal-font][value=spacegrotesk]").check();
  await page.locator("[name=personal-theme][value=dark]").check();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.screenshot({
    path: "/tmp/pencils-personal-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(
    await page.locator("html").getAttribute("data-font"),
    "spacegrotesk",
  );
  await page
    .getByRole("button", { name: "Personal settings", exact: true })
    .click();
  await page.locator("[name=personal-theme][value=system]").check();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await until(
    async () =>
      (await page.locator("html").getAttribute("data-theme")) === "dark",
  );
  await page.locator("[name=personal-theme][value=light]").check();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const second = await context.newPage();
  await second.goto(base);
  await second
    .getByRole("button", { name: "Personal settings", exact: true })
    .click();
  await second.locator("[name=personal-theme][value=dark]").check();
  await until(
    async () =>
      (await page.locator("html").getAttribute("data-theme")) === "dark",
  );
  await second.close();
  console.log(
    "PASS: sidebar collapse/reload, eight real local fonts, light/dark/system and cross-tab preferences",
  );

  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await setStatuses(["ideas", "active", "shipped"], "shipped");
  await page.locator("#project-form [type=submit]").click();
  await until(
    async () =>
      (await store.snapshot(project.id)).project.schema.statuses[0] === "ideas",
  );
  assert.deepEqual((await store.snapshot(other.id)).project.schema.statuses, [
    "backlog",
    "todo",
    "in-progress",
    "review",
    "done",
  ]);
  if (await page.locator("[data-action=settings-close]").count()) await page.locator("[data-action=settings-close]").click();
  await page.locator("[data-action=task-new]:visible").first().click();
  assert.equal(
    await page.locator("#task-form [name=status]").inputValue(),
    "ideas",
  );
  assert.deepEqual(
    await page
      .locator("#task-form [name=status] option")
      .evaluateAll((els) => els.map((el) => el.value)),
    ["ideas", "active", "shipped"],
  );
  await page.locator("#task-form [name=title]").fill("Explore the next idea");
  await page.locator("#task-form [type=submit]").click();
  await until(
    async () => (await store.snapshot(project.id)).tasks.length === 1,
  );
  await selectProjectView(page, "kanban");
  assert.deepEqual(
    await page
      .locator(".kanban-column")
      .evaluateAll((els) => els.map((el) => el.dataset.dropStatus)),
    ["ideas", "active", "shipped"],
  );
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  assert.ok(await page.locator('[data-workflow-status=ideas] [data-status-remove]').isDisabled());
  assert.deepEqual((await store.snapshot(project.id)).project.schema.statuses, ["ideas","active","shipped"]);
  await page.locator('#project-form [data-action=settings-close]').click();
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await page.locator(".side-new").click();
  await page.locator("#project-form [name=title]").fill("Independent workflow");
  await setStatuses(["queued", "complete"], "complete");
  await page.locator("#project-form [type=submit]").click();
  await page
    .locator(".breadcrumb strong")
    .filter({ hasText: "Independent workflow" })
    .waitFor();
  if (await page.locator("[data-action=settings-close]").count()) await page.locator("[data-action=settings-close]").click();
  await page.locator("[data-action=task-new]:visible").first().click();
  assert.deepEqual(
    await page
      .locator("#task-form [name=status] option")
      .evaluateAll((els) => els.map((el) => el.value)),
    ["queued", "complete"],
  );
  await page.locator("#task-form [data-action=dialog-close]").click();
  console.log(
    "PASS: project settings create independent workflows and safely reject removal of an in-use status",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Toggle sidebar", exact: true })
    .click();
  assert.ok(await page.locator(".sidebar").isVisible());
  assert.equal(
    await page.locator(".sidebar").evaluate((el) => el.inert),
    false,
  );
  await page
    .getByRole("button", { name: "Close sidebar", exact: true })
    .click({ position: { x: 350, y: 400 } });
  await page
    .getByRole("button", { name: "Personal settings", exact: true })
    .click();
  assert.ok(
    (await page.locator(".personal-dialog").boundingBox()).width <= 390,
  );
  await page.screenshot({
    path: "/tmp/pencils-personal-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: mobile settings and drawer; no JavaScript errors or external asset requests",
  );
} catch (e) {
  await page.screenshot({
    path: "/tmp/pencils-personal-failure.png",
    fullPage: true,
  });
  console.error(errors);
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
