// Owner request (F0.21-70): a field box with fields turned off covers only the fields it shows.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp();
let count = 0;
async function seed(off) {
  const project = await app.store.createProject({ title: `Fit ${++count}`, key: `FIT${count}` });
  const { project: p } = await app.store.snapshot(project.id);
  await app.store.updateProject(project.id, { revision: p.revision, schema: { ...p.schema, off } });
  const short = await app.store.createTask(project.id, { title: 'Short', due: '2026-11-04' });
  await app.store.createTask(project.id, { title: 'Longer range', start: '2026-11-04', due: '2026-11-07' });
  return { ...project, card: short.id };
}
// Each visible field's width and the box's, for every row's box.
const measure = locator => locator.evaluateAll(boxes => boxes.map(box => {
  const shown = [...box.children].filter(el => el.getClientRects().length && getComputedStyle(el).position !== 'absolute');
  return { box: box.getBoundingClientRect().width, fields: shown.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0), count: shown.length };
}));

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('field boxes shrink to the fields a project shows, and line up across rows @gate', async ({ page, device }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
    const full = await seed([]), dateOnly = await seed(['assignee', 'status', 'priority']), twoFields = await seed(['assignee', 'priority']);
    const widths = {};
    for (const [name, project] of [['full', full], ['date', dateOnly], ['two', twoFields]]) {
      await page.goto(`${app.base}/#project/${project.id}/calendar`);
      await (await reveal(page.locator('#calendar-mode'))).selectOption('agenda');
      if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
      // Every project has two cards: wait for this one's, not the last project's rows.
      await expect(page.locator(`.calendar-agenda [data-calendar-card="${project.card}"]`)).toBeVisible();
      const boxes = page.locator('.calendar-agenda .agenda-fields');
      await expect(boxes).toHaveCount(2);
      const rows = await measure(boxes);
      expect(new Set(rows.map(r => Math.round(r.box))).size, 'boxes line up').toBe(1);
      for (const r of rows) expect(Math.abs(r.box - r.fields), 'the box is as wide as its fields').toBeLessThanOrEqual(4);
      widths[name] = rows[0].box;
    }
    expect(widths.date).toBeLessThan(widths.two);
    expect(widths.two).toBeLessThan(widths.full);
    // List rows (phone summaries on phones) follow the same rule.
    const list = {};
    for (const [name, project] of [['full', full], ['date', dateOnly], ['two', twoFields]]) {
      await page.goto(`${app.base}/#project/${project.id}/list`);
      await expect(page.locator(`#view-content [data-task-order-row="${project.card}"]`)).toBeVisible();
      const boxes = page.locator(device === 'phone' ? '#view-content .phone-task-fields' : '#view-content .task-row > .row-fields');
      await expect(boxes).toHaveCount(2);
      const rows = await measure(boxes);
      expect(new Set(rows.map(r => Math.round(r.box))).size, 'List boxes line up').toBe(1);
      for (const r of rows) expect(Math.abs(r.box - r.fields), 'the List box is as wide as its fields').toBeLessThanOrEqual(4);
      list[name] = rows[0].box;
    }
    expect(list.date).toBeLessThan(list.two);
    expect(list.two).toBeLessThan(list.full);
  });
});
