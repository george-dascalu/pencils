// Browser checks for the platform upgrade, on the demo project: rapid edits on one
// table row are serialized, range paste and current view filters persist, custom
// types and typed fields reach the planning views, editor drafts recover without
// overwriting disk, attachment links resolve in the web preview and the Markdown
// vault, failed canvas saves survive a reload and retry, board selection, grouping,
// frames, resize and export work, and phones reach Project settings without overflow.
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect, useApp } from "../fixtures.mjs";
import { clickControl, reveal, selectProjectView, selectSettingsPage, openSettingsPage } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const project = await store.demo();
  const first = (await store.snapshot(project.id)).tasks.find((t) => t.type === "task" && t.status === "todo");
  return { project, first };
});

// Later steps use the card and fields created by earlier ones.
test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1440, height: 1000 } });

const snap = () => app.store.snapshot(app.project.id);
const feature = (page, key) => page.locator(`[data-feature="${key}"]`).first();
// The card created in the custom type test; the draft test renames it.
let plannedId;
const planned = async () => (await snap()).tasks.find((t) => (plannedId ? t.id === plannedId : t.title === "Planned work"));
async function openProject(page, view) {
  page.setDefaultTimeout(15000);
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  if (view) await selectProjectView(page, view);
}
async function saveAndClose(page) {
  await page.locator("#task-form").evaluate((form) => form.requestSubmit());
  await page.locator("[data-autosave-status]").filter({ hasText: /^Saved automatically$/ }).waitFor();
  await page.locator("[data-action=dialog-close]").click();
  await page.locator("dialog").waitFor({ state: "detached" });
}

test("rapid edits on one row are serialized without self-conflicts", async ({ page }) => {
  const { first } = app;
  await openProject(page, "table");
  // Hold the first update in flight while another cell on the same task changes.
  await page.route(`**/api/projects/${app.project.id}/tasks/${first.id}`, async (route) => {
    // Simulated network latency for the PATCH, not a wait in the test.
    if (route.request().method() === "PATCH") await new Promise((r) => setTimeout(r, 150));
    await route.continue();
  });
  await page.locator(`[data-id="${first.id}"][data-task-field="status"]`).selectOption("review");
  await page.locator(`[data-id="${first.id}"][data-task-field="priority"]`).selectOption("urgent");
  await expect.poll(async () => { const t = (await snap()).tasks.find((t) => t.id === first.id); return [t.status, t.priority]; }).toEqual(["review", "urgent"]);
  await page.unroute(`**/api/projects/${app.project.id}/tasks/${first.id}`);
  await expect(page.locator(".toast.error")).toHaveCount(0);
});

test("range paste fills title and type, and current view filters persist across reload", async ({ page }) => {
  const { first } = app;
  await openProject(page, "table");
  const title = page.locator(`[data-id="${first.id}"][data-task-field="title"]`);
  await title.click();
  await title.evaluate((el) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "Pasted title\tbug" } });
    el.dispatchEvent(event);
  });
  // Table has a Description column beside Title (edited only in the task
  // editor), so map the second clipboard column to Type in the paste review.
  await page.locator('#paste-preview [data-paste-map="1"]').selectOption("type");
  await page.locator("#paste-apply").click();
  await expect.poll(async () => { const t = (await snap()).tasks.find((t) => t.id === first.id); return [t.title, t.type]; }).toEqual(["Pasted title", "bug"]);
  await (await reveal(page.locator("#filter-assignee"))).fill("Alex");
  await page.locator("#filter-assignee").press("Tab");
  await expect(page.locator('#saved-view,[data-feature="view-save"]')).toHaveCount(0);
  await page.reload();
  await page.locator("#filter-assignee").waitFor({ state: "attached" });
  await expect(page.locator("#filter-assignee")).toHaveValue("Alex");
});

