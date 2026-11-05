// Drawing on boards, split by tier (F0.22-21): the Boards gallery and the offline pad's board names
// fit the screen. Guards the owner requests in drawing-view.spec.mjs (the gallery where pending device
// changes send a board; offline names and save states that do not hide the next step).
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";
import { makeStroke } from "../../public/pen-model.js";

const app = useApp();
const gate = { tag: "@gate" };

// A project with a legacy Drawing board, the default board, and "Pencil sketch" holding a
// stroke, a note and a linked task.
async function seedProject() {
  const { store } = app;
  const project = await store.createProject({ title: "Drawing tests" });
  const legacy = await store.createBoard(project.id, { title: "Existing drawing" });
  await store.updateBoard(project.id, legacy.id, { revision: legacy.revision, settings: { drawing: true } });
  const linkedTask = await store.createTask(project.id, { title: "Linked task" });
  const created = await store.createBoard(project.id, { title: "Pencil sketch" });
  const stroke = makeStroke([220, 260, 300, 360].map((x, i) => ({ x, y: 200 + i * 25, pressure: 0.5, time: i * 10 })), { color: "#263c34", strokeWidth: 3, pressure: true }, "seed-stroke");
  const note = { id: "offline-note", type: "sticky", x: 600, y: 100, w: 200, h: 200, text: "Keep this note" };
  const sketch = await store.updateBoard(project.id, created.id, { revision: created.revision, nodes: [stroke, note], settings: { linked_tasks: [linkedTask.id] } });
  return { project, legacy, linkedTask, sketch, note };
}
// The gallery remains where pending device changes send a board, and at its address.
onDevices(["desktop", "phone"], (device) => test("the Boards gallery fits the screen and opens a board", device === "desktop" ? gate : {}, async ({ page }) => {
  const { project, legacy, sketch } = await seedProject();
  await page.goto(`${app.base}/#project/${project.id}/board/gallery`);
  await expect(page.locator(`[data-drawing-action="open"][data-id="${legacy.id}"]`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "the gallery fits the viewport").toBe(true);
  await page.locator(`[data-drawing-action="open"][data-id="${sketch.id}"]`).click();
  await page.locator("#canvas").waitFor();
}));

onDevices(['desktop', 'ipad', 'phone'], () => test('offline board names and save states fit without hiding the next step', gate, async ({ page }) => {
  const { project, sketch } = await seedProject();
  await app.store.updateBoard(project.id, sketch.id, { revision: sketch.revision, title: 'Unbroken'.repeat(20) });
  await page.goto(`${app.base}/#project/${project.id}/board/${sketch.id}`);
  await page.locator('#canvas').waitFor();
  await clickControl(page.locator('.board-toolbar [data-drawing-action="offline"]'));
  await expect(page.getByText('Offline drawing is ready.')).toBeVisible();
  await page.goto(`${app.base}/drawing-offline.html`);
  const row = page.locator('.local-document').filter({ has: page.locator(`[data-open$="/${sketch.id}"]`) });
  await expect(row).toContainText('Copy of server board');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await row.evaluate(el => getComputedStyle(el).flexWrap)).toBe('wrap');
  await row.getByRole('button').click();
  await expect(page.getByRole('button', { name: 'Export board file', exact: true })).toBeVisible();
  await expect(page.locator('[data-save]')).toHaveText('Copy of server board');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}));
