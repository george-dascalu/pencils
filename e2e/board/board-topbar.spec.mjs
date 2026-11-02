import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { selectProjectView, clickControl } from '../helpers/menu-controls.mjs';

const app = useApp(async store => ({ project: await store.createProject({ title: 'Board header' }) }));

onDevices(['desktop', 'narrow', 'ipad', 'phone'], () => test('board actions share the desktop header and retain their touch homes', { tag: '@gate' }, async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  const desktop = ['desktop', 'narrow'].includes(device);
  const bar = page.locator('.board-toolbar');
  await expect(bar.locator('#canvas-presence')).toBeVisible();
  await expect(page.locator('.board-toolbar')).toHaveCount(1);
  await expect(bar).toHaveCSS('flex-wrap', desktop ? 'nowrap' : 'wrap');
  expect(await bar.evaluate(el => !!el.closest('.topbar .top-actions'))).toBe(desktop);
  if (desktop) {
    await expect(page.locator('#view-toolbar')).toHaveCSS('display', 'none');
    const [header, nav, actions, canvas] = await Promise.all(['.topbar', '.board-project-tools', '.board-toolbar', '#canvas'].map(s => page.locator(s).boundingBox()));
    expect(actions.x).toBeGreaterThanOrEqual(nav.x + nav.width);
    expect(actions.y).toBeGreaterThanOrEqual(header.y);
    expect(actions.y + actions.height).toBeLessThanOrEqual(header.y + header.height);
    expect(canvas.y).toBeCloseTo(header.y + header.height, 0);
    const order = await bar.locator(':scope > #canvas-presence, :scope > #expanded-board-settings, :scope > [data-board-menu="tools"]').evaluateAll(els => els.map(el => el.id || 'tools'));
    expect(order).toEqual(['canvas-presence', 'expanded-board-settings', 'tools']);
  }
  await bar.getByLabel('Board tools', { exact: true }).click();
  await expect(bar.getByRole('button', { name: 'Present', exact: true })).toBeVisible();
  const menu = await bar.locator('.board-menu-panel').boundingBox();
  expect(menu.x + menu.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.keyboard.press('Escape');
  await clickControl(page.getByRole('button', { name: 'Board appearance', exact: true, includeHidden: true }));
  await expect(page.getByRole('dialog', { name: 'Board appearance', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close board appearance', exact: true }).click();
  await selectProjectView(page, 'list');
  await expect(bar).toHaveCount(0);
  await selectProjectView(page, 'board');
  await expect(page.locator('#canvas-presence')).toHaveCount(1);
  await expect(bar).toBeVisible();
  if (desktop) await expect(page.locator('#view-toolbar')).toBeHidden();
}));
