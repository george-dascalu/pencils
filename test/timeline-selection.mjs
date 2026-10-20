import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { timelineAxis } from "../public/timeline-dates.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-timeline-select-"));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: "Two click scheduling" });
const horizon = await store.createTask(project.id, { title: "Long task", start: "2026-10-19", due: "2026-11-20" });
const work = await store.createTask(project.id, { title: "Unplanned work" });
const other = await store.createTask(project.id, { title: "Another task" });
const source = await store.createTask(project.id, { title: "Source task", due: "2026-11-25" });
const file = store.file(project.id, "tasks", source.id), record = await store.read(file);
await store.write(file, { ...record.data, source: { provider: "jira", external_id: "one" } }, record.body, record);
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "timeline", type: "query", text: "Embedded timeline", x: 20, y: 20, w: 1200, h: 620, viewType: "timeline", timelineScale: "day", query: {} }], edges: [] });
await assert.rejects(store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ ...board.nodes[0], timelineRange: { start: "2026-12-01", end: "2026-11-01" } }] }), /valid timeline/);
const server = createServer(store); await new Promise(r => server.listen(0, "127.0.0.1", r));
const kind = process.env.BROWSER || "chromium", browser = await { chromium, firefox, webkit }[kind].launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, hasTouch: true });
page.setDefaultTimeout(10000);
const errors = []; page.on("pageerror", e => errors.push(e.message));
const base = `http://127.0.0.1:${server.address().port}`;
const track = id => page.locator(`[data-timeline-row="${id}"] [data-schedule-target]`);
const current = async id => (await store.snapshot(project.id)).tasks.find(t => t.id === id);
async function settle() {
  await page.waitForFunction(() => Object.keys(localStorage).filter(k => k.startsWith("pencils:pending:") && !k.endsWith(":lease")).every(k => !JSON.parse(localStorage.getItem(k) || "[]").length));
}
async function point(id, date) {
  const t = track(id), info = await t.evaluate(el => { const root = el.closest('[data-timeline]'); return { min:+root.dataset.min, unit:+root.dataset.unit, weekends:root.dataset.weekends!=="false" }; });
  const offset = timelineAxis(info.min, info.unit, info.weekends).x(date) + info.unit / 2;
  await t.evaluate((el,x) => { const scroll=el.closest('.timeline-scroll'); if(x>scroll.clientWidth-280) scroll.scrollLeft=x-(scroll.clientWidth-280)/2; }, offset);
  const b=await t.boundingBox(), width=await t.evaluate(el=>el.clientWidth), zoom=b.width/width;
  return { x:b.x+offset*zoom,y:b.y+b.height/2 };
}
async function tap(id,date) { const p=await point(id,date); await page.touchscreen.tap(p.x,p.y); }
async function waitDates(id,start,due) {
  await page.waitForFunction(({id,start,due})=>document.querySelector(`[data-timeline-task="${id}"]`)?.getAttribute('aria-valuetext')===`${start} to ${due}`,{id,start,due});
  await settle();assert.equal((await current(id)).start,start);assert.equal((await current(id)).due,due);
}
async function custom(start,end) {
  await page.locator('[data-timeline-range]').click();
  const panel=page.locator('#timeline-range-popover');
  await panel.getByLabel('Timeline start date',{exact:true}).fill(start);
  await panel.getByLabel('Timeline end date',{exact:true}).fill(end);
  await panel.getByRole('button',{name:'Apply range',exact:true}).click();
  await panel.waitFor({state:'detached'});
  await page.waitForFunction(({start,end})=>{const root=document.querySelector('[data-timeline]');return root?.dataset.rangeStart===start&&root?.dataset.rangeEnd===end;},{start,end});
}
try {
  await page.goto(`${base}/#project/${project.id}/timeline`);
  await page.locator('[data-timeline-scale]').selectOption('day');
  await tap(work.id,'2026-10-21');
  await page.locator('.timeline-range-preview').waitFor();
  assert.equal((await current(work.id)).start,undefined,'First click does not save a partial schedule');
  assert.equal(await page.locator('#task-dates-popover,#task-form').count(),0);
  await tap(work.id,'2026-10-24');await waitDates(work.id,'2026-10-21','2026-10-24');
  // Explicit picking mode can replace dates even when a bar covers the whole row.
  await page.locator(`[data-task-dates="${horizon.id}"]`).click();
  await page.getByRole('button',{name:'Choose on timeline',exact:true}).click();
  await tap(horizon.id,'2026-10-19');await tap(horizon.id,'2026-11-20');
  await waitDates(horizon.id,'2026-10-19','2026-11-20');
  await page.locator('.timeline-scroll').evaluate(el=>el.scrollLeft=0);
  await tap(other.id,'2026-10-22');await page.keyboard.press('Escape');
  assert.equal(await page.locator('.timeline-range-preview').count(),0);
  assert.equal((await current(other.id)).due,null);
  await tap(other.id,'2026-10-22');await page.locator('[data-timeline-range]').click();
  assert.equal(await page.locator('.timeline-range-preview').count(),0,'Other controls cancel unapplied selection');
  await page.locator('[data-range-close]').click();
  await tap(other.id,'2026-10-22');await tap(other.id,'2026-10-20');
  assert.match(await page.locator('.timeline-hint').textContent(),/on or after/);
  assert.equal((await current(other.id)).start,undefined);
  await tap(other.id,'2026-10-22');await waitDates(other.id,'2026-10-22','2026-10-22');
  // Start/end selection stays keyboard accessible; sourced due dates remain protected.
  await track(other.id).focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  await waitDates(other.id,'2026-10-19','2026-10-21');
  const imported=await current(source.id);await tap(source.id,'2026-10-23');await tap(source.id,'2026-10-26');
  assert.deepEqual(await current(source.id),imported);
  const beforeRange=(await store.snapshot(project.id)).tasks;
  await custom('2026-10-20','2026-10-27');
  await page.waitForTimeout(80);
  const full=page.locator(`[data-timeline-task="${horizon.id}"]`), outside=page.locator(`[data-timeline-row="${source.id}"] .timeline-outside`);
  assert.equal(await full.evaluate(el=>el.classList.contains('clipped-start')&&el.classList.contains('clipped-end')),true);
  assert.equal(await outside.textContent(),'Outside range');assert.ok(await outside.isVisible());
  assert.deepEqual((await store.snapshot(project.id)).tasks,beforeRange);
  assert.ok(await page.locator('.timeline-ruler').evaluate(el=>[...el.querySelectorAll('[data-date]')].every(e=>e.dataset.date<='2026-10-27')));
  // Ranges stretch to fill the component without extending the last date.
  const geometry=await page.locator('[data-timeline]').evaluate(el=>({unit:+el.dataset.unit,width:el.querySelector('.timeline-ruler').clientWidth}));
  assert.ok(Math.abs(geometry.unit*8-geometry.width)<1);
  await Promise.all([page.waitForEvent('domcontentloaded'),page.evaluate(()=>location.reload())]);
  await page.locator('[data-range-end="2026-10-27"]').waitFor();
  // The existing bar editor and drags stay available with custom geometry.
  const moveBar=page.locator(`[data-timeline-task="${work.id}"]`), box=await moveBar.boundingBox();
  const unit=await page.locator('[data-timeline]').evaluate(el=>+el.dataset.unit);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+unit,box.y+box.height/2,{steps:6});await page.mouse.up();
  await waitDates(work.id,'2026-10-22','2026-10-25');
  await page.locator('[data-timeline-weekends]').uncheck();
  await track(other.id).focus();await page.keyboard.press('Enter');
  for(let i=0;i<5;i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');await waitDates(other.id,'2026-10-20','2026-10-27');
  // Invalid bounds remain editable and never alter the timeline.
  await page.locator('[data-timeline-range]').click();
  const panel=page.locator('#timeline-range-popover');
  await panel.getByLabel('Timeline start date',{exact:true}).fill('2026-11-01');
  await panel.getByRole('button',{name:'Apply range',exact:true}).click();
  assert.match(await panel.locator('.form-error').textContent(),/on or after/);
  await page.keyboard.press('Escape');
  for(const width of [1500,390]) {
    await page.setViewportSize({width,height:844});
    for(const theme of ['light','dark']) {
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.locator('[data-timeline-range]').click();
      const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y+box.height<=844);
      await panel.getByRole('button',{name:'Choose Timeline start date',exact:true}).click();
      await page.locator('#shared-date-picker').waitFor();await page.keyboard.press('Escape');
      await page.screenshot({path:`/tmp/pencils-timeline-selection-${kind}-${width}-${theme}.png`});
      await panel.getByRole('button',{name:'Close timeline range'}).click();
    }
  }
  await page.setViewportSize({width:1500,height:1000});
  // Hidden-weekend-only range cannot schedule an invisible Monday outside it.
  const prior=(await store.snapshot(project.id)).tasks;
  await custom('2026-10-24','2026-10-25');
  await track(other.id).focus();await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  assert.deepEqual((await store.snapshot(project.id)).tasks,prior);
  assert.equal(await page.locator('.timeline-range-preview').count(),0);
  await page.locator('[data-timeline-range]').click();await panel.getByRole('button',{name:'Automatic range',exact:true}).click();
  await page.locator('[data-range-end=""]').waitFor();
  // Embedded ranges persist with their own node; selecting dates preserves the board camera.
  await page.goto(`${base}/#project/${project.id}/board/${board.id}`);
  await page.locator('[data-timeline="timeline"]').waitFor();
  await custom('2026-10-19','2026-10-30');await settle();
  assert.deepEqual((await store.snapshot(project.id)).boards.find(b=>b.id===board.id).nodes[0].timelineRange,{start:'2026-10-19',end:'2026-10-30'});
  const camera=await page.locator('#canvas-world').getAttribute('style');
  await tap(work.id,'2026-10-26');await tap(work.id,'2026-10-29');await waitDates(work.id,'2026-10-26','2026-10-29');
  assert.equal(await page.locator('#canvas-world').getAttribute('style'),camera);
  assert.equal(await page.locator('#task-form,dialog[open]').count(),0);
  assert.deepEqual(errors,[]);
  console.log(`PASS (${kind}): two-click/tap scheduling, keyboard, cancellation, inclusive and invalid bounds, source protection, custom range clipping/fill/reload/reset, hidden weekends, mobile themes/calendar and embedded Board range/date persistence.`);
} finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await store.queue;await fs.rm(root,{recursive:true,force:true});}
