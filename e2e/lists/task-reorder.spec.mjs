// Task rows reorder by dragging their handle or with Alt+Up/Down in Table, List and
// Tree: the manual order is saved (also for source tasks, without editing their remote
// fields) and clears explicit sorting; cancelling, selecting and editing leave it alone;
// filtered moves keep hidden tasks in place; Tree moves whole families and never
// reparents; List and Table moves across groups keep the status; off-page rows stay put,
// edges auto-scroll, and phones drag with a 44px touch handle.
// Desktop tests belong to the cross-browser release gate.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const gate = { tag: "@gate" };
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Reorder tasks" });
  const a = await store.createTask(project.id, { title: "Alpha", order: 0 });
  const b = await store.createTask(project.id, { title: "Beta", order: 1024 });
  const c = await store.createTask(project.id, { title: "Charlie", order: 2048, status: "backlog" });
  const d = await store.createTask(project.id, { title: "Delta", order: 3072 });
  const child = await store.createTask(project.id, { title: "Alpha child", parent: a.id, order: 4096 });
  const child2 = await store.createTask(project.id, { title: "Alpha second child", parent: a.id, order: 5120 });
  await store.createTask(project.id, { title: "Archived", archived: true, order: 6144 });
  const sourceFile = store.file(project.id, "tasks", d.id), sourceRecord = await store.read(sourceFile);
  await store.write(sourceFile, { ...sourceRecord.data, source: { provider: "jira", external_id: "one", key: "JIRA-1" } }, sourceRecord.body, sourceRecord);
  const longProject = await store.createProject({ title: "Long manual order" });
  const many = [];
  for (let i = 0; i < 105; i++) many.push(await store.createTask(longProject.id, { title: `Task ${String(i).padStart(3, "0")}`, order: i * 1024 }));
  return { project, a, b, c, d, child, child2, longProject, many };
});

const ids = (page) => page.locator("#view-content [data-task-order-row]").evaluateAll((rows) => rows.map((r) => r.dataset.taskOrderRow));
const handle = (page, id) => page.locator(`[data-task-reorder="${id}"]`);
const row = (page, id) => page.locator(`#view-content [data-task-order-row="${id}"]`);
const tasks = async (project = app.project) => (await app.store.snapshot(project.id)).tasks;
const byOrder = (list) => [...list].sort((x, y) => x.order - y.order).map((t) => t.id);
// Every queued save has been answered.
async function settled(page) {
  await page.waitForFunction(() => Object.keys(localStorage).filter((k) => k.startsWith("pencils:pending:") && !k.endsWith(":lease")).every((k) => !JSON.parse(localStorage.getItem(k) || "[]").length));
}
const waitOrder = (page, expected) => expect.poll(() => ids(page), "row order").toEqual(expected);
async function start(page, id) {
  await handle(page, id).scrollIntoViewIfNeeded();
  const b = await handle(page, id).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 8, { steps: 3 });
  await page.locator(".task-reorder-ghost").waitFor();
}
async function drag(page, id, target, after = false) {
  await start(page, id);
  const b = await row(page, target).boundingBox();
  await page.mouse.move(b.x + 25, b.y + b.height * (after ? 0.8 : 0.2), { steps: 12 });
  await page.mouse.up();
  await settled(page);
}
async function key(page, id, direction) {
  await handle(page, id).focus();
  await page.keyboard.press(`Alt+Arrow${direction}`);
  await settled(page);
}
async function open(page, view, project = app.project) {
  await page.goto(`${app.base}/#project/${project.id}/${view}`);
  await row(page, project === app.project ? app.a.id : app.many[0].id).waitFor();
}
const follows = (list, id, before, offset = 1) => list.indexOf(id) === list.indexOf(before) + offset;

