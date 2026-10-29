// Board-only draft cards: a draft keeps its fields, subtasks and description on the board
// without creating a project task, edits autosave (blank titles and failed saves are kept
// back), it converts to a note and back, and finalising creates the task and its subtasks
// once, in the same place, even when retried or undone. Part of the cross-browser release
// gate (Firefox, WebKit).
import { test, expect, useApp } from "../fixtures.mjs";
import { legacySubtasks } from "../helpers/task-editor-helpers.mjs";

const app = useApp(async (store) => {
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
  await store.updateProject(project.id, { revision: project.revision, teams: ["team-design"] });
  return { project };
});
// One draft travels through its whole life, from creation to finalisation and back.
test.describe.configure({ mode: "serial" });
let draftId, savedDraft;

const snap = () => app.store.snapshot(app.project.id);
const node = async () => (await snap()).boards[0].nodes.find((n) => n.id === draftId);
const savedFields = async () => (await node()).draft;
const openBoard = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("[data-action=board-task]").waitFor();
  if (draftId) await card(page).waitFor();
};
const card = (page) => page.locator(`[data-node="${draftId}"]`);
const title = (page) => page.locator("#task-form [name=title]");

test("a board draft saves its fields on close without creating a task or moving the camera", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-action=board-task]").click();
  await page.locator("[data-action=board-create-draft]").click();
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await title(page).fill("Explore a draft");
  await page.locator("#task-form [name=start]").fill("2026-10-16");
  await page.locator('[aria-label="Task description"]').fill("Ideas before commitment");
  await legacySubtasks(page.locator("#task-form"), [{ title: "Investigate", type: "task" }]);
  const camera = await page.locator("#canvas-world").getAttribute("style");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
  await page.locator("#task-form [data-action=dialog-close]").click();
  await expect(page.locator("#task-form")).toHaveCount(0);
  await expect.poll(async () => (await snap()).boards[0].nodes.some((n) => n.type === "draft")).toBe(true);
  const data = await snap();
  const draft = data.boards[0].nodes.find((n) => n.type === "draft");
  draftId = draft.id;
  expect(data.tasks).toHaveLength(0);
  expect(draft.draft.title).toBe("Explore a draft");
  expect(draft.draft.priority).toBe("medium");
  expect(draft.text).toMatch(/Ideas before commitment/);
  expect(draft.draft.subtasks).toHaveLength(1);
  expect(await page.locator("#canvas-world").getAttribute("style")).toBe(camera);
});

test("draft card fields change with undo and redo and survive a reload without creating a task", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  await expect(card(page)).toContainText("Draft");
  const priority = card(page).locator("[data-canvas-task-field=priority]");
  const assignee = card(page).locator("[data-canvas-task-field=assignee]");
  await expect(priority).toHaveValue("medium");
  await expect(priority.locator('option[value="none"]')).toHaveText("Lowest");
  await expect(assignee.locator("option")).toHaveText(["Unassigned", "Alice"]);
  await priority.click();
  await page.locator("#shared-select-menu").getByRole("option", { name: "High", exact: true }).click();
  await expect.poll(async () => (await savedFields()).priority).toBe("high");
  await assignee.click();
  await page.locator("#shared-select-menu").getByRole("option", { name: "Alice", exact: true }).click();
  await expect.poll(async () => (await savedFields()).assignee).toBe("Alice");
  await page.locator("[data-action=board-undo]").click();
  await expect.poll(async () => (await savedFields()).assignee || null).toBe(null);
  expect((await savedFields()).priority).toBe("high");
  await page.locator("[data-action=board-redo]").click();
  await expect.poll(async () => (await savedFields()).assignee).toBe("Alice");
  expect((await snap()).tasks, "Changing draft fields does not create a task").toHaveLength(0);
  await page.reload();
  await expect(priority).toHaveValue("high");
  await expect(assignee).toHaveValue("Alice");
});

test("the draft editor autosaves while focused, keeps back a blank title and waits for a failed save before finalising", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  await card(page).locator("[data-pro=draft-edit]").click();
  await expect(title(page)).toHaveValue("Explore a draft");
  await expect(page.locator("[name=pendingSubtasks]")).toHaveValue(/Investigate/);
  await title(page).fill("Autosaved while focused");
  await expect.poll(async () => (await savedFields()).title).toBe("Autosaved while focused");
  await expect(title(page)).toBeFocused();
  await title(page).fill("");
  // The status reports the missing title once the debounced save has been refused.
  await expect(page.locator("[data-autosave-status]")).toContainText(/required fields/);
  expect((await savedFields()).title).toBe("Autosaved while focused");
  await page.route("**/api/projects/*/boards/*", (route) =>
    route.request().method() === "PATCH" ? route.fulfill({ status: 500, json: { error: "Draft save offline" } }) : route.continue(),
  );
  await title(page).fill("Queued draft edit");
  await page.locator("[data-autosave-status]").filter({ hasText: "Pending" }).waitFor();
  expect((await savedFields()).title).not.toBe("Queued draft edit");
  await page.locator("[data-feature=draft-finalise]").click();
  await expect(page.locator(".draft-review-panel"), "Finalisation waits for a successful save").toHaveCount(0);
  await page.unroute("**/api/projects/*/boards/*");
  await expect.poll(async () => (await savedFields()).title).toBe("Queued draft edit");
  await title(page).fill("Ready to explore");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
  await page.locator("#task-form [data-action=dialog-close]").click();
  await expect(page.locator("#task-form")).toHaveCount(0);
  await expect.poll(async () => (await savedFields())?.title).toBe("Ready to explore");
  savedDraft = await node();
});

