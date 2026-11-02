// Owner request, 2 November 2026: field groups use one text size and dividers
// must not replace a native status arrow with a filled square.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Field group text', key: 'FG' });
  const task = await store.createTask(project.id, { title: 'Grouped fields', assignee: 'George', status: 'todo', priority: 'high', start: '2026-11-01', due: '2026-11-12' });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: 'fields', type: 'task', task: task.id, x: 120, y: 100, w: 480, h: 240 }] });
  return { project, task, board };
});
const values = '.task-assignee, .field-chip-status, .canvas-task-status, .canvas-task-date, .due, .row-due';
onDevices(['desktop', 'ipad', 'phone'], () => test('grouped assignee, status and dates share their text size in every view @gate', async ({ page }) => {
  for (const view of ['list', 'tree', 'kanban', `board/${app.board.id}`]) {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    const boxes = page.locator('.field-box:visible');
    await expect(boxes.first()).toBeVisible();
    const sizes = await boxes.evaluateAll((boxes, values) => boxes.map(box => [...box.querySelectorAll(values)]
      .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
      .map(el => ({ field: el.className, size: getComputedStyle(el).fontSize }))).filter(fields => fields.length > 1), values);
    expect(sizes.length, view).toBeGreaterThan(0);
    for (const fields of sizes) expect(new Set(fields.map(field => field.size)).size, `${view}: ${JSON.stringify(fields)}`).toBe(1);
    if (view.startsWith('board')) {
      const status = page.locator('.canvas-task-status').first();
      const style = await status.evaluate(el => { const s = getComputedStyle(el); return { image: s.backgroundImage, size: s.backgroundSize, position: s.backgroundPosition, appearance: s.appearance, font: s.fontSize }; });
      expect(style.image).toContain('data:image/svg+xml');
      expect(style.image).not.toContain('linear-gradient');
      await status.click();
      await expect(page.locator('#shared-select-menu')).toBeVisible();
      await page.locator('#shared-select-menu').getByRole('option', { name: 'Done', exact: true }).click();
      await expect(status).toHaveValue('done');
    }
  }
}));