test.describe("desktop", () => {
  test.use({ viewportSize: { width: 1500, height: 1000 } });

  test("dragging a table row saves the manual order, clears sorting, keeps focus and survives reload", gate, async ({ page }) => {
    await open(page, "table");
    await page.locator('[data-table-sort-column="title"]').click();
    await expect(page.locator('.spreadsheet th[aria-sort="ascending"]')).toHaveCount(1);
    const before = await ids(page);
    const expected = [app.d.id, ...before.filter((id) => id !== app.d.id)];
    await drag(page, app.d.id, before[0]);
    await waitOrder(page, expected);
    await expect(page.locator('.spreadsheet th[aria-sort="ascending"]'), "Explicit sorts clear for manual order").toHaveCount(0);
    await expect(handle(page, app.d.id)).toBeFocused();
    await expect(page.locator("#task-form"), "Dropping does not open the editor").toHaveCount(0);
    await Promise.all([page.waitForEvent("domcontentloaded"), page.evaluate(() => location.reload())]);
    await waitOrder(page, expected);
    const family = [app.child.id, app.child2.id];
    const persisted = byOrder((await tasks()).filter((t) => !t.archived));
    expect(persisted.filter((id) => !family.includes(id)), "Root order persists while descendants remain with their family in the table").toEqual(expected.filter((id) => !family.includes(id)));
    expect((await tasks()).find((t) => t.id === app.d.id).title, "Source tasks can be locally ordered without editing remote fields").toBe("Delta");
  });

  test("cancelling a drag, selecting rows and editing cells leave the order alone", gate, async ({ page }) => {
    await open(page, "table");
    const current = await ids(page);
    await start(page, app.a.id);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await waitOrder(page, current);
    await start(page, app.a.id);
    await page.mouse.move(5, 5);
    await page.mouse.up();
    await waitOrder(page, current);
    await row(page, app.b.id).locator("td[data-cell]").first().click();
    await row(page, app.b.id).locator("td[data-cell]").nth(2).click({ modifiers: ["Shift"] });
    await expect(row(page, app.b.id).locator("td.range-selected")).toHaveCount(3);
    await row(page, app.b.id).locator('input[data-task-field="title"]').fill("Beta edited");
    await row(page, app.b.id).locator('input[data-task-field="title"]').press("Tab");
    await settled(page);
    await expect.poll(async () => (await tasks()).find((t) => t.id === app.b.id).title).toBe("Beta edited");
    await waitOrder(page, current);
  });

  test("reordering a filtered table keeps every hidden task in place", gate, async ({ page }) => {
    await open(page, "table");
    const hidden = async () => byOrder((await tasks()).filter((t) => !t.title.startsWith("Alpha")));
    const hiddenBefore = await hidden();
    await page.locator("#search").fill("Alpha");
    await expect(page.locator("#view-content [data-task-order-row]")).toHaveCount(3);
    const filtered = await ids(page);
    await drag(page, filtered.at(-1), filtered[1]);
    await waitOrder(page, [filtered[0], filtered.at(-1), ...filtered.slice(1, -1)]);
    expect(await hidden()).toEqual(hiddenBefore);
  });

  test("Tree moves siblings and whole families by keyboard and never reparents by drag", gate, async ({ page }) => {
    const { a, b, child, child2 } = app;
    await open(page, "tree");
    // Move siblings, then a parent with its descendants. Do not reparent by drag.
    await key(page, child.id, "Up");
    await expect.poll(async () => follows(await ids(page), child.id, a.id)).toBe(true);
    await key(page, a.id, "Down");
    await expect.poll(async () => { const tree = await ids(page); return follows(tree, child.id, a.id) && follows(tree, child2.id, a.id, 2); }).toBe(true);
    const tree = await ids(page);
    await start(page, child.id);
    const nonSibling = await row(page, b.id).boundingBox();
    await page.mouse.move(nonSibling.x + 25, nonSibling.y + 10);
    await page.mouse.up();
    await waitOrder(page, tree);
    expect((await tasks()).find((t) => t.id === child.id).parent).toBe(a.id);
    await row(page, a.id).locator(".tree-toggle").click();
    await key(page, a.id, "Up");
    await row(page, a.id).locator(".tree-toggle").click();
    await expect.poll(async () => follows(await ids(page), child.id, a.id)).toBe(true);
  });

  test("List moves a task across status groups without changing its status, and keeps the layout on reload", gate, async ({ page }) => {
    const { c, d } = app;
    await open(page, "list");
    const status = (await tasks()).find((t) => t.id === c.id).status;
    await drag(page, c.id, d.id, true);
    await expect(page.locator(".list-group")).toHaveCount(1);
    expect((await tasks()).find((t) => t.id === c.id).status).toBe(status);
    await expect.poll(async () => follows(await ids(page), c.id, d.id)).toBe(true);
    const list = await ids(page);
    await Promise.all([page.waitForEvent("domcontentloaded"), page.evaluate(() => location.reload())]);
    await waitOrder(page, list);
    await key(page, c.id, "Up");
    await expect(handle(page, c.id)).toBeFocused();
  });

  test("a cross-group drop in a grouped table clears the grouping", gate, async ({ page }) => {
    const { b, c } = app;
    await open(page, "table");
    await page.locator('[data-board-menu="table-groups"] > summary').click();
    await page.locator('[data-table-group="0"]').selectOption("status");
    await page.keyboard.press("Escape");
    await drag(page, c.id, b.id, true);
    await expect(page.locator(".table-group-row"), "Cross-group table drop clears grouping").toHaveCount(0);
    await expect.poll(async () => follows(await ids(page), c.id, b.id)).toBe(true);
  });

  test("ordering across pages keeps off-page rows stable, and holding a drag at the edge scrolls the table", gate, async ({ page }) => {
    const { many, longProject } = app;
    await open(page, "table", longProject);
    await page.locator('[data-feature="page-next"]').click();
    await drag(page, many[104].id, many[100].id);
    await waitOrder(page, [many[104].id, ...many.slice(100, 104).map((t) => t.id)]);
    const longSaved = byOrder(await tasks(longProject));
    expect(longSaved.slice(0, 100)).toEqual(many.slice(0, 100).map((t) => t.id));
    await page.locator('[data-feature="page-prev"]').click();
    await start(page, many[0].id);
    const scrollBox = await page.locator(".table-scroll").boundingBox();
    await page.mouse.move(scrollBox.x + 25, scrollBox.y + scrollBox.height - 15);
    await page.waitForFunction(() => document.querySelector(".table-scroll").scrollTop > 150);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(byOrder(await tasks(longProject))).toEqual(longSaved);
  });
});

