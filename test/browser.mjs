import { clickControl } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-browser-vault-"));
const artifacts = process.env.ARTIFACT_PATH || "/tmp/pencils-browser-artifacts";
await fs.mkdir(artifacts, { recursive: true });
const store = new Store(root);
await store.init();
const server = createServer(store);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH
    ? { executablePath: process.env.BROWSER_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [],
  external = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", (route) => {
  if (new URL(route.request().url()).origin !== base) {
    external.push(route.request().url());
    return route.abort();
  }
  return route.continue();
});
page.setDefaultTimeout(10000);
const shot = (name) =>
  page.screenshot({
    path: path.join(artifacts, `${name}.png`),
    fullPage: true,
  });
const click = (action) =>
  clickControl(page.locator(`[data-action="${action}"]`).first());
const view = (name) => page.locator(`[data-view="${name}"]`).click();
const saved = async (fn, entityId) => {
  const response = page.waitForResponse(
    (r) =>
      (r.request().method() === "PATCH" || r.url().endsWith("/undo")) &&
      r.url().includes("/api/") &&
      (!entityId || r.url().includes(entityId)),
  );
  await fn();
  assert.equal((await response).status(), 200);
};
const project = async () => (await store.list()).projects[0];
const snapshot = async () => store.snapshot((await project()).id);
try {
  await page.goto(base);
  await page
    .getByRole("heading", { name: /A little space for your/ })
    .waitFor();
  await shot("01-welcome");
  await click("demo");
  await page
    .getByRole("heading", { name: "A little more possibility", exact: true })
    .waitFor();
  assert.equal((await snapshot()).tasks.length, 8);
  await shot("02-list");
  console.log("PASS: empty workspace and optional sample project");

  await click("task-new");
  await page.locator('#task-form [name="title"]').fill("Browser-tested task");
  await page.locator('[data-task-picker=type] .task-picker-trigger').click();
  await page.locator('[data-task-picker=type] [data-picker-value=bug]').click();
  await page.locator('[data-task-picker=priority] .task-picker-trigger').click();
  await page.locator('[data-task-picker=priority] [data-picker-value=urgent]').click();
  const epic = (await snapshot()).tasks.find((t) => t.type === "epic");
  await page.locator('[data-task-picker=parent] .task-picker-trigger').click();
  await page.locator(`[data-task-picker=parent] [data-picker-value="${epic.id}"]`).click();


  await page.locator('#task-form [data-rich-mode="source"]').click();
  await page
    .locator('#task-form [name="body"]')
    .fill(
      "# Browser notes\n\n- [ ] Persist this task\n\n<script>window.__pwned=true</script>",
    );
  await page.locator("#task-form [data-rich-preview]").click();
  assert.equal(
    await page.locator("#markdown-preview h1").textContent(),
    "Browser notes",
  );
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  await page.locator('#task-form [type="submit"]').click();
  await page.locator("dialog").waitFor({ state: "detached" });
  let created = (await snapshot()).tasks.find(
    (t) => t.title === "Browser-tested task",
  );
  assert.equal(created.parent, epic.id);
  assert.deepEqual(created.tags, []);
  console.log("PASS: task creation, hierarchy, Markdown preview, safe HTML");

  await view("table");
  await page
    .locator(`[data-task-field="title"][data-id="${created.id}"]`)
    .waitFor();
  await saved(async () => {
    const cell = page.locator(
      `[data-task-field="title"][data-id="${created.id}"]`,
    );
    await cell.fill("Edited in the grid");
    await cell.press("Tab");
  });
  await saved(() =>
    page
      .locator(`[data-task-field="status"][data-id="${created.id}"]`)
      .selectOption("review"),
  );
  assert.equal(
    (await snapshot()).tasks.find((t) => t.id === created.id).title,
    "Edited in the grid",
  );
  await shot("03-table");
  console.log("PASS: spreadsheet text and status changes persist");

  await view("kanban");
  await saved(
    () =>
      page
        .locator(`[data-drag-task="${created.id}"]`)
        .dragTo(page.locator('[data-drop-status="done"]')),
    created.id,
  );
  assert.equal(
    (await snapshot()).tasks.find((t) => t.id === created.id).status,
    "done",
  );
  await shot("04-kanban");
  await view("tree");
  await page.locator(`[data-action="collapse"][data-id="${epic.id}"]`).click();
  assert.equal(
    await page
      .locator(`[data-action="task-open"][data-id="${created.id}"]`)
      .count(),
    0,
  );
  await click("expand-all");
  assert.ok(
    await page
      .locator(`[data-action="task-open"][data-id="${created.id}"]`)
      .count(),
  );
  await shot("05-tree");
  console.log("PASS: kanban drag/drop and collapsible hierarchy");

  await page.locator("#search").fill("Edited in the grid");
  assert.equal(await page.locator(".task-row").count(), 1);
  await page.locator("#search").fill("");
  await view("board");
  await click("board-fit");
  await shot("06-board");
  const sticky = page.locator('[data-node="n-note"]');
  await sticky.dblclick();
  await page.locator("#canvas-inline-form").waitFor();
  await page
    .locator("#canvas-inline-form .inline-rich")
    .fill("Edited on the canvas");
  await saved(() => page.locator('[data-pro="search-toggle"]').click());
  assert.equal(
    (await snapshot()).boards[0].nodes.find((n) => n.id === "n-note").text,
    "Edited on the canvas",
  );
  const before = (await snapshot()).boards[0].nodes.find(
    (n) => n.id === "n-note",
  );
  const box = await page.locator('[data-node="n-note"]').boundingBox();
  await saved(async () => {
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 110, box.y + 90, { steps: 8 });
    await page.mouse.up();
  });
  assert.notEqual(
    (await snapshot()).boards[0].nodes.find((n) => n.id === "n-note").x,
    before.x,
  );
  console.log("PASS: canvas double-click editor and drag persistence");

  await page.locator('[data-action="board-add"][data-tool="sticky"]').click();
  await page.locator("#canvas").click({ position: { x: 450, y: 350 } });
  await page
    .locator("#canvas-inline-form .inline-rich")
    .fill("New persistent sticky");
  await page.locator('[data-pro="search-toggle"]').click();
  await page.waitForFunction(() =>
    /All (canvas )?changes saved/.test(
      document.querySelector("#board-save")?.textContent,
    ),
  );
  const added = (await snapshot()).boards[0].nodes.find(
    (n) => n.text === "New persistent sticky",
  );
  assert.ok(added);
  await click("board-fit");
  await page.locator('[data-action="board-tool"][data-tool="connect"]').click();
  await page.locator('[data-node="n-note2"]').click();
  await saved(() => page.locator(`[data-node="${added.id}"]`).click());
  assert.equal((await snapshot()).boards[0].edges.length, 3);
  await saved(() => click("board-undo"));
  assert.equal((await snapshot()).boards[0].edges.length, 2);
  await saved(() => click("board-redo"));
  assert.equal((await snapshot()).boards[0].edges.length, 3);
  await page.reload();
  await page.locator(`[data-node="${added.id}"]`).waitFor();
  await shot("07-board-edited");
  console.log(
    "PASS: canvas notes, connectors, undo/redo and reload persistence",
  );

  await click("board-new");
  await page.locator('#board-form [name="title"]').fill("Another canvas");
  await page.locator('#board-form [type="submit"]').click();
  await page.locator("dialog").waitFor({ state: "detached" });
  assert.equal((await snapshot()).boards.length, 2);
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  await page
    .locator('#board-settings-form [name="title"]')
    .fill("Planning canvas");
  await saved(() =>
    page.locator('#board-settings-form [type="submit"]').click(),
  );
  await page.locator("dialog").waitFor({ state: "detached" });
  assert.ok(
    (await snapshot()).boards.some((b) => b.title === "Planning canvas"),
  );
  console.log("PASS: multiple named project canvases");

  await view("list");
  const file = path.join(root, created.file),
    raw = await fs.readFile(file, "utf8");
  await fs.writeFile(
    file,
    raw.replace("Edited in the grid", "Changed in Obsidian"),
  );
  await page
    .getByRole("button", { name: "Changed in Obsidian", exact: true })
    .waitFor({ timeout: 12000 });
  await page
    .getByRole("button", { name: "Changed in Obsidian", exact: true })
    .click();
  await page.locator('#task-form [name="title"]').fill("Unsaved browser edit");
  const raw2 = await fs.readFile(file, "utf8");
  await fs.writeFile(
    file,
    raw2.replace("Changed in Obsidian", "Newer Obsidian edit"),
  );
  await page.locator('#task-form [type="submit"]').click();
  await page.locator("#task-form > .task-editor-content > .dialog-body > .form-error:not(.hidden)").waitFor();
  assert.match(
    await page.locator("#task-form > .task-editor-content > .dialog-body > .form-error").textContent(),
    /draft is retained/,
  );
  assert.equal(
    await page.locator('#task-form [name="title"]').inputValue(),
    "Unsaved browser edit",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await click("dialog-close");
  await page.locator('[data-feature="recovery"]').click();
  await page.locator('[data-feature="resolve-remote"]').click();
  await page.locator('[data-action="dialog-close"]').first().click();
  console.log("PASS: live external Markdown edits and conflict protection");

  const original = (await snapshot()).project;
  await click("organisation-new");
  await page.locator('#organisation-form [name="title"]').fill("Acme Studio");
  await page
    .locator('#organisation-form [name="body"]')
    .fill("Projects for our studio.");
  await page.locator('#organisation-form [type="submit"]').click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.waitForFunction(
    () =>
      document.querySelector("#organisation-select")?.selectedOptions[0]
        ?.textContent === "Acme Studio",
  );
  const studio = (await store.listOrganisations()).organisations.find(
    (o) => o.title === "Acme Studio",
  );
  assert.ok(studio);
  assert.equal(await page.locator(".project-link").count(), 0);
  assert.equal(await page.locator(".task-row").count(), 0);
  for (const title of ["Website refresh", "Marketing launch"]) {
    await click("project-new");
    assert.equal(
      await page.locator('#project-form [name="organisation"]').inputValue(),
      studio.id,
    );
    await page.locator('#project-form [name="title"]').fill(title);
    await page.locator('#project-form [type="submit"]').click();
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
  }
  assert.equal(await page.locator(".project-link").count(), 2);
  assert.equal((await store.list(studio.id)).projects.length, 2);
  await click("organisation-edit");
  await page
    .locator('#organisation-form [name="title"]')
    .fill("Acme Collective");
  await page.locator('#organisation-form [type="submit"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector("#organisation-select")?.selectedOptions[0]
        ?.textContent === "Acme Collective",
  );
  assert.equal(
    (await store.getOrganisation(studio.id)).title,
    "Acme Collective",
  );
  const lastStudioProject = (await store.list(studio.id)).projects.find(
    (p) => p.title === "Marketing launch",
  );
  await page.locator("#organisation-select").selectOption("o-default");
  await page
    .getByRole("heading", { name: original.title, exact: true })
    .waitFor();
  assert.equal(await page.locator(".project-link").count(), 1);
  await page.locator("#organisation-select").selectOption(studio.id);
  await page
    .getByRole("heading", { name: lastStudioProject.title, exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: lastStudioProject.title, exact: true })
    .waitFor();
  assert.equal(
    await page.locator("#organisation-select").inputValue(),
    studio.id,
  );
  console.log(
    "PASS: organisation creation, renaming, scoped projects and remembered selections",
  );

  await page.locator("#organisation-select").selectOption("o-default");
  await page
    .getByRole("heading", { name: original.title, exact: true })
    .waitFor();
  const beforeMove = await store.snapshot(original.id);
  await click("project-edit");
  await page
    .locator('#project-form [name="organisation"]')
    .selectOption(studio.id);
  await page.locator('#project-form [type="submit"]').click();
  await page.waitForFunction(
    (id) => document.querySelector("#organisation-select")?.value === id,
    studio.id,
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".project-link").length === 3,
  );
  // The project settings page refreshes the workspace before navigation settles.
  await page
    .locator("#toasts")
    .getByText("Project updated.", { exact: true })
    .waitFor();
  const afterMove = await store.snapshot(original.id);
  assert.equal(afterMove.project.organisation, studio.id);
  assert.deepEqual(afterMove.tasks, beforeMove.tasks);
  assert.deepEqual(afterMove.boards, beforeMove.boards);
  await page.locator("#organisation-select").selectOption("o-default");
  await page
    .getByRole("heading", { name: /A little space for your/ })
    .waitFor();
  assert.equal(await page.locator(".project-link").count(), 0);
  assert.equal(await page.locator('[data-action="task-open"]').count(), 0);
  await page.reload();
  await page
    .getByRole("heading", { name: /A little space for your/ })
    .waitFor();
  assert.equal(
    await page.locator("#organisation-select").inputValue(),
    "o-default",
  );
  await page.locator("#organisation-select").selectOption(studio.id);
  await page
    .getByRole("heading", { name: original.title, exact: true })
    .waitFor();
  await click("home");
  await page
    .getByRole("heading", { name: "Acme Collective", exact: true })
    .waitFor();
  assert.equal(await page.locator(".project-card").count(), 3);
  await shot("09-organisations");
  await page.locator(`.project-card[data-id="${original.id}"]`).click();
  await page
    .getByRole("heading", { name: original.title, exact: true })
    .waitFor();
  console.log(
    "PASS: project moves preserve tasks/canvases, empty organisations and organisation overview",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator(".breadcrumb strong").waitFor();
  await shot("08-mobile");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.locator(".mobile-menu").click();
  await page.locator(".sidebar.open").waitFor();
  await page
    .locator(".sidebar-overlay")
    .click({ position: { x: 350, y: 100 } });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: mobile layout, sidebar, zero browser errors and zero external requests",
  );
  console.log(`Browser checks passed. Screenshots: ${artifacts}`);
} catch (error) {
  console.error("Browser errors:", errors);
  await shot("failure");
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
