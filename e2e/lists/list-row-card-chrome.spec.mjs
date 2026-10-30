// Owner feedback, 28 October 2026: List and Tree rows carry no completion
// checkbox and no separate open button (the ID opens the card), the card view
// shows no field captions, and iPad keeps the card's secondary actions inline.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Owner project", key: "OW" });
  const statuses = ["backlog", "todo", "in-progress", "review", "done"];
  const tasks = [];
  for (let i = 0; i < 12; i++)
    tasks.push(await store.createTask(project.id, { title: `Owner task ${i}`, status: statuses[i % 5], priority: ["low", "medium", "high"][i % 3], due: "2026-11-0" + ((i % 9) + 1) }));
  const child = await store.createTask(project.id, { title: "Child task", status: "todo", parent: tasks[0].id });
  return { project, tasks, child };
});
const CAPTIONS = ["Assignee", "Priority", "Status", "Dates", "Description"];
const taskRow = (page, id) => page.locator(`.task-row[data-task-order-row="${id}"]`);
// Opens a view once its rows and the app's fonts are ready, so positions are final.
async function open(page, view) {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await taskRow(page, app.tasks[1].id).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
// Opens the second task's card from its ID.
async function openCard(page) {
  await open(page, "list");
  await taskRow(page, app.tasks[1].id).locator(".task-id:visible").click();
  const form = page.locator("#task-form");
  await form.waitFor();
  return form;
}

for (const view of ["list", "tree"]) {
  test(`${view}: the ID opens the card; no checkbox or open button`, async ({ page }) => {
    await open(page, view);
    const id = view === "tree" ? app.child.id : app.tasks[1].id;
    const row = taskRow(page, id);
    await row.waitFor();
    await expect(row.locator(".check-button, [data-action=task-check]"), "no completion checkbox in the row").toHaveCount(0);
    await expect(row.locator(".row-open"), "no separate open button in the row").toHaveCount(0);
    await row.locator(".task-id:visible").click();
    await page.locator(`#task-form[data-id="${id}"]`).waitFor();
    if (view === "tree") await expect(taskRow(page, app.tasks[0].id).locator(".tree-toggle[aria-expanded]"), "tree toggles stay").toBeVisible();
  });
}

// Owner feedback, 28 October 2026: no wasted space on the left of List and Tree rows.
const lead = (page, id) => taskRow(page, id).evaluate((row) => {
  const r = row.getBoundingClientRect();
  const box = (s) => { const el = row.querySelector(`:scope > ${s}`); if (!el || !el.getClientRects().length) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left - r.left), top: Math.round(b.top - r.top), width: Math.round(b.width), height: Math.round(b.height) }; };
  return { toggle: box(":is(.tree-toggle, .tree-toggle-spacer)"), handle: box(".task-reorder-handle"), type: box(".task-type"), assignee: box(".row-fields"), pad: parseFloat(getComputedStyle(row).paddingLeft) };
});

test("List rows have no toggle column and a narrow drag handle", async ({ page }) => {
  await open(page, "list");
  const row = await lead(page, app.tasks[1].id);
  expect(row.toggle, `no toggle slot in List ${JSON.stringify(row)}`).toBeNull();
  expect(row.handle.width, `narrow handle ${JSON.stringify(row)}`).toBe(16);
  expect(row.type.left, `type icon starts near the edge ${JSON.stringify(row)}`).toBeLessThanOrEqual(40);
});

test("Tree rows use a narrow toggle", async ({ page }) => {
  await open(page, "tree");
  for (const id of [app.tasks[0].id, app.tasks[1].id]) {
    const row = await lead(page, id);
    expect(row.toggle.width, `narrow toggle ${JSON.stringify(row)}`).toBe(24);
    expect(row.handle.width, `narrow handle ${JSON.stringify(row)}`).toBe(16);
    expect(row.type.left, `type icon follows closely ${JSON.stringify(row)}`).toBeLessThanOrEqual(70);
  }
});

// Rows wrap at 900px and below; since the sidebar opens over the content (0.20.24), that is iPad
// portrait rather than landscape.
onDevices(["ipad-portrait"], () => test("two-line rows start the second line flush left and keep 44px targets", async ({ page }) => {
  for (const view of ["list", "tree"]) {
    await open(page, view);
    const row = await lead(page, app.tasks[1].id);
    const first = view === "list" ? row.handle : row.toggle;
    if (view === "list") expect(row.toggle, "no toggle slot in List").toBeNull();
    expect(row.assignee.top, `${view}: fields sit on the second line ${JSON.stringify(row)}`).toBeGreaterThan(first.top + 20);
    expect(Math.abs(row.assignee.left - first.left), `${view}: second line starts flush left ${JSON.stringify(row)}`).toBeLessThanOrEqual(1);
    for (const part of [row.handle, view === "tree" ? row.toggle : row.handle]) expect(part.width >= 44 && part.height >= 44, `${view}: touch targets ${JSON.stringify(row)}`).toBe(true);
  }
}));

