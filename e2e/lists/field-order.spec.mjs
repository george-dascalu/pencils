// Owner rule, 28 October 2026: every component shows task fields in the order
// card type, ID, assignee, status, priority. Relationship rows show the assignee
// as an avatar only, and the Add relationship panel keeps its type menu, search
// and close button on one row without a caption.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Field order", key: "FO" });
  const tasks = [];
  for (let i = 0; i < 5; i++)
    tasks.push(await store.createTask(project.id, { title: `Ordered task ${i}`, status: ["todo", "in-progress", "review", "done", "backlog"][i], priority: ["low", "medium", "high"][i % 3], assignee: "George Dascalu", due: "2026-11-12" }));
  await store.createTask(project.id, { title: "Linked child", status: "todo", priority: "high", assignee: "George Dascalu", parent: tasks[0].id });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "card-a", type: "task", task: tasks[1].id, x: 200, y: 160, w: 320, h: 240 }] });
  return { project, tasks, board };
});
const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;

// Left edges of the named parts inside one container, in the order given.
async function lefts(locator, selectors) {
  return locator.evaluate((root, selectors) => selectors.map((s) => {
    const el = [...root.querySelectorAll(s)].find((e) => e.getClientRects().length);
    return el ? Math.round(el.getBoundingClientRect().left) : null;
  }), selectors);
}
function assertIncreasing(values, names, label) {
  expect(values.every((v) => v !== null), `${label}: every field is visible ${JSON.stringify(Object.fromEntries(names.map((n, i) => [n, values[i]])))}`).toBe(true);
  for (let i = 1; i < values.length; i++) expect(values[i], `${label}: ${names[i - 1]} comes before ${names[i]} ${JSON.stringify(values)}`).toBeGreaterThan(values[i - 1]);
}
// Relationship rows may put the fields on a second line in narrow panels (0.19.10).
async function assertRelationshipOrder(locator, selectors, label) {
  const names = ["type", "ID", "title", "assignee", "status", "priority"];
  const boxes = await locator.evaluate((root, selectors) => selectors.map((s) => { const el = root.querySelector(s); const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top) }; }), selectors);
  // Phones lay a relationship out like a List row: the title, then the type, ID and fields (30 Oct).
  if (boxes[2].top + 4 < boxes[0].top) {
    const rest = [0, 1, 3, 4, 5];
    return assertIncreasing(rest.map((i) => boxes[i].left), rest.map((i) => names[i]), `${label} below the title`);
  }
  const twoLines = boxes[3].top > boxes[2].top + 4;
  if (!twoLines) return assertIncreasing(boxes.map((b) => b.left), names, label);
  assertIncreasing(boxes.slice(0, 3).map((b) => b.left), names.slice(0, 3), `${label} first line`);
  assertIncreasing(boxes.slice(3).map((b) => b.left), names.slice(3), `${label} second line`);
}
// Opens a card editor once its relationship rows and the app's fonts are ready.
async function openCard(page, id = app.tasks[0].id) {
  await page.goto(url("list"));
  await page.locator(".task-row").first().waitFor();
  await page.locator(`[data-action="task-open"][data-id="${id}"]:visible`).first().click();
  await page.locator("#task-form").waitFor();
  await page.locator("#task-form .task-relationship-row").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

onDevices(["desktop", "narrow", "ipad"], () => test("list and tree rows read type, ID, assignee, status, priority", async ({ page }) => {
  for (const view of ["list", "tree"]) {
    await page.goto(url(view));
    const row = page.locator(`.task-row[data-task-order-row="${app.tasks[1].id}"]`);
    await row.waitFor();
    const names = ["type", "ID", "assignee", "status", "priority"];
    const values = await lefts(row, [":scope > .task-type", ":scope > .task-id", ":scope > .row-fields > .row-assignee", ":scope > .row-fields > .row-status", ":scope > .row-fields > .row-priority"]);
    // On narrow rows assignee, status and priority share the second line.
    // Narrow rows wrap onto two lines (grid until 0.19.11, wrapping flex lines since 0.19.12).
    if (await row.evaluate((el) => { const cs = getComputedStyle(el); return cs.display === "grid" || cs.flexWrap === "wrap"; })) assertIncreasing(values.slice(2), names.slice(2), `${view} second line`);
    else assertIncreasing(values, names, view);
  }
}));

onDevices(["phone"], () => test("phone list summary reads type, ID, assignee, status, priority", async ({ page }) => {
  await page.goto(url("list"));
  const meta = page.locator(`.task-row[data-task-order-row="${app.tasks[1].id}"] .phone-task-meta`);
  await meta.waitFor();
  assertIncreasing(await lefts(meta, [":scope > .icon", ":scope > span:not([class])", ":scope > .field-box .task-assignee", ":scope > .field-box .phone-task-status", ":scope > .field-box .phone-task-priority"]), ["type", "ID", "assignee", "status", "priority"], "phone summary");
}));

onDevices(["desktop", "ipad", "phone"], () => {
  test("card fields read assignee, status, priority", async ({ page }) => {
    await openCard(page);
    const fields = page.locator("#task-form .task-metadata-main");
    assertIncreasing(await lefts(fields, [".task-assignee-choice", 'select[name="status"]', '[data-task-picker="priority"] .task-picker-trigger']), ["assignee", "status", "priority"], "card fields");
  });

  test("relationship rows read type, ID, title, assignee avatar, status, priority", async ({ page }) => {
    await openCard(page);
    const row = page.locator(".task-relationship-row .task-relationship-link").first();
    await row.waitFor();
    await assertRelationshipOrder(row, [":scope > .icon", ".task-relationship-key", ".task-relationship-title", ".task-relationship-assignee", ".task-relationship-status", ".task-relationship-priority"], "relationship row");
    const assigneeText = await row.locator(".task-relationship-assignee").evaluate((el) => el.innerText.replace(/\s+/g, " ").trim());
    expect(assigneeText, "assignee shows the avatar only").toBe("GD");
    await expect(row.locator(".task-relationship-assignee"), "assignee name stays available to assistive tech").toHaveAttribute("aria-label", /George Dascalu/);
  });

  test("the Add relationship panel keeps one row without a caption and lists results in field order", async ({ page }) => {
    await openCard(page);
    await page.locator("[data-relationship-toggle]").click();
    const picker = page.locator("[data-relationship-picker]");
    await picker.waitFor();
    const controls = await picker.evaluate((el) => {
      const box = (s) => { const r = el.querySelector(s).getBoundingClientRect(); return { left: r.left, right: r.right, centre: r.top + r.height / 2, height: r.height }; };
      return { type: box("select"), search: box('input[type="search"]'), close: box("[data-relationship-close]"), text: el.innerText };
    });
    expect(/(^|\n)\s*Relationship\s*(\n|$)/.test(controls.text), `no Relationship caption: ${JSON.stringify(controls.text.slice(0, 60))}`).toBe(false);
    for (const name of ["search", "close"]) expect(Math.abs(controls[name].centre - controls.type.centre), `${name} shares the type row ${JSON.stringify(controls)}`).toBeLessThanOrEqual(2);
    expect(controls.type.right <= controls.search.left && controls.search.right <= controls.close.left, `type, search, close left to right ${JSON.stringify(controls)}`).toBe(true);
    const pickerBox = await picker.boundingBox();
    const viewport = page.viewportSize();
    expect(pickerBox.x >= 0 && pickerBox.x + pickerBox.width <= viewport.width + 1, "panel stays inside the viewport").toBe(true);
    await picker.locator('input[type="search"]').fill("Ordered task 2");
    const option = picker.locator("[data-relationship-options] button").filter({ hasText: "Ordered task 2" }).first();
    await option.waitFor();
    await assertRelationshipOrder(option, [".task-relationship-link > .icon:first-child", ".task-relationship-key", ".task-relationship-title", ".task-relationship-assignee", ".task-relationship-status", ".task-relationship-priority"], "search result");
    expect(await option.locator(".task-relationship-assignee").evaluate((el) => el.innerText.trim()), "search result assignee shows the avatar only").toBe("GD");
  });
});

test("the relationship sort menu lists assignee, status, priority", async ({ page }) => {
  await openCard(page);
  const options = await page.locator(".task-relationship-sort [role=option]").allTextContents();
  expect(options.slice(1)).toEqual(["Assignee", "Status", "Priority"]);
});

test("a board task card reads assignee, status, priority", async ({ page }) => {
  await page.goto(url(`board/${app.board.id}`));
  const state = page.locator('[data-node="card-a"] .live-card-state');
  await state.waitFor();
  assertIncreasing(await lefts(state, [".canvas-task-assignee", ".canvas-task-status", ".canvas-task-priority"]), ["assignee", "status", "priority"], "board card");
});

test("table default columns put assignee before status before priority", async ({ page }) => {
  await page.goto(url("table"));
  await page.locator(".spreadsheet th[data-column-key]").first().waitFor();
  const keys = await page.locator(".spreadsheet th[data-column-key]").evaluateAll((els) => els.map((el) => el.dataset.columnKey));
  const at = (k) => keys.indexOf(k);
  expect(at("type") < at("assignee") && at("assignee") < at("status") && at("status") < at("priority"), `column order ${keys}`).toBe(true);
  expect(keys.slice(0, 2), "ID and title stay pinned first").toEqual(["key", "title"]);
});
