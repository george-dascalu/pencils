import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { selectProjectView } from "./menu-controls.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-task-reorder-"));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: "Reorder tasks" });
const a = await store.createTask(project.id, { title: "Alpha", order: 0 });
const b = await store.createTask(project.id, { title: "Beta", order: 1024 });
const c = await store.createTask(project.id, { title: "Charlie", order: 2048, status: "backlog" });
const d = await store.createTask(project.id, { title: "Delta", order: 3072 });
const child = await store.createTask(project.id, { title: "Alpha child", parent: a.id, order: 4096 });
const child2 = await store.createTask(project.id, { title: "Alpha second child", parent: a.id, order: 5120 });
const archived = await store.createTask(project.id, { title: "Archived", archived: true, order: 6144 });
const sourceFile = store.file(project.id, "tasks", d.id), sourceRecord = await store.read(sourceFile);
await store.write(sourceFile, { ...sourceRecord.data, source: { provider: "jira", external_id: "one", key: "JIRA-1" } }, sourceRecord.body, sourceRecord);
const longProject = await store.createProject({ title: "Long manual order" });
const many = [];
for (let i=0; i<105; i++) many.push(await store.createTask(longProject.id, { title: `Task ${String(i).padStart(3,"0")}`, order:i*1024 }));
const server = createServer(store); await new Promise(r => server.listen(0, "127.0.0.1", r));
const kind = process.env.BROWSER || "chromium";
const browser = await ({ chromium, firefox, webkit }[kind]).launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.setDefaultTimeout(10000);
const errors = []; page.on("pageerror", e => errors.push(e.message));
const base = `http://127.0.0.1:${server.address().port}`;
const ids = p => p.locator("#view-content [data-task-order-row]").evaluateAll(rows => rows.map(r => r.dataset.taskOrderRow));
const handle = (id, p = page) => p.locator(`[data-task-reorder="${id}"]`);
const row = (id, p = page) => p.locator(`#view-content [data-task-order-row="${id}"]`);
const snapshot = async () => (await (await fetch(`${base}/api/projects/${project.id}`)).json()).tasks;
async function settled(p = page) {
  await p.waitForFunction(() => Object.keys(localStorage).filter(k => k.startsWith("pencils:pending:") && !k.endsWith(":lease")).every(k => !JSON.parse(localStorage.getItem(k) || "[]").length));
}
async function waitOrder(expected, p = page) {
  try {
    await p.waitForFunction(value => JSON.stringify([...document.querySelectorAll("#view-content [data-task-order-row]")].map(r => r.dataset.taskOrderRow)) === JSON.stringify(value), expected);
  } catch (error) {
    console.error({ expected, actual: await ids(p), history: await p.evaluate(() => history.state), saved: await snapshot() });
    throw error;
  }
}
async function start(id, p = page) {
  await handle(id, p).scrollIntoViewIfNeeded();
  const b = await handle(id, p).boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 8, { steps: 3 });
  await p.locator(".task-reorder-ghost").waitFor();
}
async function drag(id, target, after = false, p = page) {
  await start(id, p);
  const b = await row(target, p).boundingBox();
  await p.mouse.move(b.x + 25, b.y + b.height * (after ? .8 : .2), { steps: 12 });
  await p.mouse.up(); await settled(p);
}
async function key(id, direction, p = page) {
  await handle(id, p).focus(); await p.keyboard.press(`Alt+Arrow${direction}`); await settled(p);
}
async function reload() {
  await Promise.all([page.waitForEvent("domcontentloaded"), page.evaluate(() => location.reload())]);
}
try {
  await page.goto(`${base}/#project/${project.id}/table`);
  await handle(a.id).waitFor();
  await page.locator('[data-table-sort-column="title"]').click();
  const before = await ids(page), expected = before.filter(id => id !== d.id); expected.splice(0, 0, d.id);
  await drag(d.id, before[0]);
  await waitOrder(expected);
  assert.equal(await page.locator('.spreadsheet th[aria-sort="ascending"]').count(), 0, "Explicit sorts clear for manual order");
  assert.equal(await handle(d.id).evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator("#task-form").count(), 0, "Dropping does not open the editor");
  await reload(); await waitOrder(expected);
  const persisted = (await snapshot()).filter(t => !t.archived).sort((a,b) => a.order - b.order).map(t => t.id);
  assert.deepEqual(persisted.filter(id => ![child.id, child2.id].includes(id)), expected.filter(id => ![child.id, child2.id].includes(id)), "Root order persists while descendants remain with their family in the table");
  assert.equal((await snapshot()).find(t => t.id === d.id).title, "Delta", "Source tasks can be locally ordered without editing remote fields");
  // Cancellation, ordinary editing and row selection remain independent.
  await start(a.id); await page.keyboard.press("Escape"); await page.mouse.up(); await waitOrder(expected);
  await start(a.id); await page.mouse.move(5, 5); await page.mouse.up(); await waitOrder(expected);
  await row(b.id).locator('[data-row-select]').check();
  assert.match(await page.locator('#grid-selection-count').textContent(), /1 selected/);
  await row(b.id).locator('input[data-task-field="title"]').fill("Beta edited");
  await row(b.id).locator('input[data-task-field="title"]').press("Tab");
  await settled();
  // Filtered order preserves every hidden task's relative position.
  const hiddenBefore = (await snapshot()).filter(t => !t.title.startsWith("Alpha")).sort((a,b) => a.order-b.order).map(t=>t.id);
  await page.locator("#search").fill("Alpha");
  const filtered = await ids(page); await drag(filtered.at(-1), filtered[1]);
  const filteredExpected = [filtered[0], filtered.at(-1), ...filtered.slice(1,-1)];
  await waitOrder(filteredExpected);
  const hiddenAfter = (await snapshot()).filter(t => !t.title.startsWith("Alpha")).sort((a,b) => a.order-b.order).map(t=>t.id);
  assert.deepEqual(hiddenAfter, hiddenBefore);
  await page.locator("#search").fill("");
  await selectProjectView(page, "tree");
  // Move siblings, then a parent with its descendants. Do not reparent by drag.
  await key(child.id, "Up");
  let tree = await ids(page); assert.equal(tree.indexOf(child.id), tree.indexOf(a.id) + 1);
  await key(a.id, "Down");
  tree = await ids(page); assert.equal(tree.indexOf(child.id), tree.indexOf(a.id) + 1);
  assert.equal(tree.indexOf(child2.id), tree.indexOf(a.id) + 2);
  await start(child.id); const nonSibling = await row(b.id).boundingBox();
  await page.mouse.move(nonSibling.x + 25, nonSibling.y + 10); await page.mouse.up();
  await waitOrder(tree);
  assert.equal((await snapshot()).find(t=>t.id === child.id).parent, a.id);
  await row(a.id).locator('.tree-toggle').click();
  await key(a.id, "Up"); await row(a.id).locator('.tree-toggle').click();
  assert.equal((await ids(page)).indexOf(child.id), (await ids(page)).indexOf(a.id)+1);
  // List allows crossing groups without changing task status, then keeps this layout on reload.
  await selectProjectView(page, "list");
  const status = (await snapshot()).find(t=>t.id===c.id).status;
  await drag(c.id, d.id, true);
  assert.equal(await page.locator('.list-group').count(), 1);
  assert.equal((await snapshot()).find(t=>t.id===c.id).status, status);
  const list = await ids(page); assert.equal(list.indexOf(c.id), list.indexOf(d.id)+1);
  await reload(); await waitOrder(list);
  await key(c.id, "Up");
  assert.ok(await handle(c.id).evaluate(el => el === document.activeElement));
  await selectProjectView(page, "table");
  await page.locator('[data-board-menu="table-groups"] > summary').click();
  await page.locator('[data-table-group="0"]').selectOption("status");
  await page.keyboard.press("Escape");
  await drag(c.id, b.id, true);
  assert.equal(await page.locator('.table-group-row').count(), 0, "Cross-group table drop clears grouping");
  assert.equal((await ids(page)).indexOf(c.id), (await ids(page)).indexOf(b.id)+1);
  // Desktop and narrow layouts keep a dedicated touch target, no page overflow.
  for (const view of ["list", "tree", "table"]) {
    await selectProjectView(page, view);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(t => document.documentElement.dataset.theme=t, theme);
      await page.screenshot({ path: `/tmp/pencils-task-order-${kind}-${view}-${theme}.png` });
    }
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const mobile = await context.newPage(); mobile.on('pageerror', e => errors.push(e.message));
  for (const view of ["table", "list", "tree"]) {
    await mobile.goto(`${base}/#project/${project.id}/${view}`);
    await handle(a.id, mobile).waitFor();
    const mobileIds = await ids(mobile);
    const roots = ["tree", "table"].includes(view) ? mobileIds.filter(id => [a.id,b.id,c.id,d.id].includes(id)) : mobileIds;
    const first = roots[0], second = roots[1];
    await handle(first, mobile).scrollIntoViewIfNeeded();
    const fromBox = await handle(first, mobile).boundingBox(), toBox = await row(second, mobile).boundingBox();
    assert.ok(fromBox.width >= 44 && fromBox.height >= 44, "Touch handle is at least 44px");
    if (kind === "chromium") {
      const cdp = await context.newCDPSession(mobile);
      const from = { x: fromBox.x + 22, y: fromBox.y + 22 }, to = { x: from.x, y: toBox.y + toBox.height * .8 };
      const touch = (type, p) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ ...p, id:1, radiusX:4, radiusY:4 }] : [] });
      await touch("touchStart", from);
      for(let i=1;i<=10;i++) await touch("touchMove", { x: from.x, y: from.y+(to.y-from.y)*i/10 });
      await mobile.locator('.task-reorder-ghost').waitFor(); await touch("touchEnd");
      await settled(mobile);
      await cdp.detach();
    } else await drag(first, second, true, mobile);
    await mobile.waitForFunction(({first,second}) => {
      const ids=[...document.querySelectorAll('[data-task-order-row]')].map(r=>r.dataset.taskOrderRow);
      return ids.indexOf(first)>ids.indexOf(second);
    }, { first, second });
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), "View stays inside mobile viewport");
    await mobile.screenshot({ path:`/tmp/pencils-task-order-${kind}-${view}-mobile.png` });
  }
  await context.close();
  // Full project ordering keeps off-page rows stable and supports edge scrolling.
  await page.goto(`${base}/#project/${longProject.id}/table`);
  await handle(many[0].id).waitFor();
  await page.locator('[data-feature="page-next"]').click();
  await drag(many[104].id, many[100].id);
  await waitOrder([many[104].id, ...many.slice(100,104).map(t=>t.id)]);
  const longSaved = (await (await fetch(`${base}/api/projects/${longProject.id}`)).json()).tasks.sort((a,b)=>a.order-b.order);
  assert.deepEqual(longSaved.slice(0,100).map(t=>t.id), many.slice(0,100).map(t=>t.id));
  await page.locator('[data-feature="page-prev"]').click();
  await start(many[0].id);
  const scrollBox = await page.locator('.table-scroll').boundingBox();
  await page.mouse.move(scrollBox.x+25, scrollBox.y+scrollBox.height-15);
  await page.waitForFunction(()=>document.querySelector('.table-scroll').scrollTop>150);
  await page.keyboard.press('Escape'); await page.mouse.up();
  const unchanged = (await (await fetch(`${base}/api/projects/${longProject.id}`)).json()).tasks.sort((a,b)=>a.order-b.order);
  assert.deepEqual(unchanged.map(t=>t.id),longSaved.map(t=>t.id));
  assert.deepEqual(errors, []);
  console.log(`PASS (${kind}): task row drag, saved manual order, sorting, filters, hierarchy, collapsed branches, cross-group moves, keyboard, cancellation, editing/selection, light/dark and mobile touch.`);
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(r=>server.close(r));
  await store.queue; await fs.rm(root, { recursive:true, force:true });
}
