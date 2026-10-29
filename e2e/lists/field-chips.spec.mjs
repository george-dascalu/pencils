// Owner feedback, 28 October 2026: assignee, status and priority look the same
// everywhere, using the card editor as the reference (height, width, radius,
// border, tint). Relationship statuses share one width; List and Tree put the
// title right after the ID.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Field chips", key: "FC" });
  const parent = await store.createTask(project.id, { title: "Parent task", status: "in-progress", priority: "high", assignee: "George" });
  const children = [];
  for (const [i, status] of ["done", "todo", "in-progress", "review"].entries())
    children.push(await store.createTask(project.id, { title: `Child task ${i}`, status, priority: ["low", "medium", "high", "urgent"][i], assignee: i % 2 ? "Alex" : "", parent: parent.id }));
  await store.createTask(project.id, { title: "Loose task", status: "todo", priority: "medium", assignee: "Alex" });
  return { project, parent, children };
});
const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;

// Opens a view once its rows (or cards) and the app's fonts are ready, so sizes are final.
async function openView(page, view, ready) {
  await page.goto(url(view));
  await page.locator(ready).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}
// Geometry and chrome of the first visible match.
const look = (page, selector) => page.evaluate((selector) => {
  const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length);
  if (!el) return null;
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), radius: cs.borderTopLeftRadius, border: cs.borderTopWidth, tinted: cs.backgroundColor !== "rgba(0, 0, 0, 0)", font: cs.fontSize };
}, selector);
const surfaceColor = (page) => page.evaluate(() => { const el = document.createElement("span"); el.style.background = "var(--surface)"; document.body.append(el); const c = getComputedStyle(el).backgroundColor; el.remove(); return c; });
// The parent's card editor, with its four relationship rows, is the reference.
async function reference(page) {
  await openView(page, "list", ".task-row");
  await page.locator(`[data-action="task-open"][data-id="${app.parent.id}"]:visible`).first().click();
  await page.locator("#task-form").waitFor();
  await expect(page.locator("#task-form .task-relationship-row")).toHaveCount(4);
  return {
    assignee: await look(page, "#task-form .task-assignee-choice .task-assignee"),
    status: await look(page, '#task-form select[name="status"]'),
    priority: await look(page, '#task-form [data-task-picker="priority"] .task-picker-trigger'),
  };
}
// Lists (rows, relationships, Table, Kanban) share one smaller chip than the card
// editor, sitting inside its 32/44px target with room above and below (28 Oct 2026).
const LIST = { desktop: { size: 24, priority: 32, status: 104 }, ipad: { size: 32, priority: 40, status: 120 }, phone: { size: 32, priority: 40, status: 120 } };
// Space between a chip and the edges of the box that holds it.
const room = (page, chip, holder) => page.evaluate(([chip, holder]) => {
  const c = [...document.querySelectorAll(chip)].find((e) => e.getClientRects().length);
  const h = c.closest(holder).getBoundingClientRect(), r = c.getBoundingClientRect();
  return { top: Math.round(r.top - h.top), bottom: Math.round(h.bottom - r.bottom), holder: Math.round(h.height) };
}, [chip, holder]);
function listChips(ref, list, chips, label) {
  expect(chips.assignee.h, `${label} assignee ${JSON.stringify(chips.assignee)}`).toBe(list.size);
  expect(chips.assignee.w, `${label} assignee width`).toBe(list.size);
  expect(chips.assignee.radius, `${label} assignee is a rounded square like the status`).toBe(ref.status.radius);
  if (chips.status) {
    expect(chips.status.h, `${label} status ${JSON.stringify(chips.status)}`).toBe(list.size);
    expect(chips.status.radius, `${label} status radius`).toBe(ref.status.radius);
    expect(chips.status.border).toBe("1px");
    expect(chips.status.tinted, `${label} status tint`).toBe(true);
  }
  expect(chips.priority.h, `${label} priority ${JSON.stringify(chips.priority)}`).toBe(list.size);
  expect(chips.priority.w, `${label} priority width`).toBe(list.priority);
  expect(chips.priority.radius, `${label} priority radius`).toBe(ref.priority.radius);
  expect(chips.priority.tinted, `${label} priority tint`).toBe(true);
  expect(list.size, "lists are smaller than the card editor").toBeLessThan(ref.assignee.h);
}