test("a custom type and a typed field reach new cards, the table, calendar and timeline", async ({ page }) => {
  await openProject(page);
  // Since 0.19.31 one top-bar Settings button opens the Settings page (project sections included).
  await openSettingsPage(page);
  await selectSettingsPage(page, "hierarchy");
  await page.locator("#workflow-form [data-type-input]").fill("research");
  await page.locator("#workflow-form [data-type-add]").click();
  await page.locator("#workflow-form [type=submit]").click();
  await page.getByText("Changes saved", { exact: true }).waitFor();
  await selectSettingsPage(page, "fields");
  await page.locator("[data-settings-add-field]").click();
  await page.locator("[data-field-name]").fill("Cost");
  await page.locator("[data-field-type]").selectOption("number");
  await page.locator("#workflow-form [type=submit]").click();
  await page.getByText("Changes saved", { exact: true }).waitFor();
  await page.locator('[data-action="settings-close"]').click();
  await newCard(page);
  await page.locator("#task-form [name=title]").fill("Planned work");
  await page.locator("[data-task-picker=type] .task-picker-trigger").click();
  await page.locator("[data-task-picker=type] [data-picker-value=research]").click();
  await page.locator("#task-form [type=submit]").click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await expect.poll(planned).toBeTruthy();
  const created = await planned();
  plannedId = created.id;
  await selectProjectView(page, "list");
  await (await reveal(page.locator("#filter-assignee"))).fill("");
  await page.locator("#filter-assignee").press("Tab");
  await selectProjectView(page, "list");
  await page.locator(`[data-action="task-open"][data-id="${created.id}"]`).first().click();
  await page.locator("#task-form [name=start]").fill("2026-10-14");
  await page.locator("#task-form [name=due]").fill("2026-10-16");
  await saveAndClose(page);
  // Since 0.15.35 the task editor has no Planning section; custom field values
  // are edited in their Table column.
  const cost = (await snap()).project.schema.fields.find((f) => f.name === "Cost");
  await selectProjectView(page, "table");
  const costCell = page.locator(`[data-table-task="${created.id}"] [data-task-field="fields.${cost.id}"]`);
  await costCell.fill("42");
  await costCell.press("Tab");
  await expect.poll(async () => (await planned()).fields?.[cost.id]).toBe(42);
  expect(Object.values((await planned()).fields)[0]).toBe(42);
  await (await reveal(page.locator("#filter-assignee"))).fill("");
  await page.locator("#filter-assignee").press("Tab");
  await selectProjectView(page, "calendar");
  await expect(page.locator(".calendar").first()).toBeAttached();
  await selectProjectView(page, "timeline");
  await expect(page.locator(".timeline-bar").first()).toBeAttached();
});

test("an editor draft recovers after closing without overwriting disk", async ({ page }) => {
  const card = await planned();
  await openProject(page, "list");
  await page.locator(`[data-action=task-open][data-id="${card.id}"]`).first().click();
  await page.locator("#task-form [name=title]").fill("Recover my draft");
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-action=dialog-close]").click();
  await page.locator(`[data-action=task-open][data-id="${card.id}"]`).first().click();
  if (await feature(page, "form-restore").count()) await clickControl(feature(page, "form-restore"));
  await expect(page.locator("#task-form [name=title]")).toHaveValue("Recover my draft");
  await saveAndClose(page);
});

test("attachment links resolve in both the web preview and the Markdown vault", async ({ page }) => {
  const card = await planned();
  await openProject(page, "list");
  await page.locator(`[data-action=task-open][data-id="${card.id}"]`).first().click();
  await page.locator("#task-form").evaluate((form) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["Local attachment"], "details.txt", { type: "text/plain" }));
    form.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  });
  await expect(page.locator("#task-form [name=body]")).toHaveValue(/\.\.\/attachments\//);
  // Since 0.15.43 attachments are listed beneath the description instead of
  // as preview links; opening one loads it from the project attachments API.
  const attachmentResponse = page.waitForResponse((response) => /\/api\/projects\/.*\/attachments\//.test(response.url()));
  await page.locator("#task-form").getByRole("button", { name: "Preview details.txt", exact: true }).click();
  expect((await attachmentResponse).status()).toBe(200);
  await page.locator("#attachment-preview pre").filter({ hasText: "Local attachment" }).waitFor();
  await page.locator("#attachment-preview [data-preview-close]").click();
  await saveAndClose(page);
  const attached = (await snap()).tasks.find((t) => t.id === card.id);
  const relative = attached.body.match(/\]\(([^)]+)\)/)[1];
  expect(await fs.readFile(path.resolve(app.root, path.dirname(attached.file), relative), "utf8")).toBe("Local attachment");
});