onDevices(["narrow"], () => test("in a narrow window the two-line row keeps every control visible without overlap", async ({ page }) => {
  await open(page, "list");
  const row = taskRow(page, app.tasks[1].id);
  const boxes = await row.evaluate((el) => [...el.children].filter((c) => c.getClientRects().length && getComputedStyle(c).display !== "none").map((c) => ({ name: ["task-reorder-handle", "tree-toggle", "tree-toggle-spacer", "check-button", "row-open", "task-type", "task-id", "row-title", "row-fields", "row-due", "phone-task-open"].find((n) => c.classList.contains(n)) || c.className, ...c.getBoundingClientRect().toJSON() })));
  const names = boxes.map((b) => b.name);
  for (const name of ["task-reorder-handle", "task-type", "task-id", "row-title", "row-fields", "row-due"]) expect(names, `${name} visible`).toContain(name);
  expect(!names.includes("check-button") && !names.includes("row-open"), `removed controls stay hidden: ${names}`).toBe(true);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    expect(overlap, `${a.name} overlaps ${b.name}`).toBe(false);
  }
  const rowBox = await row.boundingBox();
  for (const b of boxes) expect(b.right, `${b.name} inside the row`).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
  const title = boxes.find((b) => b.name === "row-title"), id = boxes.find((b) => b.name === "task-id"), type = boxes.find((b) => b.name === "task-type");
  expect(Math.abs(title.top - id.top) < 4 && Math.abs(id.top - type.top) < 4, "type, ID and title share the first line").toBe(true);
}));

onDevices(["phone"], () => test("phone list rows show the task summary and the drag handle only", async ({ page }) => {
  await open(page, "list");
  const row = taskRow(page, app.tasks[1].id);
  await expect(row.locator(".check-button"), "no completion checkbox on the phone row").toHaveCount(0);
  // The summary's tap area (the open button stretched over it, 29 Oct item 16).
  const summary = row.locator(".phone-task");
  const handle = row.locator(".task-reorder-handle");
  await expect(summary).toBeVisible();
  await expect(handle).toBeVisible();
  const s = await summary.boundingBox(), h = await handle.boundingBox(), r = await row.boundingBox();
  expect(s.height >= 44 && h.height >= 44, "touch targets keep 44px").toBe(true);
  expect(s.x, `summary starts at the row edge: ${s.x} vs ${r.x}`).toBeLessThanOrEqual(r.x + 8);
  expect(s.x + s.width, "summary ends before the handle").toBeLessThanOrEqual(h.x + 1);
  await row.locator(".phone-task-open").click();
  await page.locator(`#task-form[data-id="${app.tasks[1].id}"]`).waitFor();
}));

test("the card view shows no field captions but keeps accessible names", async ({ page }) => {
  const form = await openCard(page);
  const visibleText = await form.evaluate((el) => {
    const texts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, text = node.textContent.trim();
      if (!text) continue;
      const parent = node.parentElement;
      if (!parent.getClientRects().length) continue;
      const box = parent.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      if (parent.closest("select, option, .selection-popover, .task-picker-menu, .task-picker-panel")) continue;
      texts.push(text);
    }
    return texts;
  });
  for (const caption of CAPTIONS) expect(visibleText, `${caption} caption is not shown: ${visibleText.join(" | ")}`).not.toContain(caption);
  for (const [selector, name] of [['select[name="status"]', "Status"], ['select[name="assignee"]', "Assignee"], ['input[name="start"]', "Start date"], ['input[name="due"]', "Due date"], ['.inline-rich[role="textbox"]', "Task description"]])
    await expect(form.locator(selector), `${selector} keeps its accessible name`).toHaveAttribute("aria-label", name);
  const tops = await form.evaluate(() => [...document.querySelectorAll(".task-metadata-main > *")].map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(Math.max(...tops) - Math.min(...tops), `fields share one line: ${tops}`).toBeLessThanOrEqual(2);
});

onDevices(["ipad"], () => test("iPad keeps the card's secondary actions in the header row without the More button", async ({ page }) => {
  const form = await openCard(page);
  await expect(form.locator('[data-action="dialog-close"]')).toBeVisible();
  await expect(form.locator(".task-secondary-actions button"), "duplicate, archive and delete show in one group").toHaveCount(3);
  const close = await form.locator('[data-action="dialog-close"]').boundingBox();
  const centre = (b) => b.y + b.height / 2;
  for (const selector of ['[data-feature="task-duplicate"]', '[data-feature="task-archive"]', '[data-action="task-delete"]', '[data-editor-pane="details"]']) {
    const button = form.locator(selector);
    await expect(button, `${selector} visible`).toBeVisible();
    const box = await button.boundingBox();
    expect(Math.abs(centre(box) - centre(close)), `${selector} sits on the close button's line: ${centre(box)} vs ${centre(close)}`).toBeLessThanOrEqual(3);
    expect(box.height, `${selector} keeps a 44px target`).toBeGreaterThanOrEqual(44);
  }
  const actions = await form.locator(".task-editor-actions").evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(actions.scroll, `actions fit the header: ${JSON.stringify(actions)}`).toBeLessThanOrEqual(actions.client + 1);
  // The groups and Close keep the 10px spacing of the rows below (29 Oct).
  const group = await form.locator(".task-secondary-actions").boundingBox();
  expect(Math.round(close.x - group.x - group.width), "spacing before Close").toBe(10);
}));