// Owner feedback, 28 October 2026: values differ by border and text colour only;
// the fill stays the neutral surface in every view and theme.
test("fields colour only their border and text", async ({ page }) => {
  await reference(page);
  const paint = (selector) => page.evaluate((selector) => [...document.querySelectorAll(selector)].filter((el) => el.getClientRects().length).map((el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, border: cs.borderTopColor, ink: cs.color }; }), selector);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
    // Colours may ease between themes; read them once no transition is running.
    await page.waitForFunction(() => !document.getAnimations().some((a) => a instanceof CSSTransition && a.playState === "running"));
    const surface = await surfaceColor(page);
    const neutral = (items, label) => {
      expect(items.length, `${label}: at least two values`).toBeGreaterThanOrEqual(2);
      for (const item of items) expect(item.bg, `${theme} ${label} fill is neutral ${JSON.stringify(items)}`).toBe(surface);
      expect(new Set(items.map((i) => i.border)).size, `${theme} ${label} borders vary ${JSON.stringify(items)}`).toBeGreaterThan(1);
      expect(new Set(items.map((i) => i.ink)).size, `${theme} ${label} text colours vary ${JSON.stringify(items)}`).toBeGreaterThan(1);
    };
    neutral(await paint(".task-relationship-status"), "relationship status");
    neutral(await paint(".task-relationship-priority"), "relationship priority");
    expect((await paint('#task-form select[name="status"]'))[0].bg, `${theme} card status fill`).toBe(surface);
    expect((await paint('#task-form [data-task-picker="priority"] .task-picker-trigger'))[0].bg, `${theme} card priority fill`).toBe(surface);
  }
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "light" }));
  await openView(page, "list", ".task-row");
  const rows = await page.evaluate(() => {
    const surface = (() => { const el = document.createElement("span"); el.style.background = "var(--surface)"; document.body.append(el); const c = getComputedStyle(el).backgroundColor; el.remove(); return c; })();
    const read = (s) => [...document.querySelectorAll(s)].filter((el) => el.getClientRects().length).map((el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, border: cs.borderTopColor }; });
    return { surface, status: read(".task-row .row-status .field-chip"), priority: read(".task-row .row-priority .field-chip"), assignee: read(".task-row .row-assignee .task-assignee:not(.unassigned)") };
  });
  for (const key of ["status", "priority", "assignee"]) {
    expect(rows[key].every((r) => r.bg === rows.surface), `row ${key} fill is neutral ${JSON.stringify(rows[key])}`).toBe(true);
    expect(new Set(rows[key].map((r) => r.border)).size, `row ${key} borders vary`).toBeGreaterThan(1);
  }
});

// Owner feedback, 28 October 2026: every task assignee avatar is a rounded square
// with the status corner radius, in every view.
onDevices(["desktop", "phone"], () => test("assignee avatars are rounded squares everywhere", async ({ page, device }) => {
  const ref = await reference(page);
  const radius = (selector) => page.evaluate((selector) => [...document.querySelectorAll(selector)].filter((el) => el.getClientRects().length).map((el) => getComputedStyle(el).borderTopLeftRadius), selector);
  const square = (values, label) => {
    expect(values.length, `${label}: avatar visible`).toBeGreaterThan(0);
    for (const v of values) expect(v !== "50%" && parseFloat(v) >= 4 && parseFloat(v) <= parseFloat(ref.status.radius), `${label} radius ${values}`).toBe(true);
  };
  square(await radius("#task-form .task-assignee"), "card");
  square(await radius(".task-relationship-assignee .task-assignee"), "relationships");
  await openView(page, "list", ".task-row");
  square(await radius(device === "phone" ? ".phone-task-meta .task-assignee" : ".task-row .row-assignee .task-assignee"), "list");
  if (device === "desktop") {
    await openView(page, "kanban", ".kanban-card");
    square(await radius(".kanban-card .task-assignee"), "kanban");
    await openView(page, "table", ".spreadsheet [data-table-task]");
    square(await radius('.spreadsheet td[data-column-key="assignee"] .task-assignee'), "table");
  }
}));