test("failed canvas saves survive reload and retry without discarding edits", async ({ page }) => {
  await openProject(page, "board");
  await page.locator("#zoom-label").dblclick();
  let fail = true;
  await page.route("**/api/projects/*/boards/*", (route) => (route.request().method() === "PATCH" && fail ? route.abort() : route.continue()));
  await page.locator("[data-node=n-note]").dblclick();
  await page.locator("#canvas-inline-form .inline-rich").fill("Survives a lost connection");
  await page.locator('[data-pro="search-toggle"]').click();
  await page.locator("#canvas-inline-form").waitFor({ state: "detached" });
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("pencils:pending:") && localStorage.getItem(k).includes("Survives a lost connection")));
  await page.reload();
  fail = false;
  await page.locator("#canvas").waitFor();
  await expect.poll(async () => (await snap()).boards[0].nodes.some((n) => n.text === "Survives a lost connection")).toBe(true);
});

test("multiselection, grouping, frames, resize, JSON Canvas and PNG export", async ({ page }) => {
  const node = async (id) => (await snap()).boards[0].nodes.find((n) => n.id === id);
  await openProject(page, "board");
  await page.locator("#zoom-label").dblclick();
  await page.locator("[data-node=n-note]").click();
  await page.locator("[data-node=n-note2]").click({ modifiers: ["Shift"] });
  await expect(page.locator(".board-node.selected")).toHaveCount(2);
  await clickControl(feature(page, "group"));
  await expect.poll(async () => { const [a, b] = [await node("n-note"), await node("n-note2")]; return !!a.group && a.group === b.group; }).toBe(true);
  await clickControl(feature(page, "frame-selection"));
  await expect.poll(async () => (await snap()).boards[0].nodes.some((n) => n.type === "frame")).toBe(true);
  await page.locator("#zoom-label").dblclick();
  const selectedNode = page.locator("[data-node=n-note]");
  await selectedNode.click();
  await clickControl(feature(page, "ungroup"));
  await page.locator("#canvas").click({ position: { x: 600, y: 100 } });
  await selectedNode.click();
  const handle = selectedNode.locator('.resize-handle[data-resize-corner="se"]');
  const box = await handle.boundingBox();
  const old = (await node("n-note")).w;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y + 35, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await node("n-note")).w).not.toBe(old);
  const download = page.waitForEvent("download");
  await clickControl(feature(page, "canvas-json"));
  const contents = JSON.parse(await fs.readFile(await (await download).path(), "utf8"));
  expect(contents.nodes.some((n) => n.type === "group")).toBe(true);
  expect(contents.nodes.some((n) => n.type === "file" && n.file.endsWith(".md"))).toBe(true);
  const imageDownload = page.waitForEvent("download");
  await clickControl(feature(page, "canvas-png"));
  expect((await imageDownload).suggestedFilename()).toMatch(/\.png$/);
});

test("phones reach Project settings from the drawer and the page does not overflow", async ({ page }) => {
  await openProject(page, "list");
  await page.setViewportSize({ width: 390, height: 844 });
  // Since 0.19.26 phones reach Project settings from the drawer's settings row; since 0.19.31
  // that row holds only Settings (the one Settings page, project sections included) and Help.
  await page.locator(".mobile-menu").click();
  await expect(page.locator(".phone-drawer-utilities [data-action=settings]")).toBeVisible();
  await expect(page.locator(".phone-drawer-utilities button")).toHaveText(["Settings", "Help"]);
  await page.locator(".phone-drawer-close").click();
  await page.locator(".sidebar.open").waitFor({ state: "detached" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await selectProjectView(page, "board");
  await page.locator("#canvas").waitFor();
});