test("a draft card leads with its type icon and Draft badge, then Finalise, collapse, Comments and Edit", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  // Card type, ID, ... order since 0.19.9; the type tooltip marks the draft.
  await expect(card(page).locator(".canvas-task-type")).toHaveAttribute("aria-label", "Task");
  await expect(card(page).locator(".canvas-task-type")).toHaveAttribute("title", "Draft · Task");
  await expect(card(page).locator(".draft-task-badge")).toHaveText("Draft");
  // Since 0.16.9 the description collapse/expand button sits before Comments.
  expect(await card(page).locator(".live-card-actions button").evaluateAll((buttons) => buttons.map((button) => button.dataset.pro)), "Finalise leads the card header, then collapse and Comments").toEqual([
    "convert",
    "task-collapse",
    "comments",
    "draft-edit",
  ]);
});

test("a draft converts to a note and back without losing its fields or place", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-action=board-fit]").click();
  await card(page).locator(".task-title").click();
  await page.locator("[data-selection-menu=convert] > summary").click();
  await page.locator("#selection-tools [data-pro=convert-note]").click();
  await expect.poll(async () => (await node())?.type).toBe("sticky");
  const note = await node();
  expect((await snap()).tasks).toHaveLength(0);
  expect(note.text).toMatch(/^Ready to explore\n\n/);
  expect(note.text).toMatch(/Ideas before commitment/);
  expect(note.draft.subtasks).toEqual(savedDraft.draft.subtasks);
  expect([note.x, note.y, note.w, note.h]).toEqual([savedDraft.x, savedDraft.y, savedDraft.w, savedDraft.h]);
  await page.reload();
  await card(page).click();
  await page.locator("[data-selection-menu=convert] > summary").click();
  await page.locator("#selection-tools [data-pro=convert]").click();
  await expect.poll(async () => (await node())?.type).toBe("draft");
  const restored = await node();
  expect(restored.draft).toEqual(savedDraft.draft);
  expect(restored.text).toBe(savedDraft.text);
});

test("a failed finalisation keeps the draft, with a compact review panel on desktop and phone", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  await page.route("**/api/projects/*/tasks", (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 500, json: { error: "Try again" } }) : route.continue(),
  );
  await card(page).locator("[data-pro=draft-edit]").click();
  await page.locator("#task-form [data-feature=draft-finalise]").click();
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  const reviewBox = await page.locator(".draft-review-panel").boundingBox();
  expect(reviewBox.width).toBeLessThanOrEqual(310);
  expect(reviewBox.height).toBeLessThan(520);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await page.waitForFunction(() => {
    const r = document.querySelector(".draft-review-panel").getBoundingClientRect();
    return r.x >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  });
  await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "light" }));
  await page.locator("#draft-finalise-confirm").click();
  await expect(page.getByText("Try again", { exact: true })).toBeVisible();
  expect((await snap()).tasks).toHaveLength(0);
  expect((await node()).type).toBe("draft");
});

test("finalising creates the task and its subtask once in the draft's place, and undo restores the draft", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  await card(page).locator("[data-pro=convert]").click();
  await page.locator("#draft-finalise-confirm").click();
  await expect.poll(async () => (await node())?.type).toBe("task");
  const data = await snap();
  const converted = await node();
  expect([converted.x, converted.y, converted.w, converted.h]).toEqual([savedDraft.x, savedDraft.y, savedDraft.w, savedDraft.h]);
  expect(data.tasks).toHaveLength(2);
  const parent = data.tasks.find((t) => t.id === converted.task);
  await expect(card(page).locator(".canvas-task-type")).toHaveAttribute("aria-label", "Task");
  expect(parent).toMatchObject({ title: "Ready to explore", start: "2026-10-16", priority: "high", assignee: "Alice" });
  expect(parent.body).toMatch(/Ideas before commitment/);
  expect(data.tasks.find((t) => t.parent === parent.id).title).toBe("Investigate");
  expect(parent.key).toBeTruthy();
  // Re-delivery of the same conversion must not create another parent or subtask.
  const retry = await app.store.createTask(app.project.id, {
    ...savedDraft.draft,
    body: savedDraft.text,
    canvas_source: `canvas:${data.boards[0].id}:${draftId}`,
  });
  expect(retry.id).toBe(parent.id);
  expect((await snap()).tasks).toHaveLength(2);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator("[data-action=board-fit]").click();
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  const glyph = await card(page).locator(".canvas-task-type").boundingBox();
  const heading = await card(page).locator(".task-title").boundingBox();
  expect(glyph.x + glyph.width, "The type icon sits before the title on mobile").toBeLessThanOrEqual(heading.x);
  // Undo history lives in this page, so the undo steps stay in the same test.
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.locator("[data-action=board-undo]").click();
  await expect.poll(async () => (await node())?.type).toBe("draft");
  expect((await node()).draft).toEqual(savedDraft.draft);
  expect((await snap()).tasks, "Undoing conversion keeps project records safe").toHaveLength(2);
  await card(page).locator("[data-pro=convert]").click();
  await page.locator("#draft-finalise-confirm").click();
  await expect.poll(async () => (await node())?.task).toBe(parent.id);
  expect((await snap()).tasks, "Converting again reuses the original project tasks").toHaveLength(2);
});