onDevices(["desktop", "ipad"], () => test("card editor keeps its full-size fields", async ({ page, device }) => {
  const ref = await reference(page);
  const control = device === "desktop" ? 32 : 44;
  expect([ref.assignee.h, ref.status.h, ref.priority.h, ref.priority.w]).toEqual([control, control, control, control + 12]);
}));

onDevices(["desktop", "ipad", "phone"], () => test("relationship rows use the list chips, with one status width and room around them", async ({ page, device }) => {
  const ref = await reference(page);
  const list = LIST[device];
  listChips(ref, list, {
    assignee: await look(page, ".task-relationship-assignee .task-assignee"),
    status: await look(page, ".task-relationship-status"),
    priority: await look(page, ".task-relationship-priority"),
  }, "relationship");
  const widths = await page.locator(".task-relationship-row .task-relationship-status").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
  expect(widths).toHaveLength(4);
  expect([...new Set(widths)], `status widths ${widths}`).toEqual([list.status]);
  const space = await room(page, ".task-relationship-row .task-relationship-status", ".task-relationship-row");
  expect(space.top >= 4 && space.bottom >= 4, `room above and below ${JSON.stringify(space)}`).toBe(true);
  const rows = await page.locator(".task-relationship-row").evaluateAll((els) => els.map((row) => {
    const parts = [...row.querySelectorAll(".task-relationship-key, .task-relationship-title, .task-relationship-assignee, .task-relationship-status, .task-relationship-priority")].map((el) => el.getBoundingClientRect());
    const overlap = parts.some((a, i) => parts.some((b, j) => j > i && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
    return { overlap, title: Math.round(row.querySelector(".task-relationship-title").getBoundingClientRect().width), right: Math.max(...parts.map((p) => p.right)), rowRight: row.getBoundingClientRect().right };
  }));
  for (const row of rows) {
    expect(row.overlap, `row parts do not overlap ${JSON.stringify(row)}`).toBe(false);
    expect(row.title, `title keeps room ${JSON.stringify(row)}`).toBeGreaterThanOrEqual(80);
    expect(row.right, `row fits ${JSON.stringify(row)}`).toBeLessThanOrEqual(row.rowRight + 1);
  }
  await page.locator("[data-relationship-toggle]").click();
  await page.locator("[data-relationship-picker] input[type=search]").fill("Loose");
  await page.locator("[data-relationship-options] .task-relationship-option").first().waitFor();
  const result = await look(page, "[data-relationship-options] .task-relationship-priority");
  expect([result.h, result.w], "search results use the same chips").toEqual([list.size, list.priority]);
}));

onDevices(["desktop", "ipad"], () => test("List and Tree rows use the list chips, keep touch targets and put the title after the ID", async ({ page, device }) => {
  const ref = await reference(page);
  const list = LIST[device];
  const row = `.task-row[data-task-order-row="${app.children[1].id}"]`;
  for (const view of ["list", "tree"]) {
    await openView(page, view, row);
    listChips(ref, list, {
      assignee: await look(page, `${row} .row-assignee .task-assignee`),
      status: await look(page, `${row} .row-status .field-chip`),
      priority: await look(page, `${row} .row-priority .field-chip`),
    }, view);
    const widths = await page.locator(".task-row > .row-status .field-chip").evaluateAll((els) => [...new Set(els.filter((el) => el.getClientRects().length).map((el) => Math.round(el.getBoundingClientRect().width)))]);
    expect(widths, `${view} status widths`).toEqual([list.status]);
    for (const part of ["row-status", "row-priority"]) {
      const space = await room(page, `${row} > .${part} .field-chip`, `.${part}`);
      expect(space.top >= 4 && space.bottom >= 4, `${view} ${part} has room above and below ${JSON.stringify(space)}`).toBe(true);
      if (device !== "desktop") expect(space.holder, `${view} ${part} keeps a 44px target ${JSON.stringify(space)}`).toBeGreaterThanOrEqual(44);
    }
    const order = await page.locator(row).evaluate((el) => {
      const box = (s) => el.querySelector(`:scope > ${s}`).getBoundingClientRect();
      return { id: box(".task-id"), title: box(".row-title"), assignee: box(".row-assignee") };
    });
    expect(Math.abs(order.id.top - order.title.top) < 4 && order.title.left > order.id.left, `${view}: title follows the ID ${JSON.stringify(order)}`).toBe(true);
  }
}));

// Owner feedback, 28 October 2026: the phone List and Tree summary line uses the
// same chips as every other list.
onDevices(["phone"], () => test("phone List and Tree summaries use the list chips", async ({ page }) => {
  const ref = await reference(page);
  for (const view of ["list", "tree"]) {
    const meta = `.task-row[data-task-order-row="${app.children[1].id}"] .phone-task-meta`;
    await openView(page, view, meta);
    const chips = {
      assignee: await look(page, `${meta} .task-assignee`),
      status: await look(page, `${meta} .phone-task-status`),
      priority: await look(page, `${meta} .phone-task-priority`),
    };
    listChips(ref, LIST.phone, chips, `${view} phone summary`);
    const surface = await surfaceColor(page);
    await expect(page.locator(`${meta} .phone-task-status`), "neutral fill like the other lists").toHaveCSS("background-color", surface);
    await expect(page.locator(`.task-row[data-task-order-row="${app.children[0].id}"] .phone-task-meta .task-assignee`), "unassigned cards show the empty avatar like other lists").toHaveCount(1);
    const row = await page.locator(`.task-row[data-task-order-row="${app.children[1].id}"]`).boundingBox();
    expect(row.height, `rows stay compact: ${row.height}`).toBeLessThanOrEqual(76);
  }
}));

onDevices(["desktop", "ipad"], () => test("Table cells use the list chips with room in each cell", async ({ page, device }) => {
  const ref = await reference(page);
  const list = LIST[device];
  const row = `[data-table-task="${app.children[1].id}"]`;
  await openView(page, "table", row);
  listChips(ref, list, {
    assignee: await look(page, `${row} td[data-column-key="assignee"] .task-assignee`),
    status: await look(page, `${row} td[data-column-key="status"] .table-cell-value`),
    priority: await look(page, `${row} td[data-column-key="priority"] .table-cell-value`),
  }, "table");
  for (const key of ["status", "priority"]) {
    const space = await room(page, `${row} td[data-column-key="${key}"] .table-cell-value`, "td");
    expect(space.top >= 4 && space.bottom >= 4, `${key} cell has room ${JSON.stringify(space)}`).toBe(true);
    const target = await page.locator(`${row} td[data-column-key="${key}"] select`).boundingBox();
    if (device !== "desktop") expect(target.height, `${key} keeps a 44px target`).toBeGreaterThanOrEqual(44);
  }
}));

onDevices(["desktop", "ipad"], () => test("Kanban cards use the list chips", async ({ page, device }) => {
  const ref = await reference(page);
  const card = `[data-drag-task="${app.children[1].id}"]`;
  await openView(page, "kanban", card);
  listChips(ref, LIST[device], { assignee: await look(page, `${card} .task-assignee`), priority: await look(page, `${card} .priority`) }, "kanban");
}));
