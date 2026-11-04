// Owner request (F0.22-3): every field in the field box keeps a minimum width; a long date gives way
// before the status does, and the box stays inside its card (Week board, board and Calendar cards).
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const organisation = await store.createOrganisation({ title: 'Box team', people: [{ id: 'ann', name: 'Ann' }], teams: [{ id: 'team', name: 'Team', members: ['ann'] }] });
  const project = await store.createProject({ title: 'Box', key: 'BX', organisation: organisation.id, teams: ['team'] });
  const long = await store.createTask(project.id, { title: 'Long dates', assignee: 'Ann', status: 'in-progress', priority: 'high', start: '2026-11-05', due: '2026-11-20', start_time: '09:00', due_time: '13:30' });
  const timed = await store.createTask(project.id, { title: 'Timed', assignee: 'Ann', status: 'in-progress', priority: 'high', start: '2026-11-05', due: '2026-11-05', start_time: '09:00', due_time: '13:30' });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: 'card', type: 'task', task: long.id, x: 20, y: 40, w: 200, h: 240 }] });
  return { project, long, timed };
});
const widths = el => el.evaluate(box => {
  const w = e => e.getBoundingClientRect().width, kids = [...box.children].filter(c => c.getClientRects().length && !c.matches('.sr-only'));
  return { box: box.getBoundingClientRect(), kids: kids.map(c => ({ cls: c.className, w: w(c) })) };
});
// Board cards are zoomed to fit, so their minimums scale with the card. Each visible field keeps its minimum: the status and date 44px, the priority and assignee at least a control's width (28px).
async function expectMinimums(box, card, nominalWidth) {
  const { box: b, kids } = await widths(box), c = await card.boundingBox(), scale = nominalWidth ? c.width / nominalWidth : 1;
  expect(kids.length).toBeGreaterThan(2);
  for (const k of kids) {
    const min = /status/.test(k.cls) ? 44 : /due|dates/.test(k.cls) ? 44 : 28;
    expect(k.w, k.cls).toBeGreaterThanOrEqual(min * scale - 0.5);
  }
  expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 1);
}

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('a long date does not squeeze the status in a Week board card, a board card or a Calendar card', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
    await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
    await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
    const card = page.locator(`.week-board [data-calendar-card="${app.long.id}"]`);
    const fields = card.locator('.field-box').first();
    await expect(fields).toBeVisible();
    await expectMinimums(fields, card);
    // Text that does not fit is cut with an ellipsis, not mid-letter.
    for (const sel of ['.field-chip-status', '.row-due .due']) {
      const cut = await fields.locator(sel).first().evaluate(e => ({ over: getComputedStyle(e).textOverflow, display: getComputedStyle(e).display }));
      expect(cut, sel).toEqual({ over: 'ellipsis', display: 'block' });
    }
    expect(await fields.locator('.row-due .due').first().evaluate(e => e.scrollWidth > e.clientWidth), 'the long date is cut').toBe(true);
    await page.goto(`${app.base}/#project/${app.project.id}/board`);
    const node = page.locator('#canvas .board-node.task').first();
    await expect(node.locator('.live-card-state > .field-box')).toBeVisible();
    const nodeBox = node.locator('.live-card-state > .field-box');
    await expectMinimums(nodeBox, node, 200);
    expect(await nodeBox.evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length), 'the grid keeps all four columns').toBe(4);
    expect(await node.locator('.canvas-task-status').evaluate(e => getComputedStyle(e).textOverflow)).toBe('ellipsis');
  });

  test('a Calendar timed card keeps its status wide enough', async ({ page, device }) => {
    if (device === 'desktop') await page.setViewportSize({ width: 2400, height: 900 });
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
    await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
    await (await reveal(page.locator('#calendar-mode'))).selectOption('week');
    const card = page.locator(`.calendar-timed-card[data-id="${app.timed.id}"]`).first();
    await card.scrollIntoViewIfNeeded();
    const fields = card.locator('.calendar-event-fields');
    test.skip(!(await fields.isVisible()), 'the card is too small to show its fields');
    await expectMinimums(fields, card);
  });
});
