import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-drafts-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Draft lab" });
const organisation = await store.getOrganisation(project.organisation);
await store.updateOrganisation(organisation.id, {
  revision: organisation.revision,
  people: [
    { id: "person-alice", name: "Alice" },
    { id: "person-bob", name: "Bob" },
  ],
  teams: [{ id: "team-design", name: "Design", members: ["person-alice"] }],
});
await store.updateProject(project.id, {
  revision: project.revision,
  teams: ["team-design"],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "webkit"
    ? webkit
    : process.env.BROWSER === "firefox"
      ? firefox
      : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const snap = () => store.snapshot(project.id);
const until = async (fn) => {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out");
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await page.locator("[data-view=board]").click();
  await page.locator("[data-action=board-task]").click();
  await page.locator("[data-action=board-create-draft]").click();
  assert.equal(await page.locator("dialog:modal").count(), 0);
  await page.locator("#task-form [name=title]").fill("Explore a draft");
  await page.locator("#task-form [name=start]").fill("2026-10-16");
  await page
    .locator('[aria-label="Task description"]')
    .fill("Ideas before commitment");
  await page.locator("#task-form [name=subtaskTitle]").fill("Investigate");
  const camera = await page.locator("#canvas-world").getAttribute("style");
  assert.equal(
    await page.getByRole("button", { name: "Save draft", exact: true }).count(),
    0,
  );
  await page.locator("#task-form [data-action=dialog-close]").click();
  await page.locator("#task-form").waitFor({ state: "detached" });
  await until(async () =>
    (await snap()).boards[0].nodes.some((n) => n.type === "draft"),
  );
  let data = await snap(),
    draft = data.boards[0].nodes.find((n) => n.type === "draft");
  assert.equal(data.tasks.length, 0);
  assert.equal(draft.draft.title, "Explore a draft");
  assert.match(draft.text, /Ideas before commitment/);
  assert.equal(draft.draft.subtasks.length, 1);
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    camera,
  );
  await page.reload();
  const card = page.locator(`[data-node="${draft.id}"]`);
  await card.waitFor();
  assert.match(await card.innerText(), /Draft/);
  const priority = () => card.locator("[data-canvas-task-field=priority]");
  const assignee = () => card.locator("[data-canvas-task-field=assignee]");
  const savedFields = async () =>
    (await snap()).boards[0].nodes.find((n) => n.id === draft.id).draft;
  assert.deepEqual(await assignee().locator("option").allTextContents(), [
    "Unassigned",
    "Alice",
  ]);
  await priority().click();
  await page
    .locator("#shared-select-menu")
    .getByRole("option", { name: "High", exact: true })
    .click();
  await until(async () => (await savedFields()).priority === "high");
  await assignee().click();
  await page
    .locator("#shared-select-menu")
    .getByRole("option", { name: "Alice", exact: true })
    .click();
  await until(async () => (await savedFields()).assignee === "Alice");
  await page.locator("[data-action=board-undo]").click();
  await until(async () => !(await savedFields()).assignee);
  assert.equal((await savedFields()).priority, "high");
  await page.locator("[data-action=board-redo]").click();
  await until(async () => (await savedFields()).assignee === "Alice");
  assert.equal(
    (await snap()).tasks.length,
    0,
    "Changing draft fields does not create a task",
  );
  await page.reload();
  assert.equal(await priority().inputValue(), "high");
  assert.equal(await assignee().inputValue(), "Alice");

  await card.locator("[data-pro=draft-edit]").click();
  assert.equal(
    await page.locator("#task-form [name=title]").inputValue(),
    "Explore a draft",
  );
  assert.match(
    await page.locator("[data-subtask-list]").innerText(),
    /Investigate/,
  );
  await page.locator("#task-form [name=title]").fill("Autosaved while focused");
  await until(
    async () => (await savedFields()).title === "Autosaved while focused",
  );
  assert.ok(
    await page
      .locator("#task-form [name=title]")
      .evaluate((el) => el === document.activeElement),
  );
  await page.locator("#task-form [name=title]").fill("");
  await page.waitForTimeout(550);
  assert.equal((await savedFields()).title, "Autosaved while focused");
  assert.match(
    await page.locator("[data-autosave-status]").innerText(),
    /required fields/,
  );
  await page.route("**/api/projects/*/boards/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, json: { error: "Draft save offline" } })
      : route.continue(),
  );
  await page.locator("#task-form [name=title]").fill("Queued draft edit");
  await page
    .locator("[data-autosave-status]")
    .filter({ hasText: "Pending" })
    .waitFor();
  assert.notEqual((await savedFields()).title, "Queued draft edit");
  await page.locator("[data-feature=draft-finalise]").click();
  assert.equal(
    await page.locator(".draft-review-panel").count(),
    0,
    "Finalisation waits for a successful save",
  );
  await page.unroute("**/api/projects/*/boards/*");
  await until(async () => (await savedFields()).title === "Queued draft edit");
  await page.locator("#task-form [name=title]").fill("Ready to explore");
  assert.equal(
    await page.getByRole("button", { name: "Save draft", exact: true }).count(),
    0,
  );
  await page.locator("#task-form [data-action=dialog-close]").click();
  await page.locator("#task-form").waitFor({ state: "detached" });
  await until(
    async () =>
      (await snap()).boards[0].nodes.find((n) => n.id === draft.id)?.draft
        .title === "Ready to explore",
  );
  const savedDraft = (await snap()).boards[0].nodes.find(
    (n) => n.id === draft.id,
  );
  assert.equal(
    await card.locator(".canvas-task-type").getAttribute("aria-label"),
    "Draft task",
  );
  assert.deepEqual(
    await card
      .locator(".live-card-actions button")
      .evaluateAll((buttons) => buttons.map((button) => button.dataset.pro)),
    ["convert", "comments", "draft-edit"],
    "Finalise sits immediately before Comments in the card header",
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator("[data-action=board-fit]").click();
  await page.screenshot({ path: "/tmp/pencils-draft-header-mobile.png" });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.locator("[data-action=board-fit]").click();
  await card.locator(".task-title").click();
  await page.locator("[data-selection-menu=convert] > summary").click();
  await page.locator("#selection-tools [data-pro=convert-note]").click();
  await until(
    async () =>
      (await snap()).boards[0].nodes.find((n) => n.id === draft.id)?.type ===
      "sticky",
  );
  let note = (await snap()).boards[0].nodes.find((n) => n.id === draft.id);
  assert.equal((await snap()).tasks.length, 0);
  assert.match(note.text, /^Ready to explore\n\n/);
  assert.match(note.text, /Ideas before commitment/);
  assert.deepEqual(note.draft.subtasks, savedDraft.draft.subtasks);
  assert.deepEqual(
    [note.x, note.y, note.w, note.h],
    [savedDraft.x, savedDraft.y, savedDraft.w, savedDraft.h],
  );
  await page.reload();
  await card.click();
  await page.locator("[data-selection-menu=convert] > summary").click();
  await page.locator("#selection-tools [data-pro=convert]").click();
  await until(
    async () =>
      (await snap()).boards[0].nodes.find((n) => n.id === draft.id)?.type ===
      "draft",
  );
  const restored = (await snap()).boards[0].nodes.find(
    (n) => n.id === draft.id,
  );
  assert.deepEqual(restored.draft, savedDraft.draft);
  assert.equal(restored.text, savedDraft.text);
  // Failed conversion retains a draft, with no phantom project task.
  await page.route("**/api/projects/*/tasks", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 500, json: { error: "Try again" } })
      : route.continue(),
  );
  await card.locator("[data-pro=draft-edit]").click();
  await page.locator("#task-form [data-feature=draft-finalise]").click();
  assert.equal(await page.locator("dialog:modal").count(), 0);
  const reviewBox = await page.locator(".draft-review-panel").boundingBox();
  assert.ok(reviewBox.width <= 310 && reviewBox.height < 520);
  await page.screenshot({ path: "/tmp/pencils-draft-review-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await page.waitForFunction(() => {
    const r = document
      .querySelector(".draft-review-panel")
      .getBoundingClientRect();
    return r.x >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  });
  await page.waitForFunction(
    () => document.querySelector(".sidebar").getBoundingClientRect().right <= 1,
  );
  await page.screenshot({ path: "/tmp/pencils-draft-review-mobile.png" });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "light" }));
  await page.locator("#draft-finalise-confirm").click();
  await page.getByText("Try again", { exact: true }).waitFor();
  assert.equal((await snap()).tasks.length, 0);
  await page.unroute("**/api/projects/*/tasks");
  await card.locator("[data-pro=convert]").click();
  await page.locator("#draft-finalise-confirm").click();
  await until(
    async () =>
      (await snap()).boards[0].nodes.find((n) => n.id === draft.id)?.type ===
      "task",
  );
  data = await snap();
  const converted = data.boards[0].nodes.find((n) => n.id === draft.id);
  assert.deepEqual(
    [converted.x, converted.y, converted.w, converted.h],
    [savedDraft.x, savedDraft.y, savedDraft.w, savedDraft.h],
  );
  assert.equal(data.tasks.length, 2);
  const parent = data.tasks.find((t) => t.id === converted.task);
  assert.equal(
    await card.locator(".canvas-task-type").getAttribute("aria-label"),
    "Task",
  );
  assert.equal(parent.title, "Ready to explore");
  assert.equal(parent.start, "2026-10-16");
  assert.equal(parent.priority, "high");
  assert.equal(parent.assignee, "Alice");
  assert.match(parent.body, /Ideas before commitment/);
  assert.equal(
    data.tasks.find((t) => t.parent === parent.id).title,
    "Investigate",
  );
  assert.ok(parent.key);
  // Re-delivery of the same conversion must not create another parent or subtask.
  const retry = await store.createTask(project.id, {
    ...savedDraft.draft,
    body: savedDraft.text,
    canvas_source: `canvas:${data.boards[0].id}:${draft.id}`,
  });
  assert.equal(retry.id, parent.id);
  assert.equal((await snap()).tasks.length, 2);
  await page.screenshot({ path: "/tmp/pencils-draft-converted.png" });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator("[data-action=board-fit]").click();
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  const glyph = await card.locator(".canvas-task-type").boundingBox();
  const heading = await card.locator(".task-title").boundingBox();
  assert.ok(
    glyph.x + glyph.width <= heading.x,
    "The type icon sits before the title on mobile",
  );
  await page.screenshot({ path: "/tmp/pencils-task-type-mobile.png" });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.locator("[data-action=board-undo]").click();
  await until(
    async () =>
      (await snap()).boards[0].nodes.find((n) => n.id === draft.id)?.type ===
      "draft",
  );
  assert.deepEqual(
    (await snap()).boards[0].nodes.find((n) => n.id === draft.id).draft,
    savedDraft.draft,
  );
  assert.equal(
    (await snap()).tasks.length,
    2,
    "Undoing conversion keeps project records safe",
  );
  await card.locator("[data-pro=convert]").click();
  await page.locator("#draft-finalise-confirm").click();
  await until(
    async () =>
      (await snap()).boards[0].nodes.find((n) => n.id === draft.id)?.task ===
      parent.id,
  );
  assert.equal(
    (await snap()).tasks.length,
    2,
    "Converting again reuses the original project tasks",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: board-only drafts, metadata/subtasks, reload, editing, failed conversion, geometry and idempotent conversion.",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  console.error("Visible feedback:", await page.locator("#toasts").innerText());
  console.error(
    "Open dialogs:",
    await page.locator("dialog").allTextContents(),
  );
  await page.screenshot({
    path: `/tmp/pencils-draft-failure-${process.env.BROWSER || "chromium"}.png`,
  });
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
