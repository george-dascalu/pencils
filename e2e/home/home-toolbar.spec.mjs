import { defaultPanels } from '../../server/home.js';
import { test, expect, onDevices, useApp } from '../fixtures.mjs';
const app = useApp();
onDevices(['desktop', 'ipad', 'phone'], () => test('Home editing shares the top row and leaves no idle save label', async ({ page, device }) => {
  await page.request.patch(`${app.base}/api/home`, { data: { panels: defaultPanels() } });
  await page.goto(app.base);
  await page.locator('.home-grid').waitFor();
  const edit = page.locator('#home-edit');
  await expect(page.locator('#home-save')).toBeEmpty();
  const menu = await page.locator('.mobile-menu').boundingBox(), box = await edit.boundingBox();
  expect(Math.abs(menu.y + menu.height / 2 - box.y - box.height / 2)).toBeLessThan(4);
  expect(box.x).toBeLessThan(260);
  if (device !== 'phone') {
    await expect(page.locator('.topbar .breadcrumb #home-edit')).toBeVisible();
    expect(await page.locator('#view-toolbar').evaluate(el => el.getBoundingClientRect().height)).toBe(0);
  }
  await edit.click();
  expect(Math.abs((await edit.boundingBox()).x - box.x)).toBeLessThan(1);
  await expect(page.locator('.home')).toHaveAttribute('data-editing', '');
  await page.locator('[data-board-menu="home-add"] summary').click();
  await page.locator('[data-home-add="note"]').click();
  await expect(page.locator('.home-panel[data-type="note"]')).toBeVisible();
  await expect(page.locator('#home-save')).toBeEmpty();
  await expect(page.getByText('Saved automatically', { exact: true })).toHaveCount(0);
}));

test('Home keeps pending and failed save feedback through redraws and queued writes', async ({ page }) => {
  await page.request.patch(`${app.base}/api/home`, { data: { panels: defaultPanels() } });
  await page.goto(app.base); await page.locator('.home-grid').waitFor();
  const pending = [];
  await page.route('**/api/home', route => route.request().method() === 'PATCH' ? new Promise(resolve => pending.push({ route, resolve })) : route.continue());
  await page.locator('#home-edit').click();
  for (let i = 0; i < 2; i++) {
    await page.locator('[data-board-menu="home-add"] summary').click();
    await page.locator('[data-home-add="note"]').click();
  }
  await expect(page.locator('#home-save')).toHaveText('Saving…');
  await expect.poll(() => pending.length).toBe(1);
  await pending[0].route.continue(); pending[0].resolve();
  await expect.poll(() => pending.length).toBe(2);
  await expect(page.locator('#home-save')).toHaveText('Saving…');
  await pending[1].route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Try again later'})}); pending[1].resolve();
  await expect(page.locator('#home-save')).toHaveText('Could not save');
  await expect(page.locator('#toasts')).toContainText('Try again later');
});