onDevices(["phone"], () => {
  for (const view of ["table", "list", "tree"]) {
    test(`${view}: the 44px touch handle drags a row below the next without page overflow`, async ({ page }) => {
      await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
      await handle(page, app.a.id).waitFor();
      const mobileIds = await ids(page);
      const rootIds = [app.a.id, app.b.id, app.c.id, app.d.id];
      const roots = ["tree", "table"].includes(view) ? mobileIds.filter((id) => rootIds.includes(id)) : mobileIds;
      const [first, second] = roots;
      await handle(page, first).scrollIntoViewIfNeeded();
      const fromBox = await handle(page, first).boundingBox(), toBox = await row(page, second).boundingBox();
      expect(fromBox.width >= 44 && fromBox.height >= 44, `Touch handle is at least 44px ${JSON.stringify(fromBox)}`).toBe(true);
      const cdp = await page.context().newCDPSession(page);
      const from = { x: fromBox.x + 22, y: fromBox.y + 22 }, to = { x: from.x, y: toBox.y + toBox.height * 0.8 };
      const touch = (type, p) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ ...p, id: 1, radiusX: 4, radiusY: 4 }] : [] });
      await touch("touchStart", from);
      for (let i = 1; i <= 10; i++) await touch("touchMove", { x: from.x, y: from.y + ((to.y - from.y) * i) / 10 });
      await page.locator(".task-reorder-ghost").waitFor();
      await touch("touchEnd");
      await settled(page);
      await cdp.detach();
      await page.waitForFunction(({ first, second }) => {
        const order = [...document.querySelectorAll("[data-task-order-row]")].map((r) => r.dataset.taskOrderRow);
        return order.indexOf(first) > order.indexOf(second);
      }, { first, second });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "View stays inside mobile viewport").toBe(true);
    });
  }
});
